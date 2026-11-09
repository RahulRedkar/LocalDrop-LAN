/* LocalDrop LAN - P2P File & Folder Transfer + PC-to-PC Folder Sync */

const DISK_BLOCK_SIZE = 1024 * 1024; // 1MB in-memory disk read block
const CHUNK_SIZE = 256 * 1024; // 256KB network packet (max safe WebRTC & WebSocket chunk)
const LOW_WATER_MARK = 1024 * 1024; // 1MB low-water mark
const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8MB high-water mark

const APP_VERSION = '1.0.1';

// Device identification
let myPeerId = null;
let myDeviceName = null;
let myColor = '#6366f1';
let myDeviceType = getDeviceType();

// Active peer connections & data channels: peerId -> { pc, dataChannel }
const activePeers = new Map();
let currentPeerList = []; // Array of { id, deviceName, deviceType, color }

// Active file & folder transfers tracking: transferKey -> transfer object
const activeTransfers = new Map();
const outboundQueue = new Map(); // fileId -> { items, targetPeerIds }
const approvedBatches = new Set(); // batchId -> auto-accept subsequent files in batch

let incomingRequest = null;
let currentSelectedPeerId = null;
let isMultiSelectMode = false;
const selectedPeerIds = new Set();

// UI Elements: Navigation & Views
const tabRadarBtn = document.getElementById('tabRadarBtn');
const tabSyncBtn = document.getElementById('tabSyncBtn');
const radarStage = document.getElementById('radarStage');
const syncStage = document.getElementById('syncStage');

// UI Elements: Header & Network
const networkIpBadge = document.getElementById('networkIpBadge');
const updateAvailableBadge = document.getElementById('updateAvailableBadge');
const updateBadgeText = document.getElementById('updateBadgeText');
const checkUpdateBtn = document.getElementById('checkUpdateBtn');
const selfAvatar = document.getElementById('selfAvatar');
const selfIcon = document.getElementById('selfIcon');
const selfNameInput = document.getElementById('selfNameInput');
const editNameBtn = document.getElementById('editNameBtn');

// UI Elements: Radar & Transfers
const peerGrid = document.getElementById('peerGrid');
const emptyPeerState = document.getElementById('emptyPeerState');
const emptyStateLink = document.getElementById('emptyStateLink');
const emptyStateIp = document.getElementById('emptyStateIp');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const dropZoneGlobal = document.getElementById('dropZoneGlobal');
const transfersSection = document.getElementById('transfersSection');
const transfersList = document.getElementById('transfersList');
const clearAllTransfersBtn = document.getElementById('clearAllTransfersBtn');

// UI Elements: Toolbar & Multi-select
const broadcastAllBtn = document.getElementById('broadcastAllBtn');
const selectFolderGlobalBtn = document.getElementById('selectFolderGlobalBtn');
const selectFilesGlobalBtn = document.getElementById('selectFilesGlobalBtn');
const toggleMultiSelectBtn = document.getElementById('toggleMultiSelectBtn');
const multiSelectLabel = document.getElementById('multiSelectLabel');
const sendToSelectedBtn = document.getElementById('sendToSelectedBtn');
const sendSelectedCount = document.getElementById('sendSelectedCount');

// UI Elements: QR Code
const qrBtn = document.getElementById('qrBtn');
const emptyStateQrBtn = document.getElementById('emptyStateQrBtn');
const qrModal = document.getElementById('qrModal');
const closeQrModalBtn = document.getElementById('closeQrModalBtn');
const qrcodeCanvas = document.getElementById('qrcodeCanvas');
const qrUrlText = document.getElementById('qrUrlText');
const copyQrUrlBtn = document.getElementById('copyQrUrlBtn');
const qrToggleIpBtn = document.getElementById('qrToggleIpBtn');
const qrToggleMdnsBtn = document.getElementById('qrToggleMdnsBtn');

// UI Elements: Incoming Transfer Modal
const incomingModal = document.getElementById('incomingModal');
const incomingModalTitle = document.getElementById('incomingModalTitle');
const incomingSenderText = document.getElementById('incomingSenderText');
const incomingFileName = document.getElementById('incomingFileName');
const incomingFileSize = document.getElementById('incomingFileSize');
const incomingFileBadgeIcon = document.getElementById('incomingFileBadgeIcon');
const incomingFolderDestSection = document.getElementById('incomingFolderDestSection');
const incomingFolderDestPath = document.getElementById('incomingFolderDestPath');
const incomingFolderDestSub = document.getElementById('incomingFolderDestSub');
const incomingFolderDestBadge = document.getElementById('incomingFolderDestBadge');
const destPickerSupportedBox = document.getElementById('destPickerSupportedBox');
const destPickerInsecureBox = document.getElementById('destPickerInsecureBox');
const switchToHttpsBtn = document.getElementById('switchToHttpsBtn');
const chooseFolderDestBtn = document.getElementById('chooseFolderDestBtn');
const acceptBtn = document.getElementById('acceptBtn');
const declineBtn = document.getElementById('declineBtn');
const toastContainer = document.getElementById('toastContainer');

let selectedFolderDestHandle = null; // Destination directory handle chosen by receiver

// UI Elements: Folder Sync
const pickSyncFolderBtn = document.getElementById('pickSyncFolderBtn');
const rescanLocalFolderBtn = document.getElementById('rescanLocalFolderBtn');
const localFolderStatusBadge = document.getElementById('localFolderStatusBadge');
const localFolderName = document.getElementById('localFolderName');
const localFolderMeta = document.getElementById('localFolderMeta');
const syncPeerSelect = document.getElementById('syncPeerSelect');
const syncDirectionSelect = document.getElementById('syncDirectionSelect');
const syncNowBtn = document.getElementById('syncNowBtn');
const autoSyncToggle = document.getElementById('autoSyncToggle');
const remotePeerStatusBadge = document.getElementById('remotePeerStatusBadge');
const syncOverallStateBadge = document.getElementById('syncOverallStateBadge');
const metricLocalFiles = document.getElementById('metricLocalFiles');
const metricRemoteFiles = document.getElementById('metricRemoteFiles');
const metricPendingUploads = document.getElementById('metricPendingUploads');
const metricPendingDownloads = document.getElementById('metricPendingDownloads');
const syncLogStream = document.getElementById('syncLogStream');
const clearSyncLogBtn = document.getElementById('clearSyncLogBtn');

// UI Elements: Folder Sync Progress & Comparison Modal
const syncProgressModal = document.getElementById('syncProgressModal');
const closeSyncProgressModalBtn = document.getElementById('closeSyncProgressModalBtn');
const cancelSyncModalBtn = document.getElementById('cancelSyncModalBtn');
const actionSyncModalBtn = document.getElementById('actionSyncModalBtn');
const actionSyncModalBtnText = document.getElementById('actionSyncModalBtnText');
const syncModalTitle = document.getElementById('syncModalTitle');
const syncModalSubtitle = document.getElementById('syncModalSubtitle');
const syncModalPhaseBadge = document.getElementById('syncModalPhaseBadge');
const syncModalCurrentOp = document.getElementById('syncModalCurrentOp');
const syncModalFileCount = document.getElementById('syncModalFileCount');
const syncModalProgressBar = document.getElementById('syncModalProgressBar');
const syncModalStatusDetail = document.getElementById('syncModalStatusDetail');
const syncModalPercent = document.getElementById('syncModalPercent');
const syncModalTotalFiles = document.getElementById('syncModalTotalFiles');
const syncModalIdenticalFiles = document.getElementById('syncModalIdenticalFiles');
const syncModalToSendFiles = document.getElementById('syncModalToSendFiles');
const syncModalToReceiveFiles = document.getElementById('syncModalToReceiveFiles');
const syncModalIcon = document.getElementById('syncModalIcon');
const syncModalIconContainer = document.getElementById('syncModalIconContainer');

// UI Elements: Software Update Modal
const updateModal = document.getElementById('updateModal');
const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
const updateModalTagBadge = document.getElementById('updateModalTagBadge');
const updateModalSubtitle = document.getElementById('updateModalSubtitle');
const updateModalCurrentVersion = document.getElementById('updateModalCurrentVersion');
const updateModalLatestVersion = document.getElementById('updateModalLatestVersion');
const updateModalNotes = document.getElementById('updateModalNotes');
const updateDownloadInstallerBtn = document.getElementById('updateDownloadInstallerBtn');
const updateDownloadZipBtn = document.getElementById('updateDownloadZipBtn');
const updateDownloadBtnText = document.getElementById('updateDownloadBtnText');
const updateSyncWebBtn = document.getElementById('updateSyncWebBtn');

// UI Elements: How to Use Modal
const howToUseBtn = document.getElementById('howToUseBtn');
const howToUseModal = document.getElementById('howToUseModal');
const closeHowToUseModalBtn = document.getElementById('closeHowToUseModalBtn');
const gotItHowToUseBtn = document.getElementById('gotItHowToUseBtn');

// QR Code State
let serverIpUrl = '';
let serverMdnsUrl = '';
let currentQrTarget = 'ip';
let qrcodeObj = null;

// ==========================================
// 1. NAVIGATION & TAB SWITCHING
// ==========================================
function switchTab(tab) {
  if (tab === 'radar') {
    tabRadarBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white shadow-md border border-white/20 backdrop-blur-md transition-all duration-200';
    tabSyncBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-white transition-all duration-200';

    syncStage.classList.add('stage-hidden');
    syncStage.classList.remove('stage-visible');
    radarStage.classList.remove('stage-hidden');
    radarStage.classList.remove('hidden');
    requestAnimationFrame(() => {
      radarStage.classList.add('stage-visible');
    });
  } else {
    tabSyncBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white shadow-md border border-white/20 backdrop-blur-md transition-all duration-200';
    tabRadarBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-white transition-all duration-200';

    radarStage.classList.add('stage-hidden');
    radarStage.classList.remove('stage-visible');
    syncStage.classList.remove('stage-hidden');
    syncStage.classList.remove('hidden');
    requestAnimationFrame(() => {
      syncStage.classList.add('stage-visible');
    });
  }
}
if (tabRadarBtn) tabRadarBtn.onclick = () => switchTab('radar');
if (tabSyncBtn) tabSyncBtn.onclick = () => switchTab('sync');

// ==========================================
// 2. HELPER UTILITIES
// ==========================================
function getDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

function getSmartDeviceName(fallback) {
  // 1. Saved custom name from localStorage
  const saved = localStorage.getItem('localdrop_device_name');
  if (saved && saved.trim()) return saved.trim();

  // 2. Platform / Laptop / Computer detection
  const ua = navigator.userAgent;
  let name = fallback || 'My Device';

  if (/Windows/i.test(ua)) {
    name = 'Windows Laptop';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    name = 'MacBook';
  } else if (/iPad/i.test(ua)) {
    name = 'iPad';
  } else if (/iPhone/i.test(ua)) {
    name = 'iPhone';
  } else if (/Android/i.test(ua)) {
    name = /tablet/i.test(ua) ? 'Android Tablet' : 'Android Phone';
  } else if (/Linux/i.test(ua)) {
    name = 'Linux PC';
  }

  return name;
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-capsule px-4 py-3 rounded-2xl text-xs font-medium border shadow-2xl flex items-center space-x-2.5 backdrop-blur-2xl transition-all duration-300 ${
    type === 'success'
      ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
      : type === 'error'
      ? 'bg-rose-500/20 border-rose-400/30 text-rose-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
      : type === 'warn'
      ? 'bg-amber-500/20 border-amber-400/30 text-amber-100 shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
      : 'bg-white/15 border-white/25 text-white shadow-[0_8px_32px_rgba(0,0,0,0.5)]'
  }`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('toast-capsule');
    toast.classList.add('toast-capsule-exit');
    setTimeout(() => {
      toast.remove();
    }, 260);
  }, 4200);
}

function appendSyncLog(msg, type = 'info') {
  if (!syncLogStream) return;
  const now = new Date().toLocaleTimeString();
  const p = document.createElement('p');
  p.className = type === 'success' ? 'text-emerald-300' : type === 'error' ? 'text-rose-300' : type === 'warn' ? 'text-amber-300' : 'text-white/70';
  p.textContent = `[${now}] ${msg}`;
  syncLogStream.appendChild(p);
  syncLogStream.scrollTop = syncLogStream.scrollHeight;
}
if (clearSyncLogBtn) clearSyncLogBtn.onclick = () => {
  if (syncLogStream) syncLogStream.innerHTML = '';
};

// ==========================================
// 3. NETWORK INFO & QR CODE SETUP
// ==========================================
fetch('/api/info')
  .then(res => res.json())
  .then(data => {
    const port = data.port || 8080;
    const ip = (data.ips && data.ips.length > 0) ? data.ips[0] : null;
    const allIps = (data.ips && data.ips.length > 0) ? data.ips.join(', ') : '';
    const mdns = data.mdnsHost;

    if (ip) serverIpUrl = `http://${ip}:${port}`;
    if (mdns) serverMdnsUrl = `http://${mdns}:${port}`;

    if (mdns && ip) {
      networkIpBadge.innerHTML = `
        <span class="text-blue-400 font-semibold tracking-wide" title="mDNS Hostname">${mdns}:${port}</span>
        <span class="text-white/30 font-bold">•</span>
        <span class="text-white/80 font-mono text-[11px] bg-white/10 border border-white/15 px-2.5 py-0.5 rounded-full" title="Local IP: ${allIps}">IP: ${ip}:${port}</span>
      `;
    } else if (ip) {
      networkIpBadge.innerHTML = `
        <span class="text-white/80 font-mono text-[11px] bg-white/10 border border-white/15 px-2.5 py-0.5 rounded-full">IP: ${ip}:${port}</span>
      `;
    } else if (mdns) {
      networkIpBadge.innerHTML = `
        <span class="text-blue-400 font-semibold">${mdns}:${port}</span>
      `;
    } else {
      networkIpBadge.textContent = `Port ${port}`;
    }

    if (emptyStateLink && mdns) emptyStateLink.textContent = `http://${mdns}:${port}`;
    if (emptyStateIp && ip) emptyStateIp.textContent = `http://${ip}:${port}`;
  })
  .catch(() => {
    networkIpBadge.textContent = 'Local Network';
  });

