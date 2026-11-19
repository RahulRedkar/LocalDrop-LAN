# TalkBox Update & 100% Offline Asset Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all external online CDN dependencies by bundling local vendor libraries, and add "TalkBox"—a fast, zero-config LAN chatbox for quick text and image sharing across all connected devices.

**Architecture:** Vendor assets (`tailwindcss.js`, `lucide.min.js`, `qrcode.min.js`, `jszip.min.js`) are moved into `public/vendor/` and served locally. `server.js` WebSocket handler routes `'chat-message'` payloads for broadcast and direct peer channels. `public/index.html` and `public/app.js` add a third top-level tab (`#talkboxStage`) with channel switcher, chat bubbles, clipboard paste (`Ctrl+V`), image thumbnails, lightbox, and unread badges.

**Tech Stack:** Node.js, Express, WebSocket, Tailwind CSS (offline bundle), Lucide Icons (offline bundle), QRCode.js (offline bundle), HTML5 Canvas/FileReader.

**Spec:** [`docs/superpowers/specs/2026-11-19-talkbox-chat-design.md`](file:///e:/LANShare/docs/superpowers/specs/2026-11-19-talkbox-chat-design.md)

## Global Constraints
- **Zero Internet Requirement:** The entire web app must render its complete design, icons, and features offline without internet or external DNS access.
- **Wire Protocol:** Chat messages use WebSocket `{ type: 'chat-message', id, text, image, target, sender, senderName, senderColor, senderDeviceType, timestamp }`.
- **Image Size Guard:** Large images compressed or limited to avoid browser memory spikes over WebSocket.
- **Packaging:** All `public/vendor/` assets bundled into Inno Setup installer and `pkg` binary assets.
- **Version:** Version bumped to `1.0.4`.

## Review Focus
1. **Offline Air-gapped Rendering:** When laptop has no Wi-Fi/Internet, UI renders perfectly with Tailwind styles and Lucide icons.
2. **Hidden Elements Protection:** `.hidden { display: none !important; }` in `<style>` prevents any banner or modal leaks before JS runs.
3. **Chat Broadcasting:** General room messages reach all connected LAN peers.
4. **Direct 1-on-1 Messaging:** Targeted messages reach only the selected peer.
5. **Clipboard Image Paste:** Pasting a screenshot (`Ctrl+V`) stages image preview and sends seamlessly.

---

### Task 1: 100% Offline Vendor Assets & Baseline CSS

**Files:**
- Create: `public/vendor/tailwindcss.js`
- Create: `public/vendor/lucide.min.js`
- Create: `public/vendor/qrcode.min.js`
- Create: `public/vendor/jszip.min.js`
- Modify: `public/index.html`
- Modify: `package.json`
- Modify: `installer.iss`
- Test: `test/app.test.js`

- [ ] Download vendor assets to `public/vendor/` and verify integrity.
- [ ] Update `public/index.html` to reference local `/vendor/...` scripts instead of external CDN URLs.
- [ ] Add `.hidden { display: none !important; }` and `[hidden] { display: none !important; }` to `<style>` in `public/index.html`.
- [ ] Add test in `test/app.test.js` verifying all `/vendor/*` static endpoints return status 200.
- [ ] Run `npm test` to verify.

---

### Task 2: Server WebSocket Chat Relay Engine

**Files:**
- Modify: `server.js`
- Test: `test/app.test.js`

- [ ] Add `'chat-message'` handling in `server.js` supporting both General broadcast (`target: null` or `'all'`) and Direct messaging (`target: <peerId>`).
- [ ] Enforce payload validation (text truncation, image dataURI format check, timestamp).
- [ ] Add test in `test/app.test.js` verifying WebSocket chat message relay to all clients and to specific peer.
- [ ] Run `npm test` to verify.

---

### Task 3: Client TalkBox UI & Instant Image Composer

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: `test/app.test.js`

- [ ] Add "TalkBox" tab in navigation header (`#tabTalkBtn`) with unread badge (`#talkboxUnreadBadge`).
- [ ] Add `#talkboxStage` view with responsive layout:
  - Sidebar: General LAN Room channel + list of online peers with avatars, status dots, and unread badges.
  - Conversation pane: Header, scrollable message list with incoming/outgoing bubbles, timestamps, sender badges, and copy text action.
  - Composer bar: Text input, image picker button, clipboard paste listener (`Ctrl+V`), image staging preview with remove button, and send button.
- [ ] Add `#imageLightboxModal` for full-screen image inspection and 1-click download.
- [ ] Wire up WebSocket chat sending, incoming message handling, unread badge counter, and audio/toast notification.
- [ ] Test UI locally and verify with `npm test`.

---

### Task 4: Version Bump to 1.0.4, Regression Testing & Git Release

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `installer.iss`
- Modify: `server.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `test/app.test.js`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`

- [ ] Bump version strings to `1.0.4` across all files.
- [ ] Update `README.md` documenting "The TalkBox Update" and 100% offline bundling.
- [ ] Run full test suite (`npm test` and `node test/hotspot.test.js`).
- [ ] Commit with message `"Update 1.0.4 - The TalkBox Update & Offline Asset Bundling"`.
- [ ] Tag `v1.0.4` and push to GitHub `main` and `v1.0.4`.
- [ ] Verify GitHub Actions release workflow succeeds.
