/* LocalDrop LAN - P2P File & Folder Transfer + PC-to-PC Folder Sync */

const DISK_BLOCK_SIZE = 1024 * 1024; // 1MB in-memory disk read block
const CHUNK_SIZE = 256 * 1024; // 256KB network packet (max safe WebRTC & WebSocket chunk)
const LOW_WATER_MARK = 1024 * 1024; // 1MB low-water mark
const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8MB high-water mark

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
    radarStage.classList.remove('hidden');
    syncStage.classList.add('hidden');
    tabRadarBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white shadow-md border border-white/20 backdrop-blur-md transition-all duration-200';
    tabSyncBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-white transition-all duration-200';
  } else {
    radarStage.classList.add('hidden');
    syncStage.classList.remove('hidden');
    tabSyncBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white shadow-md border border-white/20 backdrop-blur-md transition-all duration-200';
    tabRadarBtn.className = 'flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-medium text-white/60 hover:text-white transition-all duration-200';
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
  toast.className = `px-4 py-3 rounded-2xl text-xs font-medium border shadow-2xl flex items-center space-x-2.5 backdrop-blur-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${
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
    toast.remove();
  }, 4500);
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
          if (transfer) transfer.status = 'completed';
          updateTransferCompleted(transferKey);
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
    card.className = `apple-glass-card p-5 flex flex-col items-center text-center cursor-pointer select-none relative group ${isSelected ? 'is-selected' : ''}`;

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
function prepareAndSendItems(targetPeerIds, items) {
  // Check if this is a folder transfer
  const isFolder = items.some(item => item.isFolder || (item.relativePath && item.relativePath.includes('/')));
  let folderName = 'Folder';
  if (isFolder) {
    const firstRel = (items[0].relativePath || '').replace(/\\/g, '/');
    folderName = firstRel.split('/')[0] || 'Shared_Folder';
  }

  const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
  const fileId = Math.random().toString(36).substring(2, 9);

  outboundQueue.set(fileId, {
    fileId,
    items,
    isFolder,
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
      name: isFolder ? folderName : (items.length > 1 ? `${items.length} Files` : items[0].file.name),
      size: totalSize,
      isFolder,
      fileCount: items.length,
      direction: 'outbound',
      status: 'requesting',
      cancelled: false
    });

    const displayName = isFolder ? folderName : (items.length > 1 ? `${items.length} Files` : items[0].file.name);

    createTransferUI(transferKey, isFolder ? `${folderName} (Folder)` : (items.length > 1 ? `${items.length} Files` : items[0].file.name), totalSize, 'outbound', targetName);

    // Register session with backend stream bridge
    fetch('/api/transfer/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId,
        senderPeerId: myPeerId,
        targetPeerId,
        name: displayName,
        size: totalSize,
        isFolder,
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
          name: isFolder ? folderName : (items.length > 1 ? `${items.length} Files` : items[0].file.name),
          size: totalSize,
          isFolder,
          fileCount: items.length,
          mime: isFolder ? 'application/zip' : (items.length === 1 ? (items[0].file.type || 'application/octet-stream') : 'multipart/mixed')
        }
      }));
    } else {
      showToast('WebSocket connection error. Please refresh.', 'error');
    }
  });

  showToast(`Transfer requested to ${targetPeerIds.length} peer(s)`, 'info');
}

function handleIncomingFileRequest(data) {
  console.log('[Transfer] Incoming transfer request from peer:', data);
  incomingRequest = data;
  incomingSenderText.textContent = `${data.senderName} wants to send ${data.file.isFolder ? 'a folder' : 'files'}`;
  incomingFileName.textContent = data.file.name;
  incomingFileSize.textContent = `${formatBytes(data.file.size)} ${data.file.isFolder ? `(${data.file.fileCount} files)` : ''}`;

  if (data.file.isFolder) {
    incomingFileBadgeIcon.innerHTML = '<i data-lucide="folder" class="w-5 h-5 text-amber-400"></i>';
    incomingModalTitle.textContent = 'Incoming Folder Transfer';
  } else {
    incomingFileBadgeIcon.innerHTML = '<i data-lucide="file" class="w-5 h-5 text-blue-400"></i>';
    incomingModalTitle.textContent = 'Incoming File Request';
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
  const { sender, senderName, fileId, file } = incomingRequest;

  let chosenHandle = null;

  // Option 1: If browser supports Native File System Directory Picker (Chrome/Brave/Edge in secure/localhost context)
  if (file.isFolder && window.isSecureContext && typeof window.showDirectoryPicker === 'function') {
    try {
      showToast(`Choose destination folder for "${file.name}"...`, 'info');
      chosenHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      console.log('showDirectoryPicker cancelled or unavailable, will download via browser:', err);
      chosenHandle = null;
    }
  }

  incomingModal.classList.add('hidden');

  const transferKey = `${fileId}_${sender}`;
  activeTransfers.set(transferKey, {
    fileId,
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

  createTransferUI(transferKey, file.name, file.size, 'inbound', senderName);

  // Stream-to-Disk: Trigger native browser download directly from server stream
  // 0 MB RAM footprint on receiver, preventing browser OOM 'Aw Snap' crashes
  const downloadUrl = `/api/transfer/download/${fileId}`;
  triggerDownload(downloadUrl, file.name);

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
  const { sender, fileId } = incomingRequest;
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

  if (data.accepted) {
    showToast(`${data.senderName} accepted the transfer`, 'success');
    const speedEl = document.getElementById(`speed-${transferKey}`);
    if (speedEl) speedEl.textContent = 'Waiting for receiver stream...';
    // Fallback: If stream-ready doesn't trigger within 2s, start streaming
    setTimeout(() => {
      const t = activeTransfers.get(transferKey);
      if (t && t.status !== 'transferring' && t.status !== 'completed' && !t.cancelled) {
        startSendingStreamOutbound(data.fileId);
      }
    }, 2000);
  } else {
    showToast(`${data.senderName} declined the transfer`, 'error');
    cancelTransfer(transferKey, false, 'Declined by recipient');
  }
}

// UI Transfer Progress Cards
function createTransferUI(transferKey, name, size, direction, peerName) {
  transfersSection.classList.remove('hidden');
  const div = document.createElement('div');
  div.id = `transfer-${transferKey}`;
  div.className = 'apple-glass p-4 space-y-2.5 rounded-2xl transition-all';

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
      <div id="progress-${transferKey}" class="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-150 shadow-sm" style="width: 0%"></div>
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
  if (speed) speed.textContent = `${speedMbps.toFixed(1)} Mbps`;
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

    if (transfer.fileId) {
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
  if (el) el.remove();
  activeTransfers.delete(transferKey);

  if (transfersList.children.length === 0) {
    transfersSection.classList.add('hidden');
  }
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

function handleIncomingFileHeader(senderId, header) {
  const state = getOrCreateReceiver(senderId);
  state.currentFileIndex = header.fileIndex;
  state.receivedFileBuffers = [];
  state.currentFileBytes = 0;

  // Handle 0-byte file immediately
  if (header.size === 0) {
    state.accumulatedFiles.push({
      relativePath: header.relativePath,
      name: header.relativePath.split('/').pop(),
      blob: new Blob([], { type: 'application/octet-stream' })
    });
  }
}

// Helper: Recursively write a file/blob to a chosen directory handle with directory tree recreation
async function writeBlobToDirectoryHandle(rootDirHandle, relativePath, blob) {
  // Normalize path separators
  const parts = relativePath.split('/').filter(p => p.length > 0);
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
    state.accumulatedFiles.push({
      relativePath: targetFileMeta.relativePath,
      name: targetFileMeta.name || targetFileMeta.relativePath.split('/').pop(),
      blob: fileBlob
    });

    // Reset buffer for next file immediately
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

  // Flush any remaining buffers for current file into accumulatedFiles
  if (state.receivedFileBuffers.length > 0 && state.meta.files && state.meta.files[state.currentFileIndex]) {
    const targetFileMeta = state.meta.files[state.currentFileIndex];
    const fileBlob = new Blob(state.receivedFileBuffers, { type: targetFileMeta.mime || 'application/octet-stream' });
    state.accumulatedFiles.push({
      relativePath: targetFileMeta.relativePath,
      name: targetFileMeta.name || targetFileMeta.relativePath.split('/').pop(),
      blob: fileBlob
    });
    state.receivedFileBuffers = [];
    state.currentFileBytes = 0;
  }

  const isFolder = !!(state.meta && state.meta.isFolder);
  const destDirHandle = state.destDirHandle;

  try {
    if (destDirHandle) {
      // 1. Directory chosen via Native File System Access API
      let targetFolderHandle = destDirHandle;
      if (isFolder && destDirHandle.name !== state.meta.name) {
        targetFolderHandle = await destDirHandle.getDirectoryHandle(state.meta.name, { create: true });
      }
      for (const item of state.accumulatedFiles) {
        let cleanRelPath = item.relativePath;
        if (isFolder && cleanRelPath.startsWith(state.meta.name + '/')) {
          cleanRelPath = cleanRelPath.substring(state.meta.name.length + 1);
        }
        await writeBlobToDirectoryHandle(targetFolderHandle, cleanRelPath, item.blob);
      }
      showToast(`Saved "${state.meta.name}" to chosen directory!`, 'success');
    } else if (isFolder || state.accumulatedFiles.length > 1) {
      // 2. Folder or multiple files: package as zip and trigger native browser download
      showToast(`Preparing "${state.meta.name}.zip"...`, 'info');
      await downloadAsZip(state.meta.name, state.accumulatedFiles);
      showToast(`Downloaded "${state.meta.name}.zip"!`, 'success');
    } else if (state.accumulatedFiles.length === 1) {
      // 3. Single file: trigger direct browser download
      const single = state.accumulatedFiles[0];
      triggerDownload(single.blob, state.meta.name || single.name);
      showToast(`Downloaded "${state.meta.name}"!`, 'success');
    } else {
      showToast(`Transfer of "${state.meta.name}" completed!`, 'success');
    }
  } catch (err) {
    console.error('[Finalize Transfer] Error delivering download:', err);
    showToast(`Download notice: ${err.message}`, 'error');
  }

  if (transfer) transfer.status = 'completed';
  updateTransferCompleted(transferKey);

  state.meta = null;
  state.receivedFileBuffers = [];
  state.currentFileBytes = 0;
  state.accumulatedFiles = [];
  state.destDirHandle = null;
}

async function downloadAsZip(folderName, files) {
  const safeFolderName = (folderName || 'folder').replace(/[\\/:*?"<>|]/g, '_');
  if (typeof JSZip !== 'undefined') {
    const zip = new JSZip();
    files.forEach(item => {
      let relPath = item.relativePath || item.name;
      if (relPath.startsWith(safeFolderName + '/')) {
        relPath = relPath.substring(safeFolderName.length + 1);
      }
      zip.file(relPath, item.blob);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, `${safeFolderName}.zip`);
  } else {
    files.forEach(item => {
      triggerDownload(item.blob, item.relativePath.split('/').pop());
    });
  }
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
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    if (isObjectURL) {
      URL.revokeObjectURL(a.href);
    }
  }, 2000);
}

// Synchronized Outbound Streaming (500 Mbps Rate-Limited, Lockstep Sync)
async function startSendingStreamOutbound(fileId) {
  const queueData = outboundQueue.get(fileId);
  if (!queueData) return;

  const transferEntry = Array.from(activeTransfers.values()).find(t => t.fileId === fileId);
  const targetPeerId = transferEntry ? transferEntry.targetPeerId : null;
  const transferKey = `${fileId}_${targetPeerId}`;
  const transfer = activeTransfers.get(transferKey);
  if (!transfer || transfer.cancelled) return;

  transfer.status = 'transferring';
  const speedEl = document.getElementById(`speed-${transferKey}`);
  if (speedEl) speedEl.textContent = 'Transferring (500 Mbps max)...';

  const MAX_SPEED_BPS = (500 * 1024 * 1024) / 8; // 500 Mbps = 65,536,000 bytes/sec
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  let totalUploaded = 0;
  const startTime = Date.now();

  try {
    for (let fileIdx = 0; fileIdx < queueData.items.length; fileIdx++) {
      if (transfer.cancelled) break;
      const item = queueData.items[fileIdx];

      if (item.file.size === 0) {
        // 0-byte file
        await fetch(`/api/transfer/chunk/${fileId}?path=${encodeURIComponent(item.relativePath)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new ArrayBuffer(0)
        });
        continue;
      }

      let fileOffset = 0;
      while (fileOffset < item.file.size) {
        if (transfer.cancelled) break;

        // 1. 500 Mbps Rate Limiter
        const targetElapsedMs = (totalUploaded * 1000) / MAX_SPEED_BPS;
        const actualElapsedMs = Date.now() - startTime;
        if (actualElapsedMs < targetElapsedMs) {
          const waitMs = targetElapsedMs - actualElapsedMs;
          await new Promise(r => setTimeout(r, waitMs));
        }

        if (transfer.cancelled) break;

        // 2. Read 1MB chunk from disk (zero RAM accumulation)
        const chunkEnd = Math.min(fileOffset + CHUNK_SIZE, item.file.size);
        const blobSlice = item.file.slice(fileOffset, chunkEnd);
        const chunkBuffer = await blobSlice.arrayBuffer();

        // 3. Post chunk to server stream
        const query = queueData.isFolder
          ? `path=${encodeURIComponent(item.relativePath)}`
          : '';

        const resp = await fetch(`/api/transfer/chunk/${fileId}?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunkBuffer
        });

        if (!resp.ok) {
          throw new Error(`Upload failed with status ${resp.status}`);
        }

        const result = await resp.json();
        fileOffset += chunkBuffer.byteLength;
        totalUploaded += chunkBuffer.byteLength;

        // Synchronous update
        updateTransferProgress(transferKey, result.transferred, queueData.totalSize, result.speedMbps);
      }
    }

    if (!transfer.cancelled) {
      await fetch(`/api/transfer/finish/${fileId}`, { method: 'POST' });
      transfer.status = 'completed';
      updateTransferCompleted(transferKey);
    }
  } catch (err) {
    console.error('[Stream Transfer] Error:', err);
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
let localManifest = []; // Array of { path, size, lastModified }
let autoSyncInterval = null;

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
    // 1. If in a secure context (e.g. localhost or HTTPS) with modern Native File System Access API
    if (window.isSecureContext && typeof window.showDirectoryPicker === 'function') {
      e.preventDefault();
      window.showDirectoryPicker({ mode: 'readwrite' })
        .then(async (handle) => {
          localSyncDirHandle = handle;
          localFilesFallbackMap.clear();
          localFolderName.textContent = handle.name;
          localFolderStatusBadge.textContent = 'Direct Disk Access';
          localFolderStatusBadge.className = 'text-[11px] font-medium bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-400/30';
          rescanLocalFolderBtn.disabled = false;

          appendSyncLog(`Local sync folder chosen: "${handle.name}" (Direct Disk Mode)`, 'info');
          await scanLocalSyncFolder();
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.warn('showDirectoryPicker failed, falling back to input:', err);
          if (syncFolderInput) syncFolderInput.click();
        });
      return;
    }

    // 2. On LAN client HTTP connections (http://10.0.0.x:8080) or Brave without flags:
    // DO NOT preventDefault! The native <label for="syncFolderInput"> click event directly triggers the OS folder picker dialog!
    appendSyncLog('Opening folder picker...', 'info');
  };
}

// Drag & drop folder directly onto the Local Sync Folder card
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

    const files = Array.from(e.target.files);
    const firstRel = files[0].webkitRelativePath || files[0].name;
    const folderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Selected Folder';

    let totalBytes = 0;
    localManifest = files.map(file => {
      // Relative path without the top folder name prefix for consistent syncing
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
      await scanLocalSyncFolder();
    } else if (syncFolderInput) {
      syncFolderInput.click();
    }
  };
}

async function scanLocalSyncFolder() {
  if (localSyncDirHandle) {
    localFolderMeta.textContent = 'Scanning files...';
    appendSyncLog('Scanning local folder...', 'info');

    localManifest = [];
    let totalBytes = 0;

    async function traverse(dirHandle, currentPath) {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const file = await entry.getFile();
          const relPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          localManifest.push({
            path: relPath,
            size: file.size,
            lastModified: file.lastModified
          });
          totalBytes += file.size;
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

    appendSyncLog(`Initiating sync with peer...`, 'info');
    syncOverallStateBadge.textContent = 'Exchanging Manifests...';

    // Refresh local manifest
    await scanLocalSyncFolder();

    // Send manifest to target peer
    ws.send(JSON.stringify({
      type: 'sync-manifest',
      target: targetPeerId,
      direction: syncDirectionSelect.value,
      manifest: localManifest
    }));
  };
}

// Incoming remote manifest handler
async function handleSyncManifestReceived(data) {
  appendSyncLog(`Received manifest from ${data.senderName} (${data.manifest.length} files)`, 'info');
  metricRemoteFiles.textContent = data.manifest.length;

  if (!localSyncDirHandle && localFilesFallbackMap.size === 0) {
    appendSyncLog('Remote peer requested sync, but no local folder is selected on this PC.', 'warn');
    showToast(`${data.senderName} wants to sync folders. Select a local folder in "Folder Sync" tab!`, 'warn');
    return;
  }

  // Rescan local to ensure fresh state
  await scanLocalSyncFolder();

  const remoteManifest = data.manifest;
  const localMap = new Map(localManifest.map(f => [f.path, f]));
  const remoteMap = new Map(remoteManifest.map(f => [f.path, f]));

  const toDownload = []; // Files remote has that local needs
  const toUpload = [];   // Files local has that remote needs

  // Check remote files against local
  remoteManifest.forEach(rf => {
    const lf = localMap.get(rf.path);
    if (!lf || rf.lastModified > lf.lastModified) {
      toDownload.push(rf);
    }
  });

  // Check local files against remote
  localManifest.forEach(lf => {
    const rf = remoteMap.get(lf.path);
    if (!rf || lf.lastModified > rf.lastModified) {
      toUpload.push(lf);
    }
  });

  metricPendingUploads.textContent = toUpload.length;
  metricPendingDownloads.textContent = toDownload.length;

  if (toDownload.length === 0 && toUpload.length === 0) {
    syncOverallStateBadge.textContent = 'In Sync';
    syncOverallStateBadge.className = 'text-xs font-semibold text-emerald-400';
    appendSyncLog('Folders are already identical and 100% in sync!', 'success');
    return;
  }

  appendSyncLog(`Diff computed: ${toUpload.length} to upload, ${toDownload.length} to download`, 'info');
  syncOverallStateBadge.textContent = 'Syncing Delta...';

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

async function getFileFromLocalHandle(rootDirHandle, path) {
  // Check memory fallback first (Brave / universal mode)
  if (localFilesFallbackMap.has(path)) {
    return localFilesFallbackMap.get(path);
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