function renderQrCode(url) {
  if (qrUrlText) qrUrlText.textContent = url;
  if (!qrcodeCanvas) return;
  qrcodeCanvas.innerHTML = '';

  if (window.QRCode) {
    qrcodeObj = new QRCode(qrcodeCanvas, {
      text: url,
      width: 170,
      height: 170,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function openQrModal() {
  if (!qrModal) return;
  qrModal.classList.remove('hidden');
  const targetUrl = (currentQrTarget === 'ip' && serverIpUrl) ? serverIpUrl : (serverMdnsUrl || serverIpUrl || window.location.href);
  renderQrCode(targetUrl);
  updateQrToggleStyles();
}

function closeQrModal() {
  if (qrModal) qrModal.classList.add('hidden');
}

function updateQrToggleStyles() {
  if (currentQrTarget === 'ip') {
    if (qrToggleIpBtn) qrToggleIpBtn.className = 'hover:text-blue-300 underline font-semibold text-blue-400 transition';
    if (qrToggleMdnsBtn) qrToggleMdnsBtn.className = 'hover:text-blue-300 underline font-medium text-white/60 transition';
  } else {
    if (qrToggleIpBtn) qrToggleIpBtn.className = 'hover:text-blue-300 underline font-medium text-white/60 transition';
    if (qrToggleMdnsBtn) qrToggleMdnsBtn.className = 'hover:text-blue-300 underline font-semibold text-blue-400 transition';
  }
}

if (qrBtn) qrBtn.onclick = openQrModal;
if (emptyStateQrBtn) emptyStateQrBtn.onclick = openQrModal;
if (closeQrModalBtn) closeQrModalBtn.onclick = closeQrModal;
if (qrModal) {
  qrModal.onclick = (e) => {
    if (e.target === qrModal) closeQrModal();
  };
}

if (qrToggleIpBtn) {
  qrToggleIpBtn.onclick = () => {
    currentQrTarget = 'ip';
    updateQrToggleStyles();
    if (serverIpUrl) renderQrCode(serverIpUrl);
  };
}

if (qrToggleMdnsBtn) {
  qrToggleMdnsBtn.onclick = () => {
    currentQrTarget = 'mdns';
    updateQrToggleStyles();
    if (serverMdnsUrl) renderQrCode(serverMdnsUrl);
  };
}

if (copyQrUrlBtn) {
  copyQrUrlBtn.onclick = () => {
    const textToCopy = qrUrlText ? qrUrlText.textContent : (serverIpUrl || window.location.href);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => showToast('URL copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy URL', 'error'));
    } else {
      showToast('Copied: ' + textToCopy, 'info');
    }
  };
}

// ==========================================
// 4. WEBSOCKET SIGNALING & PEER DISCOVERY
// ==========================================
let ws = null;
let wsPingInterval = null;

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    console.log('[WS] Connected to signaling server');
    const savedName = localStorage.getItem('localdrop_device_name') || getSmartDeviceName();
    myDeviceName = savedName;
    ws.send(JSON.stringify({
      type: 'set-device-info',
      deviceType: myDeviceType,
      deviceName: myDeviceName
    }));
    if (wsPingInterval) clearInterval(wsPingInterval);
    wsPingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  };

  ws.onclose = () => {
    console.warn('[WS] Connection closed, reconnecting in 2s...');
    if (wsPingInterval) clearInterval(wsPingInterval);
    setTimeout(initWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.warn('[WS] Error:', err);
  };

  ws.onmessage = async (event) => {
    // High-speed raw binary chunk: first 8 bytes = senderId, remaining = file chunk
    if (event.data instanceof ArrayBuffer) {
      const senderId = new TextDecoder().decode(new Uint8Array(event.data, 0, 8));
      const chunkData = event.data.slice(8);
      await handleIncomingBinaryBuffer(senderId, chunkData);
      return;
    }

    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'identity': {
        myPeerId = data.peerId;
        myColor = data.color;

        const savedName = localStorage.getItem('localdrop_device_name');
        if (savedName && savedName.trim()) {
          myDeviceName = savedName.trim();
        } else if (data.isLocalHost && data.hostname) {
          myDeviceName = data.hostname;
          localStorage.setItem('localdrop_device_name', myDeviceName);
        } else {
          myDeviceName = data.deviceName || getSmartDeviceName();
        }

        ws.send(JSON.stringify({
          type: 'update-name',
          name: myDeviceName
        }));

        selfNameInput.value = myDeviceName;
        selfAvatar.textContent = myDeviceName.charAt(0).toUpperCase();
        selfAvatar.style.backgroundColor = myColor;

        const iconName = myDeviceType === 'desktop' ? 'monitor' : myDeviceType === 'tablet' ? 'tablet' : 'smartphone';
        selfIcon.setAttribute('data-lucide', iconName);
        if (window.lucide) lucide.createIcons();
        break;
      }

      case 'peer-list': {
        currentPeerList = data.peers.filter(p => p.id !== myPeerId);
        renderPeers(currentPeerList);
        updateSyncPeerSelect(currentPeerList);
        break;
      }

      case 'file-request': {
        handleIncomingFileRequest(data);
        break;
      }

      case 'file-response': {
        handleFileResponse(data);
        break;
      }

      case 'cancel-transfer': {
        showToast(`${data.senderName || 'Peer'} cancelled transfer`, 'error');
        const transferKey = `${data.fileId}_${data.sender}`;
        cancelTransfer(transferKey, false, 'Cancelled by peer');
        break;
      }

      case 'signal-offer': {
        await handleOffer(data);
        break;
      }

      case 'signal-answer': {
        await handleAnswer(data);
        break;
      }

      case 'signal-ice': {
        await handleIceCandidate(data);
        break;
      }

      // WebSocket Relay Fallback for Chunks
      case 'ws-transfer-meta': {
        handleIncomingMetaEnvelope(data.sender, data.meta);
        break;
      }

      case 'ws-file-header': {
        handleIncomingFileHeader(data.sender, data);
        break;
      }

      case 'ws-transfer-chunk': {
        const binaryString = atob(data.chunk);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        await handleIncomingBinaryBuffer(data.sender, bytes.buffer);
        break;
      }

      case 'ws-transfer-done': {
        await finalizeIncomingTransfer(data.sender, data.fileId);
        break;
      }

      // Synchronized Stream Transfer Handlers
      case 'stream-ready': {
        startSendingStreamOutbound(data.fileId);
        break;
      }

      case 'transfer-progress-sync': {
        const transferKey = Array.from(activeTransfers.keys()).find(k => k.startsWith(data.fileId));
        if (transferKey) {
          updateTransferProgress(transferKey, data.transferred, data.totalSize, data.speedMbps);
        }
        break;
      }

      case 'transfer-completed-sync': {
        const transferKey = Array.from(activeTransfers.keys()).find(k => k.startsWith(data.fileId));
        if (transferKey) {
          const transfer = activeTransfers.get(transferKey);
          if (transfer) {
            const wasCompleted = transfer.status === 'completed';
            transfer.status = 'completed';
            updateTransferCompleted(transferKey);
            if (!wasCompleted) {
              const queueData = outboundQueue.get(data.fileId);
              if (queueData && queueData.onComplete) {
                const cb = queueData.onComplete;
                queueData.onComplete = null;
                cb();
              }
            }
          }
          showToast('Transfer completed successfully!', 'success');
        }
        break;
      }

      case 'transfer-cancelled-sync': {
        const transferKey = Array.from(activeTransfers.keys()).find(k => k.startsWith(data.fileId));
        if (transferKey) {
          cancelTransfer(transferKey, false, data.reason || 'Cancelled');
        }
        break;
      }

      // Folder Sync Protocol Messages
      case 'sync-manifest': {
        handleSyncManifestReceived(data);
        break;
      }

      case 'sync-status': {
        handleSyncStatusReceived(data);
        break;
      }

      case 'sync-diff-result': {
        handleSyncDiffResultReceived(data);
        break;
      }

      case 'sync-cancel': {
        handleSyncCancelReceived(data);
        break;
      }

      case 'sync-request': {
        handleSyncRequestReceived(data);
        break;
      }
    }
  };
}

initWebSocket();

// Device Name Editing
function updateCustomName(name, showNotification = true) {
  const trimmed = name.trim().substring(0, 32);
  if (!trimmed) {
    selfNameInput.value = myDeviceName;
    return;
  }
  myDeviceName = trimmed;
  localStorage.setItem('localdrop_device_name', myDeviceName); // Persist forever across reloads!
  selfNameInput.value = myDeviceName;
  selfAvatar.textContent = myDeviceName.charAt(0).toUpperCase();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'update-name',
      name: myDeviceName
    }));
  }
  if (showNotification) {
    showToast(`Name saved as "${myDeviceName}"`, 'info');
  }
}

selfNameInput.addEventListener('change', () => updateCustomName(selfNameInput.value));
selfNameInput.addEventListener('blur', () => updateCustomName(selfNameInput.value));
selfNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') selfNameInput.blur();
});
if (editNameBtn) editNameBtn.addEventListener('click', () => {
  selfNameInput.focus();
  selfNameInput.select();
});

// ==========================================
// 5. RADAR PEER GRID & MULTI-SELECT
// ==========================================
function renderPeers(peers) {
  peerGrid.innerHTML = '';
  if (peers.length === 0) {
    emptyPeerState.classList.remove('hidden');
    return;
  }
  emptyPeerState.classList.add('hidden');

  peers.forEach(peer => {
    const card = document.createElement('div');
    const isSelected = selectedPeerIds.has(peer.id);
    card.id = `peer-card-${peer.id}`;
    card.className = `apple-glass-card peer-card-enter p-5 flex flex-col items-center text-center cursor-pointer select-none relative group ${isSelected ? 'is-selected' : ''}`;

    const iconName = peer.deviceType === 'desktop' ? 'monitor' : peer.deviceType === 'tablet' ? 'tablet' : 'smartphone';

    card.innerHTML = `
      <!-- Multi-select checkbox -->
      <div class="absolute top-3 right-3 ${isMultiSelectMode ? '' : 'hidden'} multi-select-box">
        <div class="w-5 h-5 rounded-full ${isSelected ? 'bg-[#007AFF] text-white border-white' : 'bg-black/40 border-white/30 text-transparent'} border flex items-center justify-center transition-all shadow-sm">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
        </div>
      </div>

      <div class="relative mb-3.5">
        <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-200 group-hover:scale-105 border border-white/20" style="background-color: ${peer.color}">
          <i data-lucide="${iconName}" class="w-7 h-7"></i>
        </div>
      </div>
      <h4 class="text-sm font-semibold text-white tracking-tight truncate w-full">${peer.deviceName}</h4>
      <p class="text-xs text-white/60 capitalize mt-0.5 font-normal">${peer.deviceType}</p>
      
      <!-- Action buttons -->
      <div class="mt-3.5 flex items-center space-x-1.5 w-full justify-center">
        ${isMultiSelectMode ? `
          <span class="text-[11px] font-semibold text-blue-300 bg-blue-500/20 px-3 py-1 rounded-full border border-blue-400/30">
            ${isSelected ? 'Selected' : 'Select'}
          </span>
        ` : `
          <button type="button" class="peer-send-file-btn text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-xl border border-white/15 hover:border-white/30 backdrop-blur-md transition-all flex items-center space-x-1 shadow-sm" title="Send Files">
            <i data-lucide="file-up" class="w-3 h-3 text-blue-400"></i>
            <span>Files</span>
          </button>
          <button type="button" class="peer-send-folder-btn text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-xl border border-white/15 hover:border-white/30 backdrop-blur-md transition-all flex items-center space-x-1 shadow-sm" title="Send Folder">
            <i data-lucide="folder" class="w-3 h-3 text-amber-400"></i>
            <span>Folder</span>
          </button>
        `}
      </div>
    `;

    // Click handler for card
    card.onclick = (e) => {
      if (isMultiSelectMode) {
        togglePeerSelected(peer.id);
      } else {
        currentSelectedPeerId = peer.id;
        fileInput.click();
      }
    };

    // Sub-buttons inside card
    const fileBtn = card.querySelector('.peer-send-file-btn');
    const folderBtn = card.querySelector('.peer-send-folder-btn');
    if (fileBtn) {
      fileBtn.onclick = (e) => {
        e.stopPropagation();
        currentSelectedPeerId = peer.id;
        fileInput.click();
      };
    }
    if (folderBtn) {
      folderBtn.onclick = (e) => {
        e.stopPropagation();
        currentSelectedPeerId = peer.id;
        folderInput.click();
      };
    }

    // Drag-and-drop on specific peer card (supports files & folders)
    card.ondragover = (e) => {
      e.preventDefault();
      card.classList.add('border-blue-400', 'bg-blue-500/20');
    };
    card.ondragleave = () => {
      card.classList.remove('border-blue-400', 'bg-blue-500/20');
    };
    card.ondrop = async (e) => {
      e.preventDefault();
      card.classList.remove('border-blue-400', 'bg-blue-500/20');
      const items = await extractDroppedItems(e.dataTransfer);
      if (items.length > 0) {
        prepareAndSendItems([peer.id], items);
      }
    };

    peerGrid.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}

function togglePeerSelected(peerId) {
  if (selectedPeerIds.has(peerId)) {
    selectedPeerIds.delete(peerId);
  } else {
    selectedPeerIds.add(peerId);
  }
  updateMultiSelectUI();
  renderPeers(currentPeerList);
}

function updateMultiSelectUI() {
  const count = selectedPeerIds.size;
  sendSelectedCount.textContent = `Send to Selected (${count})`;
  if (count > 0 && isMultiSelectMode) {
    sendToSelectedBtn.classList.remove('hidden');
  } else {
    sendToSelectedBtn.classList.add('hidden');
  }
}

if (toggleMultiSelectBtn) {
  toggleMultiSelectBtn.onclick = () => {
    isMultiSelectMode = !isMultiSelectMode;
    if (!isMultiSelectMode) {
      selectedPeerIds.clear();
      toggleMultiSelectBtn.className = 'flex items-center space-x-1.5 apple-btn-glass px-3.5 py-2 rounded-xl text-xs font-medium';
      multiSelectLabel.textContent = 'Multi-Select';
    } else {
      toggleMultiSelectBtn.className = 'flex items-center space-x-1.5 bg-blue-500/20 border border-blue-400/40 text-blue-300 px-3.5 py-2 rounded-xl text-xs font-medium shadow-[0_0_15px_rgba(0,122,255,0.3)] transition';
      multiSelectLabel.textContent = 'Done Selecting';
    }
    updateMultiSelectUI();
    renderPeers(currentPeerList);
  };
}

if (sendToSelectedBtn) {
  sendToSelectedBtn.onclick = () => {
    if (selectedPeerIds.size === 0) return;
    fileInput.click();
  };
}

// Global Broadcast Toolbar Buttons
if (broadcastAllBtn) {
  broadcastAllBtn.onclick = () => {
    if (currentPeerList.length === 0) {
      showToast('No devices available to broadcast to', 'warn');
      return;
    }
    // Set targets to ALL peers
    selectedPeerIds.clear();
    currentPeerList.forEach(p => selectedPeerIds.add(p.id));
    fileInput.click();
  };
}

if (selectFilesGlobalBtn) {
  selectFilesGlobalBtn.onclick = () => {
    fileInput.click();
  };
}

if (selectFolderGlobalBtn) {
  selectFolderGlobalBtn.onclick = () => {
    folderInput.click();
  };
}

// Global Drag and Drop (outside specific peer card)
if (dropZoneGlobal) {
  dropZoneGlobal.ondragover = (e) => {
    e.preventDefault();
  };
  dropZoneGlobal.ondrop = async (e) => {
    e.preventDefault();
    const items = await extractDroppedItems(e.dataTransfer);
    if (items.length === 0) return;

    const targets = selectedPeerIds.size > 0 
      ? Array.from(selectedPeerIds) 
      : (currentPeerList.length > 0 ? currentPeerList.map(p => p.id) : []);

    if (targets.length === 0) {
      showToast('No devices available. Please connect another device first.', 'warn');
      return;
    }

    prepareAndSendItems(targets, items);
  };
}

// ==========================================
// 6. FOLDER TRAVERSAL & ITEM EXTRACTION
// ==========================================
async function extractDroppedItems(dataTransfer) {
  const items = [];
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const queue = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) queue.push(traverseEntry(entry, ''));
      } else {
        const file = item.getAsFile();
        if (file) items.push({ file, relativePath: file.name, isFolder: false });
      }
    }
    const resolvedEntries = await Promise.all(queue);
    resolvedEntries.forEach(subItems => items.push(...subItems));
  } else if (dataTransfer.files && dataTransfer.files.length > 0) {
    Array.from(dataTransfer.files).forEach(file => {
      items.push({ file, relativePath: file.webkitRelativePath || file.name, isFolder: false });
    });
  }
  return items;
}

