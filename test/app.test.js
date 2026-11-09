const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { WebSocket } = require('ws');

console.log('🧪 Starting LocalDrop LAN Test Suite...\n');

let passedTests = 0;
let failedTests = 0;

function it(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ ${name}`);
      passedTests++;
    })
    .catch((err) => {
      console.error(`  ❌ ${name}`);
      console.error(`     Error: ${err.message}`);
      failedTests++;
    });
}

async function runTests() {
  // 1. Version Consistency Tests
  console.log('📦 Section 1: Version Consistency');
  await it('package.json has version 1.0.1', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, '1.0.1');
  });

  await it('installer.iss has version 1.0.1', () => {
    const iss = fs.readFileSync(path.join(__dirname, '..', 'installer.iss'), 'utf8');
    assert.ok(iss.includes('#define MyAppVersion "1.0.1"'), 'installer.iss must define MyAppVersion "1.0.1"');
  });

  await it('installer.iss uses portable relative paths', () => {
    const iss = fs.readFileSync(path.join(__dirname, '..', 'installer.iss'), 'utf8');
    assert.ok(!iss.toLowerCase().includes('e:\\'), 'installer.iss must not hardcode local drive e:');
    assert.ok(iss.includes('OutputDir=dist'), 'installer.iss OutputDir must be relative dist');
    assert.ok(iss.includes('Source: "LocalDrop-LAN.exe"'), 'installer.iss Source must be relative LocalDrop-LAN.exe');
  });

  await it('server.js defines APP_VERSION = "1.0.1"', () => {
    const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(serverCode.includes("APP_VERSION = '1.0.1'"), 'server.js must define APP_VERSION = 1.0.1');
  });

  await it('public/app.js defines APP_VERSION = "1.0.1"', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appCode.includes("APP_VERSION = '1.0.1'"), 'public/app.js must define APP_VERSION = 1.0.1');
  });

  await it('public/app.js handles speedMbps safely without throwing TypeError', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(appCode.includes("typeof speedMbps === 'number'"), 'updateTransferProgress must guard against non-number speed values');
    assert.ok(!appCode.includes('speed.textContent = `${speedMbps.toFixed('), 'must not call speedMbps.toFixed directly without type checking');
  });

  // 2. Syntax and Asset Integrity
  console.log('\n🎨 Section 2: UI Asset Integrity & Apple Glass Styles');
  await it('index.html contains Apple Glass and visionOS animation classes', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(html.includes('apple-glass'), 'index.html must contain apple-glass class');
    assert.ok(html.includes('radar-sweep'), 'index.html must contain radar-sweep class');
    assert.ok(html.includes('radar-wave'), 'index.html must contain radar-wave class');
    assert.ok(html.includes('updateModal'), 'index.html must contain updateModal');
    assert.ok(html.includes('howToUseModal'), 'index.html must contain howToUseModal');
    assert.ok(html.includes('howToUseBtn'), 'index.html must contain howToUseBtn');
    assert.ok(html.includes('updateAvailableBadge'), 'index.html must contain updateAvailableBadge');
    assert.ok(html.includes('app.js?v=1.0.1'), 'index.html must reference app.js?v=1.0.1');
  });

  // 3. Server Integration Tests
  console.log('\n🌐 Section 3: REST API & Static Serving Integration');

  // Helper for HTTP requests
  function makeRequest(port, reqPath, options = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method: options.method || 'GET',
        headers: options.headers || {}
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      });
      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  function checkHeaders(port, reqPath) {
    return new Promise((resolve) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: reqPath, method: 'GET' }, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
        req.destroy();
      });
      req.on('error', () => {});
      req.end();
    });
  }

  // Spin up isolated test server on port 8188
  const testPort = 8188;
  process.env.PORT = '8188';
  process.env.HTTPS_PORT = '8488';
  delete require.cache[require.resolve('../server.js')];
  require('../server.js');
  await new Promise(r => setTimeout(r, 1200));

  await it(`GET /api/info returns version 1.0.1 on port ${testPort}`, async () => {
    const res = await makeRequest(testPort, '/api/info');
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.version, '1.0.1');
    assert.ok(Array.isArray(json.ips), 'ips must be an array');
    assert.ok(json.hostname, 'hostname must be present');
  });

  await it('GET /api/check-update returns valid update payload structure', async () => {
    const res = await makeRequest(testPort, '/api/check-update');
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.currentVersion, '1.0.1');
    assert.strictEqual(typeof json.updateAvailable, 'boolean');
  });

  await it('GET / serves HTML with no-cache headers', async () => {
    const res = await makeRequest(testPort, '/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('LocalDrop LAN'), 'Response must contain title');
    const cc = res.headers['cache-control'] || '';
    assert.ok(cc.includes('no-store') || cc.includes('no-cache'), 'Headers must prevent caching');
  });

  await it('GET /app.js serves JavaScript bundle', async () => {
    const res = await makeRequest(testPort, '/app.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('LocalDrop LAN'), 'Response must contain app bundle');
  });

  // 4. File Transfer API Lifecycle
  console.log('\n⚡ Section 4: Streaming Transfer Session Lifecycle');
  const testFileId = 'test_' + Math.random().toString(36).substring(2, 8);

  await it('POST /api/transfer/create registers active stream transfer', async () => {
    const res = await makeRequest(testPort, '/api/transfer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        fileId: testFileId,
        senderPeerId: 'peer_sender',
        targetPeerId: 'peer_receiver',
        name: 'test-document.pdf',
        size: 1048576,
        isFolder: false,
        fileCount: 1
      }
    });
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.fileId, testFileId);
  });

  await it('GET /api/transfer/download/:fileId sends safe MIME type and anti-sniff headers', async () => {
    const res = await checkHeaders(testPort, `/api/transfer/download/${testFileId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['content-type'], 'application/pdf');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-download-options'], 'noopen');
    assert.ok(res.headers['content-disposition'].includes('test-document.pdf'));
  });

  await it('POST /api/transfer/cancel cancels transfer cleanly', async () => {
    const res = await makeRequest(testPort, `/api/transfer/cancel/${testFileId}`, {
      method: 'POST'
    });
    assert.strictEqual(res.status, 200);
    const json = JSON.parse(res.body);
    assert.strictEqual(json.success, true);
  });

  // 5. WebSocket Signaling Tests
  console.log('\n🔌 Section 5: Real-time WebSocket Signaling & Identity');
  await it('WebSocket connection receives identity and handles ping/pong', async () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${testPort}`);
      let receivedIdentity = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'ping' }));
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'identity') {
            assert.ok(msg.peerId, 'Identity must have peerId');
            assert.ok(msg.deviceName, 'Identity must have deviceName');
            receivedIdentity = true;
          }
          if (msg.type === 'pong') {
            assert.strictEqual(receivedIdentity, true);
            ws.close();
            resolve();
          }
        } catch (e) {
          ws.close();
          reject(e);
        }
      });

      ws.on('error', reject);
    });
  });

  // Summary
  console.log('\n========================================');
  console.log(`🏁 Test Results: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
