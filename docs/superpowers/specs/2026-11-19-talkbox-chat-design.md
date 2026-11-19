# TalkBox Update (v1.0.4) Design Specification

## Overview
**Feature:** TalkBox — Integrated Local LAN Messenger and Quick Image Sharing.  
**Version:** `1.0.4` ("The TalkBox Update").  
**Author:** Antigravity & Rahul Redkar.  
**Target:** LocalDrop LAN web client and standalone Windows distribution.

---

## 1. Intent & Problem Statement
Currently, LocalDrop LAN excels at streaming large files and recursive folder trees across the local network. However, users frequently want to quickly share:
1. Quick text snippets, verification codes, Wi-Fi keys, or URLs.
2. Screenshots, photos, and memes without going through the multi-step file-transfer confirmation prompt dialog.
3. Rapid two-way conversations between a PC and phone/tablet in real time.

"TalkBox" provides an ultra-low-latency, zero-configuration local chat room right inside LocalDrop LAN.

---

## 2. Goals & Non-Goals

### Goals:
- **Instant Messaging:** Send and receive text messages instantly via existing local WebSockets.
- **Image Sharing:** Drag-and-drop images, paste images directly from the clipboard (`Ctrl+V`), or upload via file picker (`image/*`).
- **Channels:**
  - **General LAN Room:** Broadcast room visible to all currently connected peers on the subnet.
  - **1-on-1 Direct Chats:** Private conversation tabs with specific discovered peers.
- **Media Previews & Lightbox:** Inline responsive image previews in chat bubbles with a click-to-enlarge lightbox and direct download button.
- **Unread Badges & Notifications:** Audio click/chime and visual unread badge count on the TalkBox navigation tab when viewing another tab.
- **Apple Liquid Glass Aesthetic:** Matches the visionOS frosted glass, fluid gradients, and rounded capsule controls.

### Non-Goals:
- Cloud-hosted persistent database (messages are ephemeral and held in memory during the browser session).
- Heavy audio/video calling (LocalDrop focuses on data and messaging).

---

## 3. Approaches Considered & Selected

- **Approach A: Dedicated "TalkBox" Top-Level Tab (Selected)**
  - Integrates into the header segmented control alongside `Transfer` and `Folder Sync`.
  - Provides ample screen real estate on desktop and mobile for channel lists, message history, image previews, and composer tools.
  - Chosen by user.

- **Approach B: Floating Collapsible Dock/Widget (Rejected)**
  - Small pop-up drawer over radar screen. Rejected due to cramped mobile UX and overlay conflicts with transfer progress bars.

- **Approach C: Modal per Peer (Rejected)**
  - Chat only available when clicking a peer modal. Rejected because it precludes broadcast room chat across multiple devices.

---

## 4. Architecture & Protocol

### 4.1 WebSocket Wire Format
New message type in `server.js`:
```json
{
  "type": "chat-message",
  "id": "msg_1732025000123_a8f9",
  "target": null,
  "sender": "peer_xyz",
  "senderName": "Rahul's Laptop",
  "senderColor": "#007AFF",
  "senderDeviceType": "desktop",
  "text": "Check this screenshot!",
  "image": {
    "name": "screenshot.png",
    "type": "image/png",
    "data": "data:image/png;base64,..."
  },
  "timestamp": 1732025000123
}
```

- If `target` is `null` or omitted: Broadcast to all active WebSocket clients on the LAN.
- If `target` is a specific `peerId`: Relay solely to that peer and the sender.

### 4.2 Image Optimization
- Client-side canvas compression for images exceeding 1920px max dimension or 2MB to keep WebSocket transmissions snappy and responsive across low-end mobile hardware.

---

## 5. UI & Interaction Design

### 5.1 Navigation Integration
In `public/index.html`:
```html
<nav>
  <button id="tabRadarBtn">Transfer</button>
  <button id="tabSyncBtn">Folder Sync</button>
  <button id="tabTalkBtn">
    <span>TalkBox</span>
    <span id="talkboxUnreadBadge" class="hidden">0</span>
  </button>
</nav>
```

### 5.2 TalkBox Stage (`#talkboxStage`)
1. **Sidebar:**
   - **General LAN Room:** Top channel with broadcasting radio icon.
   - **Direct Chats:** Dynamically updated list of discovered peers with avatars, device icons, online status dots, and unread badges.
2. **Conversation Pane:**
   - **Header:** Channel title, active peer details, and clear chat button.
   - **Scrollable Message List:**
     - Left-aligned bubbles for incoming peers (color-coded sender name, device badge, timestamp).
     - Right-aligned bubbles for self (Apple blue gradient).
     - Inline image thumbnails with hover download & click to open full-resolution Lightbox.
     - Copy button on text hover.
   - **Composer:**
     - Image attachment button (`lucide-image`).
     - Multi-line autosizing text input or responsive input field with paste (`Ctrl+V`) listener.
     - Image staging thumbnail preview with remove button before sending.
     - Send button (`lucide-send`).
3. **Image Lightbox Modal (`#imageLightboxModal`):**
   - Frosted backdrop with zoom controls, filename display, and download button.

---

## 6. Verification & Versioning
- Version bump: `1.0.4` across all files (`package.json`, `package-lock.json`, `installer.iss`, `server.js`, `public/app.js`, `public/index.html`, `test/app.test.js`, `.github/workflows/release.yml`, `README.md`).
- Automated tests:
  - Unit test in `test/app.test.js` validating `chat-message` broadcast and direct routing.
  - Asset and element integrity tests.
- Git release tag `v1.0.4` and CI/CD verification.