function traverseEntry(entry, path) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        resolve([{ file, relativePath: path ? `${path}/${file.name}` : file.name, isFolder: false }]);
      }, () => resolve([]));
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const dirPath = path ? `${path}/${entry.name}` : entry.name;
      const allEntries = [];

      function readNextBatch() {
        dirReader.readEntries(async (entries) => {
          if (!entries.length) {
            const nestedPromises = allEntries.map(e => traverseEntry(e, dirPath));
            const nestedResults = await Promise.all(nestedPromises);
            resolve(nestedResults.flat());
          } else {
            allEntries.push(...entries);
            readNextBatch();
          }
        }, () => resolve([]));
      }
      readNextBatch();
    } else {
      resolve([]);
    }
  });
}

// File Inputs Handlers
fileInput.onchange = (e) => {
  if (e.target.files.length === 0) return;
  const items = Array.from(e.target.files).map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
    isFolder: false
  }));

  const targets = selectedPeerIds.size > 0 
    ? Array.from(selectedPeerIds) 
    : (currentSelectedPeerId ? [currentSelectedPeerId] : currentPeerList.map(p => p.id));

  if (targets.length === 0) {
    showToast('No peers selected to send to', 'warn');
    return;
  }

  prepareAndSendItems(targets, items);
  fileInput.value = '';
};

folderInput.onchange = (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  const items = Array.from(e.target.files).map(file => ({
    file,
    relativePath: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
    isFolder: true
  }));

  const targets = selectedPeerIds.size > 0 
    ? Array.from(selectedPeerIds) 
    : (currentSelectedPeerId ? [currentSelectedPeerId] : currentPeerList.map(p => p.id));

  if (targets.length === 0) {
    showToast('No devices available to send to. Open this page on your other device first.', 'warn');
    folderInput.value = '';
    return;
  }

  currentSelectedPeerId = null;
  prepareAndSendItems(targets, items);
  folderInput.value = '';
};

// ==========================================
// 7. TRANSFER DISPATCH & PROGRESS MANAGEMENT
// ==========================================
function sendItemsSequentiallyToPeer(targetPeerId, items) {
  const peer = currentPeerList.find(p => p.id === targetPeerId);
  const targetName = peer ? peer.deviceName : 'Peer';
  const batchId = 'batch_' + Math.random().toString(36).substring(2, 9);
  let currentIndex = 0;
  let batchCancelled = false;

  function sendNext() {
    if (batchCancelled || currentIndex >= items.length) {
      if (!batchCancelled && items.length > 1) {
        showToast(`All ${items.length} files sent to ${targetName}!`, 'success');
      }
      return;
    }

    const item = items[currentIndex];
    const fileId = Math.random().toString(36).substring(2, 9);
    const transferKey = `${fileId}_${targetPeerId}`;
    const fileIndex = currentIndex + 1;
    const fileTotal = items.length;

    const displayName = fileTotal > 1 
      ? `(${fileIndex}/${fileTotal}) ${item.file.name}` 
      : item.file.name;

    const queueData = {
      fileId,
      batchId,
      batchIndex: fileIndex,
      batchTotal: fileTotal,
      targetPeerId,
      items: [item],
      isFolder: false,
      totalSize: item.file.size,
      onComplete: () => {
        currentIndex++;
        sendNext();
      },
      onCancel: () => {
        batchCancelled = true;
      }
    };
    outboundQueue.set(fileId, queueData);

    activeTransfers.set(transferKey, {
      fileId,
      batchId,
      batchIndex: fileIndex,
      batchTotal: fileTotal,
      transferKey,
      targetPeerId,
      targetName,
      name: item.file.name,
      size: item.file.size,
      isFolder: false,
      fileCount: 1,
      direction: 'outbound',
      status: 'requesting',
      cancelled: false
    });

    createTransferUI(transferKey, displayName, item.file.size, 'outbound', targetName);

    // Register session with backend stream bridge
    fetch('/api/transfer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        senderPeerId: myPeerId,
        targetPeerId,
        name: item.file.name,
        size: item.file.size,
        isFolder: false,
        fileCount: 1
      })
    }).catch(err => console.warn('[Transfer] Session create error:', err));

    // Send transfer request to peer
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'file-request',
        target: targetPeerId,
        fileId,
        batchId,
        batchIndex: fileIndex,
        batchTotal: fileTotal,
        file: {
          name: item.file.name,
          size: item.file.size,
          isFolder: false,
          fileCount: 1,
          mime: item.file.type || 'application/octet-stream'
        }
      }));
    } else {
      showToast('WebSocket connection error. Please refresh.', 'error');
    }

    if (fileTotal > 1) {
      showToast(`Sending file ${fileIndex} of ${fileTotal}: "${item.file.name}"`, 'info');
    }
  }

  sendNext();
}

function prepareAndSendItems(targetPeerIds, items) {
  if (!items || items.length === 0) return;

  // Check if this is a folder transfer
  const isFolder = items.some(item => item.isFolder || (item.relativePath && item.relativePath.includes('/')));

  if (isFolder) {
    let folderName = 'Folder';
    const firstRel = (items[0].relativePath || '').replace(/\\/g, '/');
    folderName = firstRel.split('/')[0] || 'Shared_Folder';

    const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
    const fileId = Math.random().toString(36).substring(2, 9);

    outboundQueue.set(fileId, {
      fileId,
      items,
      isFolder: true,
      folderName,
      totalSize,
      targetPeerIds
    });

    targetPeerIds.forEach(targetPeerId => {
      const peer = currentPeerList.find(p => p.id === targetPeerId);
      const targetName = peer ? peer.deviceName : 'Peer';
      const transferKey = `${fileId}_${targetPeerId}`;

      activeTransfers.set(transferKey, {
        fileId,
        transferKey,
        targetPeerId,
        targetName,
        name: folderName,
        size: totalSize,
        isFolder: true,
        fileCount: items.length,
        direction: 'outbound',
        status: 'requesting',
        cancelled: false
      });

      createTransferUI(transferKey, `${folderName} (Folder)`, totalSize, 'outbound', targetName);

      // Register session with backend stream bridge
      fetch('/api/transfer/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          senderPeerId: myPeerId,
          targetPeerId,
          name: folderName,
          size: totalSize,
          isFolder: true,
          fileCount: items.length
        })
      }).catch(err => console.warn('[Transfer] Session create error:', err));

      // Send transfer request to peer
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'file-request',
          target: targetPeerId,
          fileId,
          file: {
            name: folderName,
            size: totalSize,
            isFolder: true,
            fileCount: items.length,
            mime: 'application/octet-stream'
          }
        }));
      } else {
        showToast('WebSocket connection error. Please refresh.', 'error');
      }
    });

    showToast(`Folder transfer requested to ${targetPeerIds.length} peer(s)`, 'info');
    return;
  }

  // Files transfer: Send items as they are, one after another! (Original filenames preserved, uncapped speed)
  targetPeerIds.forEach(targetPeerId => {
    sendItemsSequentiallyToPeer(targetPeerId, items);
  });
}

function handleIncomingFileRequest(data) {
  console.log('[Transfer] Incoming transfer request from peer:', data);

  // If this file belongs to a batch that the user already accepted, auto-accept and download immediately!
  if (data.batchId && approvedBatches.has(data.batchId)) {
    const { sender, senderName, fileId, file, batchIndex, batchTotal } = data;
    const transferKey = `${fileId}_${sender}`;

    activeTransfers.set(transferKey, {
      fileId,
      batchId: data.batchId,
      transferKey,
      targetPeerId: sender,
      targetName: senderName,
      name: file.name,
      size: file.size,
      isFolder: false,
      fileCount: 1,
      direction: 'inbound',
      status: 'connecting',
      cancelled: false
    });

    const displayName = (batchTotal && batchTotal > 1)
      ? `(${batchIndex}/${batchTotal}) ${file.name}`
      : file.name;

    createTransferUI(transferKey, displayName, file.size, 'inbound', senderName);

    // Stream download safely via fetch and in-memory Blob to prevent browser "Insecure download blocked" warnings
    receiveStreamToFile(fileId, file.name, file.size, transferKey, file.type || file.mime);

    // Notify sender accepted
    ws.send(JSON.stringify({
      type: 'file-response',
      target: sender,
      fileId,
      accepted: true
    }));

    showToast(`Receiving (${batchIndex}/${batchTotal}): "${file.name}"`, 'info');
    return;
  }

  incomingRequest = data;
  const isMulti = data.batchTotal && data.batchTotal > 1;

  if (data.file.isFolder) {
    incomingSenderText.textContent = `${data.senderName} wants to send a folder`;
    incomingFileName.textContent = data.file.name;
    incomingFileSize.textContent = `${formatBytes(data.file.size)} (${data.file.fileCount} files)`;
    incomingFileBadgeIcon.innerHTML = '<i data-lucide="folder" class="w-5 h-5 text-amber-400"></i>';
    incomingModalTitle.textContent = 'Incoming Folder Transfer';
    acceptBtn.innerHTML = '<i data-lucide="folder-down" class="w-4 h-4"></i><span>Select Folder & Receive</span>';
  } else {
    incomingSenderText.textContent = isMulti
      ? `${data.senderName} wants to send ${data.batchTotal} files`
      : `${data.senderName} wants to send a file`;
    incomingFileName.textContent = isMulti
      ? `(1 of ${data.batchTotal}) ${data.file.name}`
      : data.file.name;
    incomingFileSize.textContent = formatBytes(data.file.size);
    incomingFileBadgeIcon.innerHTML = '<i data-lucide="file" class="w-5 h-5 text-blue-400"></i>';
    incomingModalTitle.textContent = isMulti ? 'Incoming Files Request' : 'Incoming File Request';
    acceptBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Accept & Start</span>';
  }

  // Make modal strictly visible
  incomingModal.classList.remove('hidden');

  // Audio chime alert
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}

  if (window.lucide) lucide.createIcons();
}

