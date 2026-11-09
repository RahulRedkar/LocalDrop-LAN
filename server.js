const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const { Bonjour } = require('bonjour-service');
const selfsigned = require('selfsigned');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
app.use(express.json({ limit: '20mb' }));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const MDNS_HOST = 'filetrans.local';
const APP_VERSION = '1.0.1';
const GITHUB_REPO = 'RahulRedkar/LocalDrop-LAN';

let httpsServer = null;
let wssHttps = null;

// Initialize mDNS / Bonjour Discovery Service
const bonjour = new Bonjour();

try {
  bonjour.publish({
    name: 'LocalDrop LAN File Transfer',
    type: 'http',
    port: PORT,
    host: MDNS_HOST,
    txt: { path: '/' }
  });
} catch (err) {
  console.warn('⚠️ mDNS service initialization notice:', err.message);
}

// Graceful cleanup on exit
function cleanup() {
  try {
    bonjour.unpublishAll();
    bonjour.destroy();
  } catch (_) {}
  if (server) try { server.close(); } catch (_) {}
  if (httpsServer) try { httpsServer.close(); } catch (_) {}
  process.exit();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Serve static assets from public/ (embedded snapshot or local directory) with no-cache headers
const publicDir = fs.existsSync(path.join(process.cwd(), 'public'))
  ? path.join(process.cwd(), 'public')
  : path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Helper: Get local IPv4 addresses
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const ifaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[ifaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// REST API for network info & version
app.get('/api/info', (req, res) => {
  res.json({
    version: APP_VERSION,
    hostname: os.hostname(),
    ips: getLocalIPAddresses(),
    port: PORT,
    httpsPort: HTTPS_PORT,
    mdnsHost: MDNS_HOST
  });
});

// Cache for GitHub update check (10 minutes)
let updateCache = {
  lastChecked: 0,
  data: null
};

function compareSemver(v1, v2) {
  const parse = v => (v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function checkRawPackageJson() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'raw.githubusercontent.com',
      path: `/${GITHUB_REPO}/main/package.json`,
      headers: { 'User-Agent': `LocalDrop-LAN/${APP_VERSION}` },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const pkg = JSON.parse(rawData);
            const latestVersion = (pkg.version || '').trim();
            const updateAvailable = compareSemver(latestVersion, APP_VERSION) > 0;
            const result = {
              currentVersion: APP_VERSION,
              latestVersion: latestVersion || APP_VERSION,
              updateAvailable,
              releaseName: `Version ${latestVersion}`,
              releaseNotes: 'UI changes',
              releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
              installerUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/LocalDrop-LAN-Setup.exe`,
              zipUrl: `https://github.com/${GITHUB_REPO}/releases/latest/download/LocalDrop-LAN-Setup.zip`,
              publishedAt: new Date().toISOString()
            };
            updateCache = { lastChecked: Date.now(), data: result };
            return resolve(result);
          }
        } catch (_) {}
        resolve({
          currentVersion: APP_VERSION,
          latestVersion: APP_VERSION,
          updateAvailable: false,
          offline: true
        });
      });
    });

    req.on('error', () => {
      resolve({
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        offline: true
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        offline: true
      });
    });
  });
}

async function fetchLatestGitHubVersion() {
  const now = Date.now();
  if (updateCache.data && now - updateCache.lastChecked < 10 * 60 * 1000) {
    return updateCache.data;
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/releases/latest`,
      headers: {
        'User-Agent': `LocalDrop-LAN/${APP_VERSION}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(rawData);
            const tag = (json.tag_name || json.name || '').trim();
            const latestVersion = tag.replace(/^v/, '');
            const updateAvailable = compareSemver(latestVersion, APP_VERSION) > 0;

            let installerUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/LocalDrop-LAN-Setup.exe`;
            let zipUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/LocalDrop-LAN-Setup.zip`;
            if (Array.isArray(json.assets)) {
              const setupAsset = json.assets.find(a => a.name && a.name.endsWith('.exe'));
              if (setupAsset && setupAsset.browser_download_url) {
                installerUrl = setupAsset.browser_download_url;
              }
              const zipAsset = json.assets.find(a => a.name && a.name.endsWith('.zip'));
              if (zipAsset && zipAsset.browser_download_url) {
                zipUrl = zipAsset.browser_download_url;
              }
            }

            const result = {
              currentVersion: APP_VERSION,
              latestVersion: latestVersion || APP_VERSION,
              updateAvailable,
              releaseName: json.name || tag,
              releaseNotes: json.body || 'New features and improvements.',
              releaseUrl: json.html_url || `https://github.com/${GITHUB_REPO}/releases`,
              installerUrl,
              zipUrl,
              publishedAt: json.published_at || new Date().toISOString()
            };
            updateCache = { lastChecked: now, data: result };
            return resolve(result);
          }
        } catch (_) {}

        // Fallback to raw package.json check
        checkRawPackageJson().then(resolve);
      });
    });

    req.on('error', () => {
      checkRawPackageJson().then(resolve);
    });
    req.on('timeout', () => {
      req.destroy();
      checkRawPackageJson().then(resolve);
    });
  });
}

