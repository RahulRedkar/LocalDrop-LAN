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

// REST API for network info
app.get('/api/info', (req, res) => {
  res.json({
    hostname: os.hostname(),
    ips: getLocalIPAddresses(),
    port: PORT,
    httpsPort: HTTPS_PORT,
    mdnsHost: MDNS_HOST
  });
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

// 2. Receiver initiates native browser download
app.get('/api/transfer/download/:fileId', (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer) {
    return res.status(404).send('Transfer session expired or not found.');
  }

  const safeName = transfer.isFolder
    ? `${(transfer.name || 'folder').replace(/[\\/:*?"<>|]/g, '_')}.zip`
    : (transfer.name || 'file.bin').replace(/[\\/:*?"<>|]/g, '_');

  res.setHeader('Content-Type', transfer.isFolder ? 'application/zip' : 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}"`);
  if (!transfer.isFolder && transfer.size > 0) {
    res.setHeader('Content-Length', transfer.size);
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  transfer.receiverRes = res;
  transfer.status = 'streaming';
  transfer.startTime = Date.now();

  if (transfer.isFolder) {
    const archive = archiver('zip', {
      store: true,
      forceZip64: true,
      zlib: { level: 0 }
    });
    archive.pipe(res);
    transfer.archive = archive;
  }

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

// 3. Sender streams chunk
app.post('/api/transfer/chunk/:fileId', express.raw({ type: '*/*', limit: '100mb' }), async (req, res) => {
  const transfer = activeStreamTransfers.get(req.params.fileId);
  if (!transfer || !transfer.receiverRes || transfer.status !== 'streaming') {
    return res.status(400).json({ error: 'Transfer not active or receiver not connected' });
  }

  const chunk = req.body;
  if (chunk && chunk.length > 0) {
    // 500 Mbps Rate Limiter
    const targetElapsedMs = (transfer.transferredBytes * 1000) / MAX_TRANSFER_SPEED_BPS;
    const actualElapsedMs = Date.now() - transfer.startTime;
    if (actualElapsedMs < targetElapsedMs) {
      const waitMs = targetElapsedMs - actualElapsedMs;
      await new Promise(r => setTimeout(r, waitMs));
    }

    if (transfer.isFolder && transfer.archive) {
      const relPath = req.query.path || 'file.bin';
      transfer.archive.append(chunk, { name: relPath });
    } else {
      const ok = transfer.receiverRes.write(chunk);
      if (!ok) {
        await new Promise(resolve => transfer.receiverRes.once('drain', resolve));
      }
    }
    transfer.transferredBytes += chunk.length;
  }

  const elapsedSec = (Date.now() - transfer.startTime) / 1000 || 0.001;
  const speedMbps = Math.min(500, ((transfer.transferredBytes * 8) / (1024 * 1024)) / elapsedSec);

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

  if (transfer.isFolder && transfer.archive) {
    await transfer.archive.finalize();
  } else if (transfer.receiverRes) {
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