acceptBtn.onclick = async () => {
  if (!incomingRequest) return;
  const { sender, senderName, fileId, file, batchId, batchIndex, batchTotal } = incomingRequest;

  if (batchId) {
    approvedBatches.add(batchId);
  }

  let chosenHandle = null;

  // Direct Folder Placement: Receiver picks or creates destination folder on their PC (NO ZIP!)
  if (file.isFolder) {
    if (window.isSecureContext && typeof window.showDirectoryPicker === 'function') {
      try {
        showToast(`Select destination folder on your PC for "${file.name}"...`, 'info');
        const parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        // Automatically create or get the target folder inside the picked directory
        chosenHandle = await parentHandle.getDirectoryHandle(file.name, { create: true });
        showToast(`Saving directly into folder "${chosenHandle.name}"`, 'success');
      } catch (err) {
        if (err.name === 'AbortError') {
          showToast('Folder selection cancelled. Please pick a destination folder to accept.', 'warn');
          return; // KEEP MODAL OPEN so user can retry or decline!
        }
        console.warn('showDirectoryPicker error:', err);
      }
    } else {
      showToast('Notice: Direct folder saving requires Chrome, Edge, or HTTPS.', 'warn');
    }
  }

  incomingModal.classList.add('hidden');

  const transferKey = `${fileId}_${sender}`;
  activeTransfers.set(transferKey, {
    fileId,
    batchId,
    transferKey,
    targetPeerId: sender,
    targetName: senderName,
    name: file.name,
    size: file.size,
    isFolder: file.isFolder,
    fileCount: file.fileCount,
    direction: 'inbound',
    status: 'connecting',
    cancelled: false,
    destDirHandle: chosenHandle
  });

  // Reset and initialize receiver state
  const receiverState = getOrCreateReceiver(sender);
  receiverState.meta = null;
  receiverState.receivedBytesTotal = 0;
  receiverState.currentFileIndex = 0;
  receiverState.receivedFileBuffers = [];
  receiverState.currentFileBytes = 0;
  receiverState.accumulatedFiles = [];
  receiverState.destDirHandle = chosenHandle;

  const displayName = (batchTotal && batchTotal > 1)
    ? `(${batchIndex || 1}/${batchTotal}) ${file.name}`
    : file.name;

  createTransferUI(transferKey, displayName, file.size, 'inbound', senderName);

  if (!file.isFolder) {
    // Stream download safely via fetch and in-memory Blob to prevent browser "Insecure download blocked" warnings
    receiveStreamToFile(fileId, file.name, file.size, transferKey, file.type || file.mime);
  }

  ws.send(JSON.stringify({
    type: 'file-response',
    target: sender,
    fileId,
    accepted: true
  }));

  showToast(`Accepted transfer from ${senderName}`, 'info');
  incomingRequest = null;
};

declineBtn.onclick = () => {
  if (!incomingRequest) return;
  const { sender, fileId, batchId } = incomingRequest;
  if (batchId) {
    approvedBatches.delete(batchId);
  }
  incomingModal.classList.add('hidden');

  ws.send(JSON.stringify({
    type: 'file-response',
    target: sender,
    fileId,
    accepted: false
  }));

  incomingRequest = null;
  selectedFolderDestHandle = null;
};

function handleFileResponse(data) {
  const transferKey = `${data.fileId}_${data.sender}`;
  const transfer = activeTransfers.get(transferKey);
  const queueData = outboundQueue.get(data.fileId);

  if (data.accepted) {
    showToast(`${data.senderName} accepted "${transfer ? transfer.name : 'file'}"`, 'success');
    const speedEl = document.getElementById(`speed-${transferKey}`);
    if (speedEl) speedEl.textContent = 'Starting transfer...';

    if (queueData && queueData.isFolder) {
      // FOLDER TRANSFER: Stream directly peer-to-peer / WS relay so receiver writes files directly to disk (NO ZIP!)
      startSendingOutbound(data.sender, data.fileId);
    } else {
      // FILE TRANSFER: Stream native HTTP upload directly to receiver's browser download manager
      setTimeout(() => {
        const t = activeTransfers.get(transferKey);
        if (t && t.status !== 'transferring' && t.status !== 'completed' && !t.cancelled) {
          startSendingStreamOutbound(data.fileId);
        }
      }, 300);
    }
  } else {
    showToast(`${data.senderName} declined the transfer`, 'error');
    if (queueData && queueData.onCancel) {
      queueData.onCancel();
    }
    cancelTransfer(transferKey, false, 'Declined by recipient');
  }
}

// UI Transfer Progress Cards
function createTransferUI(transferKey, name, size, direction, peerName) {
  transfersSection.classList.remove('hidden');
  const div = document.createElement('div');
  div.id = `transfer-${transferKey}`;
  div.className = 'apple-glass peer-card-enter p-4 space-y-2.5 rounded-2xl transition-all';

  div.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-2.5 overflow-hidden">
        <i data-lucide="${direction === 'outbound' ? 'upload' : 'download'}" class="w-4 h-4 text-blue-400 shrink-0"></i>
        <div class="overflow-hidden">
          <p class="text-xs font-semibold text-white tracking-tight truncate">${name}</p>
          <p class="text-[10px] text-white/60 truncate font-normal">${direction === 'outbound' ? 'Sending to' : 'Receiving from'} <span class="text-white font-medium">${peerName}</span></p>
        </div>
      </div>
      <div class="flex items-center space-x-2 shrink-0 ml-2">
        <span id="speed-${transferKey}" class="text-[11px] text-white/60 font-medium">${direction === 'outbound' ? 'Waiting for peer...' : 'Connecting...'}</span>
        <button id="cancel-btn-${transferKey}" class="p-1.5 text-white/60 hover:text-rose-400 hover:bg-white/10 rounded-xl transition" title="Cancel Transfer">
          <i data-lucide="ban" class="w-3.5 h-3.5"></i>
        </button>
        <button id="clear-btn-${transferKey}" class="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition hidden" title="Dismiss">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
    <div class="w-full bg-black/40 border border-white/10 h-2.5 rounded-full overflow-hidden p-0.5 backdrop-blur-sm">
      <div id="progress-${transferKey}" class="bg-gradient-to-r from-blue-500 to-cyan-400 progress-shimmer h-full rounded-full transition-all duration-200 shadow-sm" style="width: 0%"></div>
    </div>
    <div class="flex justify-between text-[11px] text-white/60 font-medium">
      <span id="transferred-${transferKey}">0 B / ${formatBytes(size)}</span>
      <span id="percent-${transferKey}">0%</span>
    </div>
  `;

  transfersList.prepend(div);
  if (window.lucide) lucide.createIcons();

  const cancelBtn = div.querySelector(`#cancel-btn-${transferKey}`);
  cancelBtn.onclick = () => {
    cancelTransfer(transferKey, true, 'Cancelled');
  };

  const clearBtn = div.querySelector(`#clear-btn-${transferKey}`);
  clearBtn.onclick = () => {
    removeTransferUI(transferKey);
  };
}

function updateTransferProgress(transferKey, transferred, total, speedMbps) {
  const transfer = activeTransfers.get(transferKey);
  if (transfer && transfer.cancelled) return;

  const percent = Math.min(100, Math.round((transferred / total) * 100));
  const prog = document.getElementById(`progress-${transferKey}`);
  const speed = document.getElementById(`speed-${transferKey}`);
  const trans = document.getElementById(`transferred-${transferKey}`);
  const perc = document.getElementById(`percent-${transferKey}`);
  const cancelBtn = document.getElementById(`cancel-btn-${transferKey}`);
  const clearBtn = document.getElementById(`clear-btn-${transferKey}`);

  if (prog) prog.style.width = `${percent}%`;
  if (speed) {
    const numSpeed = typeof speedMbps === 'number' ? speedMbps : parseFloat(speedMbps);
    speed.textContent = (!isNaN(numSpeed) && isFinite(numSpeed) && numSpeed >= 0)
      ? `${numSpeed.toFixed(1)} Mbps`
      : 'Transferring...';
  }
  if (trans) trans.textContent = `${formatBytes(transferred)} / ${formatBytes(total)}`;
  if (perc) perc.textContent = `${percent}%`;

  if (percent === 100) {
    if (speed) {
      speed.textContent = 'Completed';
      speed.className = 'text-[11px] text-emerald-400 font-semibold shrink-0';
    }
    if (prog) prog.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-150 shadow-sm';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');
  }
}

function cancelTransfer(transferKey, notifyPeer = true, reason = 'Cancelled') {
  const transfer = activeTransfers.get(transferKey);
  if (transfer) {
    transfer.cancelled = true;
    transfer.status = 'cancelled';

    if (transfer.xhr) {
      try { transfer.xhr.abort(); } catch (_) {}
    }

    if (transfer.fileId) {
      const queueData = outboundQueue.get(transfer.fileId);
      if (queueData && queueData.onCancel) {
        queueData.onCancel();
      }
      fetch(`/api/transfer/cancel/${transfer.fileId}`, { method: 'POST' }).catch(() => {});
    }

    if (notifyPeer && ws.readyState === WebSocket.OPEN && transfer.targetPeerId) {
      ws.send(JSON.stringify({
        type: 'cancel-transfer',
        target: transfer.targetPeerId,
        fileId: transfer.fileId
      }));
    }
  }

  const speed = document.getElementById(`speed-${transferKey}`);
  const prog = document.getElementById(`progress-${transferKey}`);
  const cancelBtn = document.getElementById(`cancel-btn-${transferKey}`);
  const clearBtn = document.getElementById(`clear-btn-${transferKey}`);

  if (speed) {
    speed.textContent = reason;
    speed.className = 'text-[11px] text-rose-400 font-semibold shrink-0';
  }
  if (prog) prog.className = 'bg-rose-500/80 h-full rounded-full transition-all duration-150';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function removeTransferUI(transferKey) {
  const el = document.getElementById(`transfer-${transferKey}`);
  if (el) {
    el.style.transition = 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(0.96)';
    setTimeout(() => {
      el.remove();
      if (transfersList.children.length === 0) {
        transfersSection.classList.add('hidden');
      }
    }, 220);
  }
  activeTransfers.delete(transferKey);
}

if (clearAllTransfersBtn) {
  clearAllTransfersBtn.onclick = () => {
    Array.from(activeTransfers.keys()).forEach(key => {
      const transfer = activeTransfers.get(key);
      if (transfer && (transfer.status === 'completed' || transfer.cancelled)) {
        removeTransferUI(key);
      }
    });
  };
}

// ==========================================
// 8. WEBRTC STREAMING PIPELINE WITH FOLDER SUPPORT
// ==========================================
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function getOrCreatePeerConnection(targetPeerId) {
  if (activePeers.has(targetPeerId)) {
    return activePeers.get(targetPeerId);
  }

  const pc = new RTCPeerConnection(rtcConfig);
  const peerObj = { pc, dataChannel: null, pendingCandidates: [] };
  activePeers.set(targetPeerId, peerObj);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'signal-ice',
        target: targetPeerId,
        candidate: event.candidate
      }));
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE connection state with ${targetPeerId}: ${pc.iceConnectionState}`);
  };

  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state with ${targetPeerId}: ${pc.connectionState}`);
  };

  pc.ondatachannel = (event) => {
    console.log(`[WebRTC] Received DataChannel from ${targetPeerId}`);
    setupDataChannel(targetPeerId, event.channel);
  };

  return peerObj;
}

async function handleOffer(data) {
  const peerObj = getOrCreatePeerConnection(data.sender);
  await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.offer));

  // Flush any pending ICE candidates received before remote offer
  if (peerObj.pendingCandidates && peerObj.pendingCandidates.length > 0) {
    for (const cand of peerObj.pendingCandidates) {
      try {
        await peerObj.pc.addIceCandidate(cand);
      } catch (e) {
        console.warn('[WebRTC] Error adding buffered ICE candidate:', e);
      }
    }
    peerObj.pendingCandidates = [];
  }

  const answer = await peerObj.pc.createAnswer();
  await peerObj.pc.setLocalDescription(answer);

  ws.send(JSON.stringify({
    type: 'signal-answer',
    target: data.sender,
    answer
  }));
}

async function handleAnswer(data) {
  const peerObj = activePeers.get(data.sender);
  if (peerObj && peerObj.pc) {
    await peerObj.pc.setRemoteDescription(new RTCSessionDescription(data.answer));

    // Flush any pending ICE candidates received before remote answer
    if (peerObj.pendingCandidates && peerObj.pendingCandidates.length > 0) {
      for (const cand of peerObj.pendingCandidates) {
        try {
          await peerObj.pc.addIceCandidate(cand);
        } catch (e) {
          console.warn('[WebRTC] Error adding buffered ICE candidate:', e);
        }
      }
      peerObj.pendingCandidates = [];
    }
  }
}

async function handleIceCandidate(data) {
  const peerObj = activePeers.get(data.sender) || getOrCreatePeerConnection(data.sender);
  if (peerObj && peerObj.pc) {
    if (!peerObj.pc.remoteDescription || !peerObj.pc.remoteDescription.type) {
      // Buffer until setRemoteDescription completes
      peerObj.pendingCandidates = peerObj.pendingCandidates || [];
      peerObj.pendingCandidates.push(new RTCIceCandidate(data.candidate));
    } else {
      try {
        await peerObj.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.warn('[WebRTC] addIceCandidate failed:', err);
      }
    }
  }
}

// Receiver state map for incoming transfers: peerId -> receiverState
const peerReceivers = new Map();

function getOrCreateReceiver(peerId) {
  if (!peerReceivers.has(peerId)) {
    peerReceivers.set(peerId, {
      meta: null,
      receivedBytesTotal: 0,
      currentFileIndex: 0,
      receivedFileBuffers: [],
      currentFileBytes: 0,
      accumulatedFiles: [],
      destDirHandle: null,
      startTime: null
    });
  }
  return peerReceivers.get(peerId);
}

function setupDataChannel(targetPeerId, channel) {
  const peerObj = activePeers.get(targetPeerId);
  if (peerObj) peerObj.dataChannel = channel;

  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = LOW_WATER_MARK;

  channel.onmessage = async (e) => {
    if (typeof e.data === 'string') {
      const parsed = JSON.parse(e.data);
      if (parsed.type === 'transfer-meta') {
        handleIncomingMetaEnvelope(targetPeerId, parsed);
      } else if (parsed.type === 'file-header') {
        handleIncomingFileHeader(targetPeerId, parsed);
      } else if (parsed.type === 'transfer-done') {
        await finalizeIncomingTransfer(targetPeerId, parsed.fileId);
      }
    } else {
      await handleIncomingBinaryBuffer(targetPeerId, e.data);
    }
  };
}