// REST API for checking updates
app.get('/api/check-update', async (req, res) => {
  try {
    const updateInfo = await fetchLatestGitHubVersion();
    res.json(updateInfo);
  } catch (err) {
    res.json({
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      updateAvailable: false,
      error: err.message
    });
  }
});

// REST API for updating web assets in-place on disk
app.post('/api/update/sync-web', async (req, res) => {
  try {
    if (!fs.existsSync(publicDir)) {
      return res.status(400).json({ error: 'Public directory is not writable on disk' });
    }

    const downloadRaw = (fileName) => new Promise((resolve, reject) => {
      const fileUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/${fileName}`;
      https.get(fileUrl, { headers: { 'User-Agent': `LocalDrop-LAN/${APP_VERSION}` }, timeout: 8000 }, (resp) => {
        if (resp.statusCode !== 200) return reject(new Error(`HTTP ${resp.statusCode}`));
        let content = '';
        resp.on('data', chunk => { content += chunk; });
        resp.on('end', () => resolve(content));
      }).on('error', reject);
    });

    const [html, js] = await Promise.all([
      downloadRaw('index.html'),
      downloadRaw('app.js')
    ]);

    fs.writeFileSync(path.join(publicDir, 'index.html'), html, 'utf8');
    fs.writeFileSync(path.join(publicDir, 'app.js'), js, 'utf8');

    res.json({ success: true, message: 'Web UI updated to latest version successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync web assets: ' + err.message });
  }
});



// Smart Device & Laptop Name Detection
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#3b82f6'];

function generateDeviceName(req) {
  const ua = (req && req.headers && req.headers['user-agent']) || '';
  if (/Windows/i.test(ua)) return 'Windows Laptop';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'MacBook';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android Device';
  if (/Linux/i.test(ua)) return 'Linux PC';
  return 'My Device';
}

function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// Track connected peers: peerId -> { ws, deviceName, deviceType, color, ip }
const peers = new Map();

function broadcastPeerList() {
  const peerList = Array.from(peers.entries()).map(([id, peer]) => ({
    id,
    deviceName: peer.deviceName,
    deviceType: peer.deviceType,
    color: peer.color
  }));

  const payload = JSON.stringify({ type: 'peer-list', peers: peerList });

  peers.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  });
}

// Active HTTP streaming transfers: transferId -> transferSession
const activeStreamTransfers = new Map();

// 500 Mbps speed limit: 500 * 1024 * 1024 / 8 bytes/sec = 65,536,000 bytes/sec
const MAX_TRANSFER_SPEED_BPS = (500 * 1024 * 1024) / 8;

function broadcastTransferProgress(transfer, speedMbps) {
  const payload = JSON.stringify({
    type: 'transfer-progress-sync',
    fileId: transfer.fileId,
    transferred: transfer.transferredBytes,
    totalSize: transfer.size,
    speedMbps: speedMbps || 0
  });

  const sender = peers.get(transfer.senderPeerId);
  const receiver = peers.get(transfer.receiverPeerId);
  if (sender && sender.ws.readyState === WebSocket.OPEN) sender.ws.send(payload);
  if (receiver && receiver.ws.readyState === WebSocket.OPEN) receiver.ws.send(payload);
}

function broadcastTransferCompleted(transfer) {
  const payload = JSON.stringify({
    type: 'transfer-completed-sync',
    fileId: transfer.fileId,
    totalSize: transfer.size
  });

  const sender = peers.get(transfer.senderPeerId);
  const receiver = peers.get(transfer.receiverPeerId);
  if (sender && sender.ws.readyState === WebSocket.OPEN) sender.ws.send(payload);
  if (receiver && receiver.ws.readyState === WebSocket.OPEN) receiver.ws.send(payload);
}

function broadcastTransferCancelled(transfer, reason) {
  const payload = JSON.stringify({
    type: 'transfer-cancelled-sync',
    fileId: transfer.fileId,
    reason: reason || 'Transfer cancelled'
  });

  const sender = peers.get(transfer.senderPeerId);
  const receiver = peers.get(transfer.receiverPeerId);
  if (sender && sender.ws.readyState === WebSocket.OPEN) sender.ws.send(payload);
  if (receiver && receiver.ws.readyState === WebSocket.OPEN) receiver.ws.send(payload);
}

// 1. Create Transfer Session
app.post('/api/transfer/create', (req, res) => {
  const { fileId, senderPeerId, targetPeerId, name, size, isFolder, fileCount } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId required' });

  activeStreamTransfers.set(fileId, {
    fileId,
    senderPeerId,
    receiverPeerId: targetPeerId,
    name: name || 'file.bin',
    size: Number(size) || 0,
    isFolder: !!isFolder,
    fileCount: Number(fileCount) || 1,
    transferredBytes: 0,
    status: 'waiting-receiver',
    receiverRes: null,
    archive: null,
    startTime: null
  });

  res.json({ success: true, fileId });
});

// Safe MIME type dictionary to prevent browser "unsafe file" warnings
const MIME_TYPES = {
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  // Videos
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  m4v: 'video/x-m4v',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  opus: 'audio/opus',
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain; charset=utf-8',
  rtf: 'application/rtf',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  // Archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  dmg: 'application/x-apple-diskimage',
  iso: 'application/x-iso9660-image',
  // Code & Web
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  sh: 'application/x-sh',
  py: 'text/x-python; charset=utf-8',
  sql: 'application/sql',
  // Binaries
  exe: 'application/vnd.microsoft.portable-executable',
  msi: 'application/x-msi',
  apk: 'application/vnd.android.package-archive',
  deb: 'application/vnd.debian.binary-package',
  rpm: 'application/x-rpm'
};

function getMimeType(filename) {
  if (!filename) return 'application/octet-stream';
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// 2. Receiver initiates native browser download
app.get('/api/transfer/download/:fileId', (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer) {
    return res.status(404).send('Transfer session expired or not found.');
  }

  const safeName = (transfer.name || 'file.bin').replace(/[\\/:*?"<>|]/g, '_');
  const asciiFallback = safeName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const utf8Filename = encodeURIComponent(safeName);
  const mimeType = getMimeType(safeName);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`);
  if (transfer.size > 0) {
    res.setHeader('Content-Length', transfer.size);
  }
  // Anti-sniff and safe download headers to prevent false positive browser security warnings
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.flushHeaders();

  transfer.receiverRes = res;
  transfer.status = 'streaming';
  transfer.startTime = Date.now();

  // Notify sender that receiver is connected and ready to receive stream
  const senderPeer = peers.get(transfer.senderPeerId);
  if (senderPeer && senderPeer.ws.readyState === WebSocket.OPEN) {
    senderPeer.ws.send(JSON.stringify({
      type: 'stream-ready',
      fileId: transfer.fileId
    }));
  }

  req.on('close', () => {
    if (transfer.status === 'streaming') {
      transfer.status = 'cancelled';
      broadcastTransferCancelled(transfer, 'Receiver download connection interrupted');
      activeStreamTransfers.delete(transfer.fileId);
    }
  });
});

// 3. Sender continuous streaming upload (High-Speed Direct Native Stream)
app.post('/api/transfer/upload/:fileId', async (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer) {
    return res.status(404).json({ error: 'Transfer session expired or not found' });
  }

  req.pause(); // Pause stream immediately while ensuring receiver is ready

  // Wait up to 6 seconds if receiver connection is still establishing
  if (!transfer.receiverRes || transfer.status !== 'streaming') {
    let waited = 0;
    while ((!transfer.receiverRes || transfer.status !== 'streaming') && waited < 6000 && transfer.status !== 'cancelled') {
      await new Promise(r => setTimeout(r, 50));
      waited += 50;
    }
  }

  if (!transfer.receiverRes || transfer.status === 'cancelled') {
    return res.status(400).json({ error: 'Receiver not connected or transfer cancelled' });
  }

  if (!transfer.startTime) {
    transfer.startTime = Date.now();
  }

  req.on('data', (chunk) => {
    if (transfer.status === 'cancelled') {
      try { req.destroy(); } catch (_) {}
      return;
    }

    transfer.transferredBytes += chunk.length;

    // Direct write to receiver's HTTP download response with backpressure (uncapped hardware line speed)
    const canWrite = transfer.receiverRes.write(chunk);
    if (!canWrite) {
      req.pause();
      transfer.receiverRes.once('drain', () => {
        if (!req.destroyed && transfer.status === 'streaming') {
          req.resume();
        }
      });
    }

    // Throttle progress sync to at most every 100ms
    const now = Date.now();
    if (!transfer.lastProgressSync || now - transfer.lastProgressSync >= 100) {
      transfer.lastProgressSync = now;
      const elapsedSec = (now - transfer.startTime) / 1000 || 0.001;
      const speedMbps = ((transfer.transferredBytes * 8) / (1024 * 1024)) / elapsedSec;
      broadcastTransferProgress(transfer, speedMbps);
    }
  });

  req.on('end', () => {
    if (transfer.receiverRes && transfer.status === 'streaming') {
      transfer.receiverRes.end();
    }
    transfer.status = 'completed';

    const elapsedSec = (Date.now() - transfer.startTime) / 1000 || 0.001;
    const speedMbps = ((transfer.transferredBytes * 8) / (1024 * 1024)) / elapsedSec;
    broadcastTransferProgress(transfer, speedMbps);
    broadcastTransferCompleted(transfer);

    res.json({ success: true, transferred: transfer.transferredBytes });
    setTimeout(() => activeStreamTransfers.delete(transfer.fileId), 15000);
  });

  req.on('error', (err) => {
    console.error('[Upload Stream] Request error:', err.message);
    if (transfer.receiverRes) {
      try { transfer.receiverRes.destroy(); } catch (_) {}
    }
    transfer.status = 'cancelled';
    broadcastTransferCancelled(transfer, 'Upload connection error');
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  req.resume();
});

// 4. Sender streams chunk (Fallback compatibility)
app.post('/api/transfer/chunk/:fileId', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer || !transfer.receiverRes || transfer.status !== 'streaming') {
    return res.status(400).json({ error: 'Transfer not active or receiver not connected' });
  }

  const chunk = req.body;
  if (chunk && chunk.length > 0) {
    const ok = transfer.receiverRes.write(chunk);
    if (!ok) {
      await new Promise(resolve => transfer.receiverRes.once('drain', resolve));
    }
    transfer.transferredBytes += chunk.length;
  }

  const elapsedSec = (Date.now() - transfer.startTime) / 1000 || 0.001;
  const speedMbps = ((transfer.transferredBytes * 8) / (1024 * 1024)) / elapsedSec;

  // Sync progress across both sender and receiver
  broadcastTransferProgress(transfer, speedMbps);

  res.json({
    success: true,
    transferred: transfer.transferredBytes,
    speedMbps
  });
});

// 4. Finish Transfer
app.post('/api/transfer/finish/:fileId', async (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer) return res.status(404).json({ error: 'Transfer not found' });

  if (transfer.receiverRes) {
    transfer.receiverRes.end();
  }

  transfer.status = 'completed';
  broadcastTransferCompleted(transfer);
  res.json({ success: true, completed: true });

  setTimeout(() => activeStreamTransfers.delete(transfer.fileId), 15000);
});