function handleIncomingMetaEnvelope(senderId, meta) {
  const state = getOrCreateReceiver(senderId);
  state.meta = meta;
  state.receivedBytesTotal = 0;
  state.currentFileIndex = 0;
  state.receivedFileBuffers = [];
  state.currentFileBytes = 0;
  state.accumulatedFiles = [];
  state.startTime = Date.now();
  console.log(`[Transfer] Incoming transfer manifest for "${meta.name}" (${meta.files.length} files, ${meta.totalSize} bytes)`);
}

function getCleanFolderRelativePath(folderName, relPath) {
  let clean = (relPath || '').replace(/^[\\/]+/, '');
  if (folderName && clean.startsWith(folderName + '/')) {
    clean = clean.substring(folderName.length + 1);
  } else if (folderName && clean.startsWith(folderName + '\\')) {
    clean = clean.substring(folderName.length + 1);
  }
  return clean;
}

function handleIncomingFileHeader(senderId, header) {
  const state = getOrCreateReceiver(senderId);
  state.currentFileIndex = header.fileIndex;
  state.receivedFileBuffers = [];
  state.currentFileBytes = 0;

  // Handle 0-byte file immediately
  if (header.size === 0) {
    if (state.destDirHandle) {
      const cleanRelPath = getCleanFolderRelativePath(state.meta ? state.meta.name : '', header.relativePath);
      writeBlobToDirectoryHandle(state.destDirHandle, cleanRelPath, new Blob([], { type: 'application/octet-stream' })).catch(err => {
        console.error('Failed writing 0-byte file to disk:', err);
      });
    } else {
      state.accumulatedFiles.push({
        relativePath: header.relativePath,
        name: header.relativePath.split('/').pop(),
        blob: new Blob([], { type: 'application/octet-stream' })
      });
    }
  }
}

// Helper: Recursively write a file/blob to a chosen directory handle with directory tree recreation
async function writeBlobToDirectoryHandle(rootDirHandle, relativePath, blob) {
  const clean = (relativePath || '').replace(/^[\\/]+/, '');
  const parts = clean.split(/[\\/]+/).filter(p => p.length > 0);
  if (parts.length === 0) return;

  let currentHandle = rootDirHandle;

  // Create any needed subdirectories
  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
  }

  // Create or overwrite file
  const fileName = parts[parts.length - 1];
  const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function handleIncomingBinaryBuffer(senderId, arrayBuffer) {
  const state = getOrCreateReceiver(senderId);
  if (!state.meta) return;

  const transferKey = `${state.meta.fileId}_${senderId}`;
  const transfer = activeTransfers.get(transferKey);
  if (transfer && transfer.cancelled) return;

  state.receivedFileBuffers.push(arrayBuffer);
  state.currentFileBytes += arrayBuffer.byteLength;
  state.receivedBytesTotal += arrayBuffer.byteLength;

  const displayTransferred = Math.min(state.receivedBytesTotal, state.meta.totalSize);
  const elapsedSec = (Date.now() - state.startTime) / 1000 || 0.001;
  const speedMbps = ((state.receivedBytesTotal * 8) / (1024 * 1024)) / elapsedSec;
  updateTransferProgress(transferKey, displayTransferred, state.meta.totalSize, speedMbps);

  const targetFileMeta = state.meta.files[state.currentFileIndex];
  if (targetFileMeta && state.currentFileBytes >= targetFileMeta.size) {
    const fileBlob = new Blob(state.receivedFileBuffers, { type: targetFileMeta.mime || 'application/octet-stream' });
    
    if (state.destDirHandle) {
      // Direct Disk Streaming: Write file directly to folder on disk (0 RAM accumulation, NO ZIP!)
      const cleanRelPath = getCleanFolderRelativePath(state.meta.name, targetFileMeta.relativePath);
      writeBlobToDirectoryHandle(state.destDirHandle, cleanRelPath, fileBlob).catch(err => {
        console.error('Failed writing file to disk:', err);
      });
    } else {
      state.accumulatedFiles.push({
        relativePath: targetFileMeta.relativePath,
        name: targetFileMeta.name || targetFileMeta.relativePath.split('/').pop(),
        blob: fileBlob
      });
    }

    // Reset buffer for next file immediately to keep memory footprint near 0 MB
    state.receivedFileBuffers = [];
    state.currentFileBytes = 0;
  }
}

async function finalizeIncomingTransfer(senderId, fileId) {
  const state = getOrCreateReceiver(senderId);
  if (!state.meta) return;

  const transferKey = `${state.meta.fileId}_${senderId}`;
  const transfer = activeTransfers.get(transferKey);
  if (transfer && transfer.cancelled) return;

  // Flush any remaining buffers for current file into disk or list
  if (state.receivedFileBuffers.length > 0 && state.meta.files && state.meta.files[state.currentFileIndex]) {
    const targetFileMeta = state.meta.files[state.currentFileIndex];
    const fileBlob = new Blob(state.receivedFileBuffers, { type: targetFileMeta.mime || 'application/octet-stream' });
    if (state.destDirHandle) {
      const cleanRelPath = getCleanFolderRelativePath(state.meta.name, targetFileMeta.relativePath);
      await writeBlobToDirectoryHandle(state.destDirHandle, cleanRelPath, fileBlob);
    } else {
      state.accumulatedFiles.push({
        relativePath: targetFileMeta.relativePath,
        name: targetFileMeta.name || targetFileMeta.relativePath.split('/').pop(),
        blob: fileBlob
      });
    }
    state.receivedFileBuffers = [];
    state.currentFileBytes = 0;
  }

  const isFolder = !!(state.meta && state.meta.isFolder);
  const destDirHandle = state.destDirHandle;

  try {
    if (destDirHandle) {
      // 1. All files were written directly to the chosen folder on disk
      showToast(`Folder "${state.meta.name}" saved directly to your computer!`, 'success');
    } else if (state.accumulatedFiles.length > 0) {
      // 2. Direct file downloads (no zip!)
      for (const item of state.accumulatedFiles) {
        triggerDownload(item.blob, item.relativePath.split('/').pop() || item.name);
      }
      showToast(`Downloaded ${state.accumulatedFiles.length} file(s)!`, 'success');
    } else {
      showToast(`Transfer of "${state.meta.name}" completed!`, 'success');
    }
  } catch (err) {
    console.error('[Finalize Transfer] Error delivering download:', err);
    showToast(`Notice: ${err.message}`, 'error');
  }

  if (transfer) transfer.status = 'completed';
  updateTransferCompleted(transferKey);

  state.meta = null;
  state.receivedFileBuffers = [];
  state.currentFileBytes = 0;
  state.accumulatedFiles = [];
  state.destDirHandle = null;
}

function updateTransferCompleted(transferKey) {
  const prog = document.getElementById(`progress-${transferKey}`);
  const speed = document.getElementById(`speed-${transferKey}`);
  const percent = document.getElementById(`percent-${transferKey}`);
  const trans = document.getElementById(`transferred-${transferKey}`);
  const cancelBtn = document.getElementById(`cancel-btn-${transferKey}`);
  const clearBtn = document.getElementById(`clear-btn-${transferKey}`);

  const transfer = activeTransfers.get(transferKey);
  if (transfer && trans) {
    trans.textContent = `${formatBytes(transfer.size)} / ${formatBytes(transfer.size)}`;
  }

  if (prog) {
    prog.style.width = '100%';
    prog.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300 shadow-sm';
  }
  if (speed) {
    speed.textContent = 'Completed';
    speed.className = 'text-[11px] text-emerald-400 font-semibold shrink-0';
  }
  if (percent) percent.textContent = '100%';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function getClientMime(ext) {
  const map = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    txt: 'text/plain',
    json: 'application/json',
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return map[ext] || '';
}

// Ingest stream via fetch and deliver as an in-memory Blob.
// This completely bypasses Chrome/Edge "Insecure download blocked" warnings on LAN HTTP networks,
// because Blob URLs (blob:...) are exempt from browser insecure download blocking policies.
async function receiveStreamToFile(fileId, fileName, totalSize, transferKey, fileMime) {
  try {
    const downloadUrl = `/api/transfer/download/${fileId}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const transfer = activeTransfers.get(transferKey);
    if (transfer) transfer.status = 'transferring';

    const reader = res.body.getReader();
    const chunks = [];
    let receivedBytes = 0;
    let lastProgressTime = Date.now();
    let bytesSinceLast = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedBytes += value.byteLength;
      bytesSinceLast += value.byteLength;

      const now = Date.now();
      if (now - lastProgressTime >= 100) {
        const timeDiff = (now - lastProgressTime) / 1000;
        const speedMbps = timeDiff > 0 ? ((bytesSinceLast * 8) / (1024 * 1024 * timeDiff)) : 0;
        updateTransferProgress(transferKey, receivedBytes, totalSize || receivedBytes, speedMbps);
        lastProgressTime = now;
        bytesSinceLast = 0;
      }
    }

    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const mime = fileMime || getClientMime(ext) || 'application/octet-stream';
    const blob = new Blob(chunks, { type: mime });

    // Deliver cleanly to user via Blob URL
    triggerDownload(blob, fileName);

    if (transfer) transfer.status = 'completed';
    updateTransferCompleted(transferKey);
    showToast(`Transfer of "${fileName}" completed!`, 'success');
  } catch (err) {
    console.error('[Receive Stream] Error downloading file stream:', err);
    showToast(`Download error: ${err.message}`, 'error');
    cancelTransfer(transferKey, false, err.message);
  }
}

function triggerDownload(urlOrBlob, filename) {
  const safeFilename = filename || 'downloaded-file';
  const a = document.createElement('a');
  let isObjectURL = false;
  if (typeof urlOrBlob === 'string') {
    a.href = urlOrBlob;
  } else {
    a.href = URL.createObjectURL(urlOrBlob);
    isObjectURL = true;
  }
  a.download = safeFilename;
  a.rel = 'noopener noreferrer';
  a.target = '_self';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    if (isObjectURL) {
      URL.revokeObjectURL(a.href);
    }
  }, 2000);
}

// Synchronized Outbound Streaming (High-Speed Native HTTP Stream, Uncapped Link Speed, Lockstep Sync)
async function startSendingStreamOutbound(fileId) {
  const queueData = outboundQueue.get(fileId);
  if (!queueData || !queueData.items || queueData.items.length === 0) return;

  const transferEntry = Array.from(activeTransfers.values()).find(t => t.fileId === fileId);
  const targetPeerId = transferEntry ? transferEntry.targetPeerId : null;
  const transferKey = `${fileId}_${targetPeerId}`;
  const transfer = activeTransfers.get(transferKey);
  if (!transfer || transfer.cancelled) return;

  // If folder, redirect to directory streaming pipeline
  if (queueData.isFolder) {
    if (targetPeerId) {
      startSendingOutbound(targetPeerId, fileId);
    }
    return;
  }

  transfer.status = 'transferring';
  const speedEl = document.getElementById(`speed-${transferKey}`);
  if (speedEl) speedEl.textContent = 'Transferring...';

  const item = queueData.items[0];
  const startTime = Date.now();

  try {
    const xhr = new XMLHttpRequest();
    transfer.xhr = xhr;

    xhr.open('POST', `/api/transfer/upload/${fileId}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');

    xhr.upload.onprogress = (evt) => {
      if (transfer.cancelled) return;
      const loaded = evt.loaded;
      const total = evt.total || item.file.size;
      const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
      const speedMbps = ((loaded * 8) / (1024 * 1024)) / elapsedSec;
      updateTransferProgress(transferKey, loaded, total, speedMbps);
    };

    xhr.onload = () => {
      if (transfer.cancelled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        transfer.status = 'completed';
        updateTransferCompleted(transferKey);
        if (queueData.onComplete) {
          const cb = queueData.onComplete;
          queueData.onComplete = null;
          cb();
        }
      } else {
        console.error('[Upload Stream] Failed HTTP status:', xhr.status);
        if (queueData.onCancel) queueData.onCancel();
        cancelTransfer(transferKey, true, `Upload failed (${xhr.status})`);
      }
    };

    xhr.onerror = () => {
      if (!transfer.cancelled) {
        console.error('[Upload Stream] Network error');
        if (queueData.onCancel) queueData.onCancel();
        cancelTransfer(transferKey, true, 'Upload network error');
      }
    };

    xhr.onabort = () => {
      console.log('[Upload Stream] Upload aborted');
    };

    xhr.send(item.file);
  } catch (err) {
    console.error('[Stream Transfer] Error:', err);
    if (queueData.onCancel) queueData.onCancel();
    cancelTransfer(transferKey, true, err.message);
  }
}

// Outbound streaming for files and folders
async function startSendingOutbound(targetPeerId, fileId) {
  const queueData = outboundQueue.get(fileId);
  if (!queueData) return;

  const peerObj = getOrCreatePeerConnection(targetPeerId);

  // If DataChannel is already established and open, stream immediately
  if (peerObj.dataChannel && peerObj.dataChannel.readyState === 'open') {
    streamQueueToPeer(peerObj.dataChannel, queueData, targetPeerId);
    return;
  }

  let connectionResolved = false;

  // 3.0s Fallback timer: If WebRTC DataChannel doesn't open within 3.0 seconds,
  // switch transparently to WebSocket relay streaming so the user NEVER gets stuck!
  const fallbackTimer = setTimeout(() => {
    if (!connectionResolved) {
      connectionResolved = true;
      console.warn(`[Transfer] WebRTC DataChannel open timed out (3.0s) for ${targetPeerId}. Switching to WebSocket Local Relay.`);
      const transferKey = `${fileId}_${targetPeerId}`;
      const speedEl = document.getElementById(`speed-${transferKey}`);
      if (speedEl) speedEl.textContent = 'Relaying (LAN WS)...';
      streamQueueViaWebSocket(queueData, targetPeerId);
    }
  }, 3000);

  const dc = peerObj.pc.createDataChannel('fileTransfer');
  setupDataChannel(targetPeerId, dc);

  dc.onopen = () => {
    if (!connectionResolved) {
      connectionResolved = true;
      clearTimeout(fallbackTimer);
      console.log(`[Transfer] WebRTC DataChannel opened successfully with ${targetPeerId}`);
      streamQueueToPeer(dc, queueData, targetPeerId);
    }
  };

  dc.onerror = (err) => {
    console.warn(`[Transfer] DataChannel error with ${targetPeerId}:`, err);
    if (!connectionResolved) {
      connectionResolved = true;
      clearTimeout(fallbackTimer);
      streamQueueViaWebSocket(queueData, targetPeerId);
    }
  };

  try {
    const offer = await peerObj.pc.createOffer();
    await peerObj.pc.setLocalDescription(offer);

    ws.send(JSON.stringify({
      type: 'signal-offer',
      target: targetPeerId,
      offer
    }));
  } catch (err) {
    console.warn('[WebRTC] Offer creation failed, triggering WebSocket relay:', err);
    if (!connectionResolved) {
      connectionResolved = true;
      clearTimeout(fallbackTimer);
      streamQueueViaWebSocket(queueData, targetPeerId);
    }
  }
}

// WebSocket Relay Streaming Fallback (High-Speed Raw Binary Framing)
async function streamQueueViaWebSocket(queueData, targetPeerId) {
  const transferKey = `${queueData.fileId}_${targetPeerId}`;
  const transfer = activeTransfers.get(transferKey);
  if (!transfer || transfer.cancelled) return;

  console.log(`[WS Stream] Streaming ${queueData.items.length} file(s) to ${targetPeerId} via WebSocket (Binary Fast-Pipe)`);
  const speedEl = document.getElementById(`speed-${transferKey}`);
  if (speedEl) speedEl.textContent = 'Transferring (LAN WS)...';

  // 1. Send transfer manifest envelope
  ws.send(JSON.stringify({
    type: 'ws-transfer-meta',
    target: targetPeerId,
    meta: {
      type: 'transfer-meta',
      fileId: queueData.fileId,
      name: queueData.isFolder ? queueData.folderName : (queueData.items.length > 1 ? `${queueData.items.length} Files` : queueData.items[0].file.name),
      isFolder: queueData.isFolder,
      totalSize: queueData.totalSize,
      files: queueData.items.map((item, idx) => ({
        fileIndex: idx,
        relativePath: item.relativePath,
        size: item.file.size,
        mime: item.file.type || 'application/octet-stream'
      }))
    }
  }));

  let totalOffset = 0;
  const startTime = Date.now();

  for (let fileIdx = 0; fileIdx < queueData.items.length; fileIdx++) {
    if (transfer.cancelled || ws.readyState !== WebSocket.OPEN) break;

    const item = queueData.items[fileIdx];

    // Send file header
    ws.send(JSON.stringify({
      type: 'ws-file-header',
      target: targetPeerId,
      fileIndex: fileIdx,
      relativePath: item.relativePath,
      size: item.file.size
    }));

    if (item.file.size === 0) continue;

    let fileOffset = 0;
    while (fileOffset < item.file.size) {
      if (transfer.cancelled || ws.readyState !== WebSocket.OPEN) break;

      // 1MB in-memory block read from disk
      const blockEnd = Math.min(fileOffset + DISK_BLOCK_SIZE, item.file.size);
      const blockSlice = item.file.slice(fileOffset, blockEnd);
      const blockBuffer = await blockSlice.arrayBuffer();

      let blockOffset = 0;
      while (blockOffset < blockBuffer.byteLength) {
        if (transfer.cancelled || ws.readyState !== WebSocket.OPEN) break;

        // WebSocket flow control backpressure
        if (ws.bufferedAmount >= HIGH_WATER_MARK) {
          await new Promise(r => setTimeout(r, 20));
        }

        if (transfer.cancelled || ws.readyState !== WebSocket.OPEN) break;

        const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockBuffer.byteLength);
        const chunkBuffer = blockBuffer.slice(blockOffset, chunkEnd);

        // High-speed binary frame: 8 bytes targetPeerId + chunk
        const packet = new Uint8Array(8 + chunkBuffer.byteLength);
        for (let i = 0; i < 8; i++) {
          packet[i] = targetPeerId.charCodeAt(i);
        }
        packet.set(new Uint8Array(chunkBuffer), 8);
        ws.send(packet.buffer);

        blockOffset += chunkBuffer.byteLength;
        fileOffset += chunkBuffer.byteLength;
        totalOffset += chunkBuffer.byteLength;

        const netTransferred = Math.max(0, totalOffset - (ws.bufferedAmount || 0));
        const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
        const speedMbps = ((netTransferred * 8) / (1024 * 1024)) / elapsedSec;
        updateTransferProgress(transferKey, netTransferred, queueData.totalSize, speedMbps);
      }
    }
  }

  // Wait for WebSocket client buffer to flush completely to the network
  while (ws.bufferedAmount > 0 && !transfer.cancelled && ws.readyState === WebSocket.OPEN) {
    const netTransferred = Math.max(0, totalOffset - ws.bufferedAmount);
    const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
    const speedMbps = ((netTransferred * 8) / (1024 * 1024)) / elapsedSec;
    updateTransferProgress(transferKey, netTransferred, queueData.totalSize, speedMbps);
    await new Promise(r => setTimeout(r, 40));
  }

  if (!transfer.cancelled && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'ws-transfer-done',
      target: targetPeerId,
      fileId: queueData.fileId
    }));
    transfer.status = 'completed';
    updateTransferCompleted(transferKey);
  }
}

async function streamQueueToPeer(channel, queueData, targetPeerId) {
  const transferKey = `${queueData.fileId}_${targetPeerId}`;
  const transfer = activeTransfers.get(transferKey);
  if (!transfer || transfer.cancelled) return;

  channel.bufferedAmountLowThreshold = LOW_WATER_MARK;

  // 1. Send Manifest Header
  channel.send(JSON.stringify({
    type: 'transfer-meta',
    fileId: queueData.fileId,
    name: queueData.isFolder ? queueData.folderName : (queueData.items.length > 1 ? `${queueData.items.length} Files` : queueData.items[0].file.name),
    isFolder: queueData.isFolder,
    totalSize: queueData.totalSize,
    files: queueData.items.map((item, idx) => ({
      fileIndex: idx,
      relativePath: item.relativePath,
      size: item.file.size,
      mime: item.file.type || 'application/octet-stream'
    }))
  }));

  let totalOffset = 0;
  const startTime = Date.now();

  for (let fileIdx = 0; fileIdx < queueData.items.length; fileIdx++) {
    if (transfer.cancelled || channel.readyState !== 'open') break;

    const item = queueData.items[fileIdx];
    channel.send(JSON.stringify({
      type: 'file-header',
      fileIndex: fileIdx,
      relativePath: item.relativePath,
      size: item.file.size
    }));

    if (item.file.size === 0) continue;

    let fileOffset = 0;
    while (fileOffset < item.file.size) {
      if (transfer.cancelled || channel.readyState !== 'open') break;

      // 1MB in-memory block read from disk
      const blockEnd = Math.min(fileOffset + DISK_BLOCK_SIZE, item.file.size);
      const blockSlice = item.file.slice(fileOffset, blockEnd);
      const blockBuffer = await blockSlice.arrayBuffer();

      let blockOffset = 0;
      while (blockOffset < blockBuffer.byteLength) {
        if (transfer.cancelled || channel.readyState !== 'open') break;

        // High-water backpressure flow control with timeout guard
        if (channel.bufferedAmount >= HIGH_WATER_MARK) {
          await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 150);
            channel.onbufferedamountlow = () => {
              clearTimeout(timeout);
              channel.onbufferedamountlow = null;
              resolve();
            };
          });
        }

        if (transfer.cancelled || channel.readyState !== 'open') break;

        const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockBuffer.byteLength);
        const chunkBuffer = blockBuffer.slice(blockOffset, chunkEnd);

        channel.send(chunkBuffer);
        blockOffset += chunkBuffer.byteLength;
        fileOffset += chunkBuffer.byteLength;
        totalOffset += chunkBuffer.byteLength;

        const netTransferred = Math.max(0, totalOffset - (channel.bufferedAmount || 0));
        const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
        const speedMbps = ((netTransferred * 8) / (1024 * 1024)) / elapsedSec;
        updateTransferProgress(transferKey, netTransferred, queueData.totalSize, speedMbps);
      }
    }
  }

  // Wait for the transmission buffer to flush completely to the network
  while (channel.bufferedAmount > 0 && !transfer.cancelled && channel.readyState === 'open') {
    const netTransferred = Math.max(0, totalOffset - channel.bufferedAmount);
    const elapsedSec = (Date.now() - startTime) / 1000 || 0.001;
    const speedMbps = ((netTransferred * 8) / (1024 * 1024)) / elapsedSec;
    updateTransferProgress(transferKey, netTransferred, queueData.totalSize, speedMbps);
    await new Promise(r => setTimeout(r, 40));
  }

  if (!transfer.cancelled && channel.readyState === 'open') {
    channel.send(JSON.stringify({
      type: 'transfer-done',
      fileId: queueData.fileId
    }));
    transfer.status = 'completed';
    updateTransferCompleted(transferKey);
  }
}

// ==========================================
// 9. FOLDER SYNC ENGINE (PC-TO-PC)
// ==========================================
const syncFolderInput = document.getElementById('syncFolderInput');
let localSyncDirHandle = null;
let localFilesFallbackMap = new Map(); // path -> File object (for Brave / fallback mode)
let localFileHandlesMap = new Map();   // path -> FileSystemFileHandle for instant O(1) file retrieval
let localManifest = [];                // Array of { path, size, lastModified }
let autoSyncInterval = null;
let activeSyncPeerId = null;
let activePendingDelta = null;

// Modal Controller Functions
function openSyncProgressModal(title, subtitle, phase = 'Phase 1/3') {
  if (!syncProgressModal) return;
  syncModalTitle.textContent = title || 'Folder Synchronization';
  syncModalSubtitle.textContent = subtitle || 'Analyzing folders across devices...';
  syncModalPhaseBadge.textContent = phase;
  syncModalPhaseBadge.className = 'text-[10px] font-semibold bg-indigo-500/25 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full shrink-0';
  syncModalCurrentOp.textContent = 'Initializing...';
  syncModalFileCount.textContent = '0 / 0';
  syncModalProgressBar.style.width = '0%';
  syncModalProgressBar.className = 'h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-150';
  syncModalStatusDetail.textContent = 'Preparing comparison...';
  syncModalPercent.textContent = '0%';
  syncModalTotalFiles.textContent = localManifest ? localManifest.length : '0';
  syncModalIdenticalFiles.textContent = '-';
  syncModalToSendFiles.textContent = '-';
  syncModalToReceiveFiles.textContent = '-';
  syncModalIconContainer.className = 'w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-400/30 shadow-lg shadow-indigo-500/25 shrink-0';
  syncModalIcon.setAttribute('data-lucide', 'refresh-cw');
  syncModalIcon.classList.add('animate-spin');
  actionSyncModalBtn.classList.add('hidden');
  cancelSyncModalBtn.textContent = 'Cancel Sync';
  cancelSyncModalBtn.className = 'flex-1 py-2.5 px-4 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition hover:scale-[1.01]';
  syncProgressModal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateSyncProgressModal(data) {
  if (!syncProgressModal || syncProgressModal.classList.contains('hidden')) return;
  if (data.title) syncModalTitle.textContent = data.title;
  if (data.subtitle) syncModalSubtitle.textContent = data.subtitle;
  if (data.phase) syncModalPhaseBadge.textContent = data.phase;
  if (data.phaseClass) syncModalPhaseBadge.className = data.phaseClass;
  if (data.currentOp) syncModalCurrentOp.textContent = data.currentOp;
  if (data.fileCount) syncModalFileCount.textContent = data.fileCount;
  if (data.percent !== undefined) {
    const pct = Math.min(100, Math.max(0, Math.round(data.percent)));
    syncModalProgressBar.style.width = `${pct}%`;
    syncModalPercent.textContent = `${pct}%`;
  }
  if (data.statusDetail) syncModalStatusDetail.textContent = data.statusDetail;
  if (data.total !== undefined) syncModalTotalFiles.textContent = data.total;
  if (data.identical !== undefined) syncModalIdenticalFiles.textContent = data.identical;
  if (data.toSend !== undefined) syncModalToSendFiles.textContent = data.toSend;
  if (data.toReceive !== undefined) syncModalToReceiveFiles.textContent = data.toReceive;
  if (data.icon) syncModalIcon.setAttribute('data-lucide', data.icon);
  if (data.iconSpin !== undefined) {
    if (data.iconSpin) syncModalIcon.classList.add('animate-spin');
    else syncModalIcon.classList.remove('animate-spin');
  }
  if (data.iconContainerClass) syncModalIconContainer.className = data.iconContainerClass;
  if (data.actionBtnText) {
    actionSyncModalBtnText.textContent = data.actionBtnText;
    actionSyncModalBtn.classList.remove('hidden');
  } else if (data.hideActionBtn) {
    actionSyncModalBtn.classList.add('hidden');
  }
  if (data.cancelBtnText) {
    cancelSyncModalBtn.textContent = data.cancelBtnText;
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeSyncProgressModal() {
  if (syncProgressModal) {
    syncProgressModal.classList.add('hidden');
  }
}

if (closeSyncProgressModalBtn) {
  closeSyncProgressModalBtn.onclick = () => closeSyncProgressModal();
}

if (cancelSyncModalBtn) {
  cancelSyncModalBtn.onclick = () => {
    closeSyncProgressModal();
    if (activeSyncPeerId && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'sync-cancel',
        target: activeSyncPeerId
      }));
    }
    syncOverallStateBadge.textContent = 'Idle';
    syncOverallStateBadge.className = 'text-xs font-semibold text-white/50';
  };
}