// 5. Cancel Transfer
app.post('/api/transfer/cancel/:fileId', (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (transfer) {
    transfer.status = 'cancelled';
    if (transfer.receiverRes) {
      try { transfer.receiverRes.destroy(); } catch (_) {}
    }
    broadcastTransferCancelled(transfer, 'Cancelled by user');
    activeStreamTransfers.delete(transfer.fileId);
  }
  res.json({ success: true });
});

function handleWebSocketConnection(ws, req) {
  const peerId = Math.random().toString(36).substring(2, 10);
  const color = getRandomColor();
  const rawIp = req.socket.remoteAddress || '';
  const cleanIp = rawIp.replace(/^.*:/, '');
  const localIPs = getLocalIPAddresses();
  const isLocalHost = cleanIp === '1' || cleanIp === '127.0.0.1' || localIPs.includes(cleanIp);
  const hostComputerName = os.hostname();

  // If local host (same machine running the server), default to Windows hostname (e.g. DESKTOPRYZ5)
  // If remote client (e.g. laptop or phone connecting over LAN), detect OS/platform
  const initialDeviceName = isLocalHost ? hostComputerName : generateDeviceName(req);

  peers.set(peerId, {
    ws,
    deviceName: initialDeviceName,
    deviceType: 'unknown',
    color,
    ip: rawIp
  });

  // Send identity to newly connected client
  ws.send(JSON.stringify({
    type: 'identity',
    peerId,
    deviceName: initialDeviceName,
    hostname: hostComputerName,
    isLocalHost,
    color
  }));

  broadcastPeerList();

  ws.on('message', (rawMessage, isBinary) => {
    // High-speed raw binary relay: [8 bytes targetPeerId] + [raw binary chunk]
    if (isBinary || (Buffer.isBuffer(rawMessage) && rawMessage.length >= 8 && rawMessage[0] !== 0x7B /* not '{' */)) {
      if (rawMessage.length >= 8) {
        const targetId = rawMessage.subarray(0, 8).toString('utf8');
        const targetPeer = peers.get(targetId);
        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          const senderBuffer = Buffer.from(peerId, 'utf8');
          const payload = Buffer.concat([senderBuffer, rawMessage.subarray(8)]);
          targetPeer.ws.send(payload, { binary: true });
        }
      }
      return;
    }

    try {
      const data = JSON.parse(rawMessage);
      const sender = peers.get(peerId);
      if (!sender) return;

      switch (data.type) {
        case 'set-device-info': {
          sender.deviceType = data.deviceType || 'desktop';
          if (data.deviceName && typeof data.deviceName === 'string' && data.deviceName.trim()) {
            sender.deviceName = data.deviceName.trim().substring(0, 32);
          }
          broadcastPeerList();
          break;
        }

        case 'update-name': {
          if (data.name && typeof data.name === 'string') {
            const trimmed = data.name.trim().substring(0, 32);
            if (trimmed.length > 0) {
              sender.deviceName = trimmed;
              broadcastPeerList();
            }
          }
          break;
        }

        // WebRTC Signaling, File Handshakes, Folder Syncing & WebSocket Relay Fallback
        case 'signal-offer':
        case 'signal-answer':
        case 'signal-ice':
        case 'file-request':
        case 'file-response':
        case 'cancel-transfer':
        case 'sync-manifest':
        case 'sync-status':
        case 'sync-diff-result':
        case 'sync-cancel':
        case 'sync-request':
        case 'sync-response':
        case 'sync-complete':
        case 'ws-transfer-meta':
        case 'ws-file-header':
        case 'ws-transfer-chunk':
        case 'ws-transfer-done': {
          const targetIds = Array.isArray(data.targets) ? data.targets : (data.target ? [data.target] : []);
          const payload = JSON.stringify({
            ...data,
            sender: peerId,
            senderName: sender.deviceName,
            senderColor: sender.color,
            senderDeviceType: sender.deviceType
          });

          targetIds.forEach((targetId) => {
            const targetPeer = peers.get(targetId);
            if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
              targetPeer.ws.send(payload);
            }
          });
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    peers.delete(peerId);
    broadcastPeerList();
  });

  ws.on('error', () => {
    peers.delete(peerId);
    broadcastPeerList();
  });
}

wss.on('connection', handleWebSocketConnection);

async function startServers() {
  const localIPs = getLocalIPAddresses();

  // 1. Start HTTP Server
  server.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🚀 LocalDrop LAN Server running on port ${PORT}`);
    console.log(`📱 Local Access: http://localhost:${PORT}`);
    console.log(`🏷️  mDNS Domain:  http://${MDNS_HOST}:${PORT}`);
    localIPs.forEach((ip) => {
      console.log(`🌐 Network Access (from phones/tablets): http://${ip}:${PORT}`);
    });
    console.log('====================================================');
  });

  // 2. Start HTTPS Server (for Direct Folder Placement / File System Access API)
  try {
    const pems = await selfsigned.generate([
      { name: 'commonName', value: 'localdrop.lan' }
    ], {
      days: 365,
      keySize: 2048,
      extensions: [{
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: MDNS_HOST },
          { type: 7, ip: '127.0.0.1' },
          ...localIPs.map(ip => ({ type: 7, ip }))
        ]
      }]
    });

    httpsServer = https.createServer({
      key: pems.private,
      cert: pems.cert
    }, app);

    wssHttps = new WebSocketServer({ server: httpsServer });
    wssHttps.on('connection', handleWebSocketConnection);

    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 Secure HTTPS Access (Direct Disk Placement): https://localhost:${HTTPS_PORT}`);
      localIPs.forEach(ip => {
        console.log(`🔒 Secure HTTPS LAN: https://${ip}:${HTTPS_PORT}`);
      });
      console.log('====================================================');
    });
  } catch (err) {
    console.warn('⚠️ Could not start HTTPS server:', err.message);
  }
}

startServers();