function updateSyncPeerSelect(peers) {
  if (!syncPeerSelect) return;
  const currentVal = syncPeerSelect.value;
  syncPeerSelect.innerHTML = '';

  if (peers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- No peers connected --';
    syncPeerSelect.appendChild(opt);
    if (remotePeerStatusBadge) remotePeerStatusBadge.textContent = 'No Peer';
    return;
  }

  peers.forEach(peer => {
    const opt = document.createElement('option');
    opt.value = peer.id;
    opt.textContent = `${peer.deviceName} (${peer.deviceType})`;
    syncPeerSelect.appendChild(opt);
  });

  if (currentVal && peers.some(p => p.id === currentVal)) {
    syncPeerSelect.value = currentVal;
  }
  if (remotePeerStatusBadge) remotePeerStatusBadge.textContent = 'Peer Connected';
}

const localFolderInfoBox = document.getElementById('localFolderInfoBox');

if (pickSyncFolderBtn) {
  pickSyncFolderBtn.onclick = (e) => {
    // 1. Direct Disk Access API
    if (window.isSecureContext && typeof window.showDirectoryPicker === 'function') {
      e.preventDefault();
      window.showDirectoryPicker({ mode: 'readwrite' })
        .then(async (handle) => {
          localSyncDirHandle = handle;
          localFilesFallbackMap.clear();
          localFileHandlesMap.clear();
          localFolderName.textContent = handle.name;
          localFolderStatusBadge.textContent = 'Direct Disk Access';
          localFolderStatusBadge.className = 'text-[11px] font-medium bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-400/30';
          rescanLocalFolderBtn.disabled = false;

          appendSyncLog(`Local sync folder chosen: "${handle.name}" (Direct Disk Mode)`, 'info');
          await scanLocalSyncFolder(true);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.warn('showDirectoryPicker failed, falling back to input:', err);
          if (syncFolderInput) syncFolderInput.click();
        });
      return;
    }

    appendSyncLog('Opening folder picker...', 'info');
  };
}

// Drag & drop folder directly onto Local Sync Folder card
if (localFolderInfoBox) {
  localFolderInfoBox.ondragover = (e) => {
    e.preventDefault();
    localFolderInfoBox.classList.add('border-blue-400', 'bg-blue-500/20');
  };
  localFolderInfoBox.ondragleave = () => {
    localFolderInfoBox.classList.remove('border-blue-400', 'bg-blue-500/20');
  };
  localFolderInfoBox.ondrop = async (e) => {
    e.preventDefault();
    localFolderInfoBox.classList.remove('border-blue-400', 'bg-blue-500/20');
    const items = await extractDroppedItems(e.dataTransfer);
    if (items.length > 0) {
      localSyncDirHandle = null;
      localFilesFallbackMap.clear();
      localFileHandlesMap.clear();

      let folderName = 'Dropped Folder';
      const firstRel = items[0].relativePath;
      if (firstRel.includes('/')) folderName = firstRel.split('/')[0];

      let totalBytes = 0;
      localManifest = items.map(item => {
        const relPath = item.relativePath.includes('/') 
          ? item.relativePath.substring(item.relativePath.indexOf('/') + 1) 
          : item.relativePath;
        localFilesFallbackMap.set(relPath, item.file);
        totalBytes += item.file.size;
        return {
          path: relPath,
          size: item.file.size,
          lastModified: item.file.lastModified
        };
      });

      localFolderName.textContent = folderName;
      localFolderStatusBadge.textContent = 'Active (Dropped Folder)';
      localFolderStatusBadge.className = 'text-[11px] font-medium bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30';
      localFolderMeta.textContent = `${localManifest.length} files • ${formatBytes(totalBytes)}`;
      metricLocalFiles.textContent = localManifest.length;
      rescanLocalFolderBtn.disabled = false;
      appendSyncLog(`Loaded dropped folder "${folderName}" (${localManifest.length} files)`, 'success');
      showToast(`Loaded folder "${folderName}"!`, 'success');
    }
  };
}

if (syncFolderInput) {
  syncFolderInput.onchange = (e) => {
    if (e.target.files.length === 0) return;
    localSyncDirHandle = null;
    localFilesFallbackMap.clear();
    localFileHandlesMap.clear();

    const files = Array.from(e.target.files);
    const firstRel = files[0].webkitRelativePath || files[0].name;
    const folderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Selected Folder';

    let totalBytes = 0;
    localManifest = files.map(file => {
      const relPath = file.webkitRelativePath 
        ? (file.webkitRelativePath.includes('/') ? file.webkitRelativePath.substring(file.webkitRelativePath.indexOf('/') + 1) : file.webkitRelativePath)
        : file.name;
      localFilesFallbackMap.set(relPath, file);
      totalBytes += file.size;
      return {
        path: relPath,
        size: file.size,
        lastModified: file.lastModified
      };
    });

    localFolderName.textContent = folderName;
    localFolderStatusBadge.textContent = 'Active (Universal Mode)';
    localFolderStatusBadge.className = 'text-[11px] font-medium bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30';
    localFolderMeta.textContent = `${localManifest.length} files • ${formatBytes(totalBytes)}`;
    metricLocalFiles.textContent = localManifest.length;
    rescanLocalFolderBtn.disabled = false;

    appendSyncLog(`Loaded "${folderName}" (${localManifest.length} files, ${formatBytes(totalBytes)})`, 'success');
    showToast(`Folder "${folderName}" loaded! Ready to sync.`, 'success');
  };
}

if (rescanLocalFolderBtn) {
  rescanLocalFolderBtn.onclick = async () => {
    if (localSyncDirHandle) {
      await scanLocalSyncFolder(true);
    } else if (syncFolderInput) {
      syncFolderInput.click();
    }
  };
}

// Resilient file indexer with non-blocking UI rendering and O(1) handle caching
async function scanLocalSyncFolder(showModal = false, totalEstimate = 0) {
  if (localSyncDirHandle) {
    localFolderMeta.textContent = 'Scanning files...';
    appendSyncLog('Scanning local folder...', 'info');

    if (showModal) {
      openSyncProgressModal(
        'Indexing Local Folder',
        `Scanning files in "${localSyncDirHandle.name}"`,
        'Phase 1/3: Local Indexing'
      );
    }

    localManifest = [];
    localFileHandlesMap.clear();
    let totalBytes = 0;
    let scannedCount = 0;
    let lastYield = Date.now();

    async function traverse(dirHandle, currentPath) {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          scannedCount++;
          const file = await entry.getFile();
          const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          localManifest.push({
            path: relPath,
            size: file.size,
            lastModified: file.lastModified
          });
          localFileHandlesMap.set(relPath, entry);
          totalBytes += file.size;

          const now = Date.now();
          if (now - lastYield > 80 || scannedCount % 60 === 0) {
            lastYield = now;
            const pct = totalEstimate > 0 ? (scannedCount / totalEstimate) * 100 : 0;
            if (showModal) {
              updateSyncProgressModal({
                currentOp: `Indexing: ${entry.name}`,
                fileCount: totalEstimate > 0 ? `${scannedCount} / ${totalEstimate}` : `${scannedCount} files`,
                percent: pct,
                statusDetail: `${scannedCount} files indexed (${formatBytes(totalBytes)})`,
                total: scannedCount
              });
            }
            await new Promise(r => setTimeout(r, 0));
          }
        } else if (entry.kind === 'directory') {
          const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          await traverse(entry, nextPath);
        }
      }
    }

    try {
      await traverse(localSyncDirHandle, '');
      metricLocalFiles.textContent = localManifest.length;
      localFolderMeta.textContent = `${localManifest.length} files • ${formatBytes(totalBytes)}`;
      appendSyncLog(`Scan complete: ${localManifest.length} files (${formatBytes(totalBytes)})`, 'success');

      if (showModal) {
        updateSyncProgressModal({
          currentOp: 'Index Complete',
          fileCount: `${localManifest.length} / ${localManifest.length}`,
          percent: 100,
          statusDetail: `Indexed ${localManifest.length} files (${formatBytes(totalBytes)})`,
          total: localManifest.length
        });
      }
    } catch (err) {
      appendSyncLog(`Scan error: ${err.message}`, 'error');
    }
  } else if (localFilesFallbackMap.size > 0) {
    metricLocalFiles.textContent = localManifest.length;
    appendSyncLog(`Local files active: ${localManifest.length} files in manifest`, 'info');
  }
}

if (syncNowBtn) {
  syncNowBtn.onclick = async () => {
    if (!localSyncDirHandle && localFilesFallbackMap.size === 0) {
      showToast('Please select a local sync folder first', 'warn');
      if (syncFolderInput) syncFolderInput.click();
      return;
    }
    const targetPeerId = syncPeerSelect ? syncPeerSelect.value : null;
    if (!targetPeerId) {
      showToast('Please select a remote peer to sync with', 'warn');
      return;
    }

    const peer = peers.find(p => p.id === targetPeerId);
    const peerName = peer ? peer.deviceName : 'Remote Peer';
    activeSyncPeerId = targetPeerId;

    openSyncProgressModal(
      `Syncing with ${peerName}`,
      'Comparing folders across devices...',
      'Phase 1/3: Local Indexing'
    );

    appendSyncLog(`Initiating sync with ${peerName}...`, 'info');
    syncOverallStateBadge.textContent = 'Comparing Folders...';
    syncOverallStateBadge.className = 'text-xs font-semibold text-indigo-400';

    // If never scanned or requested, scan local
    if (localManifest.length === 0) {
      await scanLocalSyncFolder(true);
    } else {
      updateSyncProgressModal({
        currentOp: 'Local folder ready',
        fileCount: `${localManifest.length} files`,
        percent: 40,
        statusDetail: `${localManifest.length} files indexed`,
        total: localManifest.length
      });
    }

    updateSyncProgressModal({
      phase: 'Phase 2/3: Exchanging Manifests',
      subtitle: `Transmitting ${localManifest.length} file records to ${peerName}...`,
      currentOp: `Sending manifest to ${peerName}...`,
      statusDetail: `Manifest size: ${localManifest.length} files. Awaiting peer comparison...`,
      percent: 50,
      total: localManifest.length
    });

    // Send manifest to target peer
    ws.send(JSON.stringify({
      type: 'sync-manifest',
      target: targetPeerId,
      direction: syncDirectionSelect.value,
      manifest: localManifest
    }));
  };
}

// Incoming remote manifest handler (Runs on Peer B)
async function handleSyncManifestReceived(data) {
  const senderPeerName = data.senderName || 'Remote Peer';
  activeSyncPeerId = data.sender;
  appendSyncLog(`Received manifest from ${senderPeerName} (${data.manifest.length} files)`, 'info');
  metricRemoteFiles.textContent = data.manifest.length;

  if (!localSyncDirHandle && localFilesFallbackMap.size === 0) {
    appendSyncLog('Remote peer requested sync, but no local folder is selected on this PC.', 'warn');
    showToast(`${senderPeerName} wants to sync folders (${data.manifest.length} files). Select a local folder in "Folder Sync" tab!`, 'warn');
    return;
  }

  // Open modal on Receiver/Comparing device
  openSyncProgressModal(
    `Syncing with ${senderPeerName}`,
    `Received ${data.manifest.length} file records from ${senderPeerName}`,
    'Phase 1/3: Local Indexing'
  );

  // Notify sender that we received their manifest and are indexing local directory
  ws.send(JSON.stringify({
    type: 'sync-status',
    target: data.sender,
    phase: 'Phase 2/3: Peer Indexing',
    subtitle: `${myDeviceName} is indexing local folder...`,
    currentOp: `Indexing local files on ${myDeviceName}...`,
    statusDetail: `Received ${data.manifest.length} file records from you. Indexing local directory...`,
    percent: 60,
    total: data.manifest.length
  }));

  // Index local folder with UI updates
  if (localManifest.length === 0) {
    await scanLocalSyncFolder(true, data.manifest.length);
  }

  updateSyncProgressModal({
    phase: 'Phase 3/3: Comparing Files',
    subtitle: `Comparing ${data.manifest.length} remote files with ${localManifest.length} local files...`,
    currentOp: 'Comparing files and timestamps...',
    statusDetail: 'Detecting missing files and timestamp differences...',
    percent: 75,
    total: Math.max(localManifest.length, data.manifest.length)
  });

  // Notify sender that comparison diffing is underway
  ws.send(JSON.stringify({
    type: 'sync-status',
    target: data.sender,
    phase: 'Phase 3/3: Comparing Files',
    subtitle: `Comparing ${data.manifest.length} remote files with ${localManifest.length} local files...`,
    currentOp: 'Comparing files and timestamps...',
    statusDetail: 'Analyzing differences across 7,000+ files...',
    percent: 75,
    total: Math.max(localManifest.length, data.manifest.length)
  }));

  const remoteManifest = data.manifest;
  const localMap = new Map(localManifest.map(f => [f.path, f]));
  const remoteMap = new Map(remoteManifest.map(f => [f.path, f]));

  const toDownload = []; // Files remote has that local needs
  const toUpload = [];   // Files local has that remote needs
  let identicalCount = 0;

  // 1. Check remote files against local
  for (let i = 0; i < remoteManifest.length; i++) {
    const rf = remoteManifest[i];
    const lf = localMap.get(rf.path);
    if (!lf) {
      toDownload.push(rf);
    } else if (rf.lastModified > lf.lastModified && rf.size !== lf.size) {
      toDownload.push(rf);
    } else if (rf.lastModified === lf.lastModified && rf.size === lf.size) {
      identicalCount++;
    } else if (rf.lastModified > lf.lastModified) {
      toDownload.push(rf);
    }

    if (i % 250 === 0) {
      const pct = 75 + Math.round((i / (remoteManifest.length + localManifest.length)) * 20);
      updateSyncProgressModal({
        currentOp: `Diffing: ${rf.path}`,
        percent: pct,
        fileCount: `${i} / ${remoteManifest.length}`,
        identical: identicalCount,
        toReceive: toDownload.length
      });
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 2. Check local files against remote
  for (let i = 0; i < localManifest.length; i++) {
    const lf = localManifest[i];
    const rf = remoteMap.get(lf.path);
    if (!rf) {
      toUpload.push(lf);
    } else if (lf.lastModified > rf.lastModified && lf.size !== rf.size) {
      toUpload.push(lf);
    }

    if (i % 250 === 0) {
      updateSyncProgressModal({
        currentOp: `Diffing: ${lf.path}`,
        toSend: toUpload.length
      });
      await new Promise(r => setTimeout(r, 0));
    }
  }

  metricPendingUploads.textContent = toUpload.length;
  metricPendingDownloads.textContent = toDownload.length;
  const totalAnalyzed = Math.max(localManifest.length, remoteManifest.length);
  const isInSync = toDownload.length === 0 && toUpload.length === 0;

  // Send the diff result to the other device so BOTH devices have the identical breakdown!
  ws.send(JSON.stringify({
    type: 'sync-diff-result',
    target: data.sender,
    totalAnalyzed,
    identicalCount,
    // Note: sender's "toSend" is receiver's "toDownload", and vice-versa!
    toSendCount: toDownload.length,
    toReceiveCount: toUpload.length,
    inSync: isInSync
  }));

  // Update receiver's modal with diff results
  applyDiffResultToModal({
    totalAnalyzed,
    identicalCount,
    toSendCount: toUpload.length,
    toReceiveCount: toDownload.length,
    inSync: isInSync
  });

  if (isInSync) {
    syncOverallStateBadge.textContent = 'In Sync';
    syncOverallStateBadge.className = 'text-xs font-semibold text-emerald-400';
    appendSyncLog('Folders are already identical and 100% in sync!', 'success');
    return;
  }

  appendSyncLog(`Diff computed: ${toUpload.length} to upload, ${toDownload.length} to download`, 'info');
  syncOverallStateBadge.textContent = 'Syncing Delta...';
  syncOverallStateBadge.className = 'text-xs font-semibold text-blue-400';

  // Request needed files from remote
  if (toDownload.length > 0 && data.direction !== 'push') {
    ws.send(JSON.stringify({
      type: 'sync-request',
      target: data.sender,
      wantPaths: toDownload.map(f => f.path)
    }));
  }

  // Upload needed files to remote
  if (toUpload.length > 0 && data.direction !== 'pull') {
    const uploadFiles = [];
    for (const item of toUpload) {
      const file = await getFileFromLocalHandle(localSyncDirHandle, item.path);
      if (file) {
        uploadFiles.push({ file, relativePath: item.path, isFolder: true });
      }
    }
    if (uploadFiles.length > 0) {
      prepareAndSendItems([data.sender], uploadFiles);
    }
  }
}

// Present diff result on the Comparison Modal
function applyDiffResultToModal(diff) {
  if (diff.inSync) {
    syncOverallStateBadge.textContent = 'In Sync';
    syncOverallStateBadge.className = 'text-xs font-semibold text-emerald-400';
    updateSyncProgressModal({
      title: 'Folders Are In Sync! ✨',
      subtitle: 'All files are identical across both devices. No transfers needed.',
      phase: '100% In Sync',
      phaseClass: 'text-[10px] font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full shrink-0',
      currentOp: 'Folders matched perfectly',
      fileCount: `${diff.identicalCount} / ${diff.totalAnalyzed}`,
      percent: 100,
      statusDetail: `Analyzed ${diff.totalAnalyzed} files. 0 differences found.`,
      total: diff.totalAnalyzed,
      identical: diff.identicalCount,
      toSend: 0,
      toReceive: 0,
      icon: 'check-circle-2',
      iconSpin: false,
      iconContainerClass: 'w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/30 shadow-lg shadow-emerald-500/25 shrink-0',
      cancelBtnText: 'Close Window',
      hideActionBtn: true
    });
  } else {
    updateSyncProgressModal({
      title: 'Comparison Complete',
      subtitle: `${diff.toSendCount} to send • ${diff.toReceiveCount} to receive`,
      phase: 'Delta Identified',
      phaseClass: 'text-[10px] font-semibold bg-blue-500/25 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full shrink-0',
      currentOp: 'Ready to sync differences',
      fileCount: `${diff.identicalCount} / ${diff.totalAnalyzed} identical`,
      percent: 100,
      statusDetail: `Found ${diff.toSendCount + diff.toReceiveCount} differences out of ${diff.totalAnalyzed} files`,
      total: diff.totalAnalyzed,
      identical: diff.identicalCount,
      toSend: diff.toSendCount,
      toReceive: diff.toReceiveCount,
      icon: 'arrow-left-right',
      iconSpin: false,
      iconContainerClass: 'w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-400/30 shadow-lg shadow-blue-500/25 shrink-0',
      cancelBtnText: 'Dismiss',
      actionBtnText: 'Syncing Differences...'
    });
  }
}

// Handler for peer status updates
function handleSyncStatusReceived(data) {
  updateSyncProgressModal({
    phase: data.phase,
    subtitle: data.subtitle,
    currentOp: data.currentOp,
    statusDetail: data.statusDetail,
    percent: data.percent,
    total: data.total
  });
}

// Handler for diff result from remote peer
function handleSyncDiffResultReceived(data) {
  applyDiffResultToModal({
    totalAnalyzed: data.totalAnalyzed,
    identicalCount: data.identicalCount,
    toSendCount: data.toSendCount,
    toReceiveCount: data.toReceiveCount,
    inSync: data.inSync
  });
}

// Handler for sync cancellation
function handleSyncCancelReceived(data) {
  appendSyncLog(`Sync cancelled by ${data.senderName || 'peer'}`, 'warn');
  closeSyncProgressModal();
  syncOverallStateBadge.textContent = 'Idle';
  syncOverallStateBadge.className = 'text-xs font-semibold text-white/50';
  showToast(`Sync cancelled by ${data.senderName || 'peer'}`, 'info');
}

// Remote requested specific files from this PC
async function handleSyncRequestReceived(data) {
  if (!localSyncDirHandle && localFilesFallbackMap.size === 0) return;
  appendSyncLog(`Peer requested ${data.wantPaths.length} missing/updated files`, 'info');

  const filesToSend = [];
  for (const relPath of data.wantPaths) {
    const file = await getFileFromLocalHandle(localSyncDirHandle, relPath);
    if (file) {
      filesToSend.push({ file, relativePath: relPath, isFolder: true });
    }
  }

  if (filesToSend.length > 0) {
    prepareAndSendItems([data.sender], filesToSend);
  }
}

// Fast O(1) file handle resolver with directory fallback
async function getFileFromLocalHandle(rootDirHandle, path) {
  if (localFilesFallbackMap.has(path)) {
    return localFilesFallbackMap.get(path);
  }

  // Fast O(1) cache lookup
  if (localFileHandlesMap.has(path)) {
    try {
      const handle = localFileHandlesMap.get(path);
      return await handle.getFile();
    } catch (_) {}
  }

  if (!rootDirHandle) return null;
  const parts = path.split('/');
  let currentHandle = rootDirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    } catch (_) {
      return null;
    }
  }
  try {
    const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1]);
    return await fileHandle.getFile();
  } catch (_) {
    return null;
  }
}

// Auto-Sync Toggle Interval
if (autoSyncToggle) {
  autoSyncToggle.onchange = () => {
    if (autoSyncToggle.checked) {
      appendSyncLog('Auto-Sync enabled (polling every 30s)', 'info');
      autoSyncInterval = setInterval(() => {
        if (syncNowBtn && !syncNowBtn.disabled && localSyncDirHandle && syncPeerSelect.value) {
          syncNowBtn.click();
        }
      }, 30000);
    } else {
      appendSyncLog('Auto-Sync disabled', 'info');
      if (autoSyncInterval) clearInterval(autoSyncInterval);
    }
  };
}

// ==========================================
// 10. SOFTWARE UPDATE CHECKER & IN-APP DELIVERY
// ==========================================
let latestAvailableUpdate = null;

async function checkForSoftwareUpdates(isManualCheck = false) {
  try {
    if (isManualCheck) {
      showToast('Checking for software updates...', 'info');
    }
    const res = await fetch('/api/check-update');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.updateAvailable) {
      latestAvailableUpdate = data;

      // Reveal header notification badge with glowing animation
      if (updateAvailableBadge) {
        updateAvailableBadge.classList.remove('hidden');
        updateAvailableBadge.classList.add('inline-flex');
        if (updateBadgeText) updateBadgeText.textContent = `Update v${data.latestVersion}`;
      }

      // Populate update modal dialog
      if (updateModalCurrentVersion) updateModalCurrentVersion.textContent = `v${data.currentVersion || APP_VERSION}`;
      if (updateModalLatestVersion) updateModalLatestVersion.textContent = `v${data.latestVersion}`;
      if (updateModalTagBadge) updateModalTagBadge.textContent = `v${data.latestVersion}`;
      if (updateDownloadZipBtn) {
        updateDownloadZipBtn.href = data.zipUrl || 'https://github.com/RahulRedkar/LocalDrop-LAN/releases/latest';
      }
      if (updateDownloadInstallerBtn) {
        updateDownloadInstallerBtn.href = data.installerUrl || 'https://github.com/RahulRedkar/LocalDrop-LAN/releases/latest';
      }
      if (data.releaseNotes && updateModalNotes) {
        updateModalNotes.innerHTML = `<p class="whitespace-pre-line text-white/80 leading-relaxed">${data.releaseNotes.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
      }

      if (isManualCheck) {
        openUpdateModal();
      } else {
        showToast(`✨ Update v${data.latestVersion} available! Click "Update" to install.`, 'success');
      }
    } else {
      if (isManualCheck) {
        if (data && data.offline) {
          showToast(`Running LocalDrop v${APP_VERSION} (Offline LAN mode)`, 'info');
        } else {
          showToast(`LocalDrop LAN is up to date (v${APP_VERSION})!`, 'success');
        }
      }
    }
  } catch (err) {
    if (isManualCheck) {
      showToast('Could not reach update server. Check your network.', 'warn');
    }
  }
}

function openUpdateModal() {
  if (!updateModal) return;
  updateModal.classList.remove('hidden');
  if (latestAvailableUpdate) {
    if (updateModalCurrentVersion) updateModalCurrentVersion.textContent = `v${latestAvailableUpdate.currentVersion || APP_VERSION}`;
    if (updateModalLatestVersion) updateModalLatestVersion.textContent = `v${latestAvailableUpdate.latestVersion}`;
    if (updateModalTagBadge) updateModalTagBadge.textContent = `v${latestAvailableUpdate.latestVersion}`;
    if (updateDownloadZipBtn && latestAvailableUpdate.zipUrl) {
      updateDownloadZipBtn.href = latestAvailableUpdate.zipUrl;
    }
    if (updateDownloadInstallerBtn && latestAvailableUpdate.installerUrl) {
      updateDownloadInstallerBtn.href = latestAvailableUpdate.installerUrl;
    }
  } else {
    if (updateModalCurrentVersion) updateModalCurrentVersion.textContent = `v${APP_VERSION}`;
    if (updateModalLatestVersion) updateModalLatestVersion.textContent = `v${APP_VERSION}`;
  }
  if (window.lucide) lucide.createIcons();
}

function closeUpdateModal() {
  if (updateModal) updateModal.classList.add('hidden');
}

if (updateAvailableBadge) updateAvailableBadge.onclick = openUpdateModal;
if (checkUpdateBtn) checkUpdateBtn.onclick = () => {
  if (latestAvailableUpdate && latestAvailableUpdate.updateAvailable) {
    openUpdateModal();
  } else {
    checkForSoftwareUpdates(true);
  }
};
if (closeUpdateModalBtn) closeUpdateModalBtn.onclick = closeUpdateModal;
if (updateModal) {
  updateModal.onclick = (e) => {
    if (e.target === updateModal) closeUpdateModal();
  };
}

// How to Use Modal Handlers
function openHowToUseModal() {
  if (howToUseModal) {
    howToUseModal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}
function closeHowToUseModal() {
  if (howToUseModal) howToUseModal.classList.add('hidden');
}
if (howToUseBtn) howToUseBtn.onclick = openHowToUseModal;
if (closeHowToUseModalBtn) closeHowToUseModalBtn.onclick = closeHowToUseModal;
if (gotItHowToUseBtn) gotItHowToUseBtn.onclick = closeHowToUseModal;
if (howToUseModal) {
  howToUseModal.onclick = (e) => {
    if (e.target === howToUseModal) closeHowToUseModal();
  };
}

if (updateSyncWebBtn) {
  updateSyncWebBtn.onclick = async () => {
    try {
      updateSyncWebBtn.disabled = true;
      updateSyncWebBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i><span>Updating UI...</span>';
      if (window.lucide) lucide.createIcons();

      const res = await fetch('/api/update/sync-web', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Web UI updated! Reloading in 1s...', 'success');
        setTimeout(() => window.location.reload(true), 1200);
      } else {
        showToast(data.error || 'Failed to sync web UI', 'error');
        updateSyncWebBtn.disabled = false;
        updateSyncWebBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-blue-400"></i><span>Update Web UI</span>';
        if (window.lucide) lucide.createIcons();
      }
    } catch (err) {
      showToast('Error syncing web assets: ' + err.message, 'error');
      updateSyncWebBtn.disabled = false;
      updateSyncWebBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-blue-400"></i><span>Update Web UI</span>';
      if (window.lucide) lucide.createIcons();
    }
  };
}

// Initial background update check after 3 seconds, then every 30 minutes
setTimeout(() => checkForSoftwareUpdates(false), 3000);
setInterval(() => checkForSoftwareUpdates(false), 30 * 60 * 1000);
