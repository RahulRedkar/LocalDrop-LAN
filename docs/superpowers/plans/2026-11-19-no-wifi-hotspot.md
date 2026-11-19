# "No Wifi No Problem" Temporary Hotspot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an on-demand, temporary Wi-Fi Hotspot mode in LocalDrop LAN so users without an active Wi-Fi network can connect devices and transfer files at full hardware speed with one click.

**Architecture:** A native PowerShell helper uses Windows 10/11 WinRT `NetworkOperatorTetheringManager` (with fallback to `netsh wlan hostednetwork`) to control hotspot broadcast. `server.js` exposes `/api/hotspot/*` endpoints and tracks state, binding to the hotspot IP (`192.168.137.1`), while `public/index.html` and `app.js` render an Apple Liquid Glass offline banner, modal, and dual QR codes (`WIFI:T:WPA;...` and `http://...`). Clean teardown hooks ensure no zombie hotspots remain.

**Tech Stack:** Node.js, Express, WebSocket, PowerShell (WinRT TetheringManager / Netsh), HTML5/Tailwind/Lucide/QRCode.js.

**Spec:** [`docs/superpowers/specs/2026-11-19-no-wifi-hotspot-design.md`](file:///e:/LANShare/docs/superpowers/specs/2026-11-19-no-wifi-hotspot-design.md)

## Global Constraints
- **Platform:** Windows 10/11 native hotspot execution with graceful fallback/status message on non-Wi-Fi or unsupported systems.
- **SSID / Security:** Default SSID `LocalDrop-Direct`, WPA2 passphrase generated or fixed to `localdrop8080`.
- **Port:** LocalDrop HTTP runs on port `8080` (or `process.env.PORT`).
- **Teardown:** Hotspot must be shut down when the user clicks "Stop Hotspot" or when the Node.js server process exits (`SIGINT`, `SIGTERM`, `exit`).
- **Version:** Version bumped to `1.0.3`.

## Review Focus
1. **Machine without Wi-Fi Adapter:** Handled gracefully with `{ supported: false, error: 'No wireless adapter found' }` without throwing.
2. **Wi-Fi already connected:** Detection logic accurately identifies active LAN and does not pester the user.
3. **Hotspot IP Bind:** Server dynamically recognizes the `192.168.137.1` gateway interface.
4. **Phone QR Code:** Wi-Fi QR code adheres strictly to standard `WIFI:T:WPA;S:LocalDrop-Direct;P:localdrop8080;;` format.
5. **App Exit Teardown:** Cleanup function triggers hotspot deactivation before process termination.

---

### Task 1: Native Hotspot Management Module

**Files:**
- Create: `hotspot-manager.js`
- Test: `test/hotspot.test.js`

- [ ] Write unit test in `test/hotspot.test.js` verifying that `hotspot-manager.js` exports `getStatus`, `startHotspot`, `stopHotspot`, and returns predictable status payloads.
- [ ] Implement `hotspot-manager.js` using PowerShell scripts that interact with `[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]` and fallback to `netsh`.
- [ ] Run `node test/hotspot.test.js` to verify functionality.
- [ ] Commit Task 1.

---

### Task 2: Server API Endpoints & Process Lifecycle Teardown

**Files:**
- Modify: `server.js`
- Test: `test/app.test.js`

- [ ] Add `/api/network-status` endpoint returning active LAN IPs and `isOffline` boolean.
- [ ] Add `/api/hotspot/status`, `POST /api/hotspot/start`, `POST /api/hotspot/stop` endpoints.
- [ ] Hook `stopHotspot` into the server `cleanup()` function (`SIGINT`, `SIGTERM`, `exit`).
- [ ] Add tests in `test/app.test.js` covering the new endpoints.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Commit Task 2.

---

### Task 3: UI Offline Banner, Hotspot Modal & Dual QR Code Pairing

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

- [ ] Add "Hotspot" button in navigation header next to "How to Use" and "QR Code".
- [ ] Add `#noWifiBanner` that slides down when no active LAN connection is detected.
- [ ] Add `#hotspotModal` with Apple Liquid Glass styling showing:
  - Hotspot status badge & network info
  - One-click "Start Instant Hotspot" and "Stop Hotspot" controls
  - Dual QR Code cards: (1) Join Wi-Fi QR code, (2) Open LocalDrop Web App QR code
- [ ] Wire up status polling, start/stop actions, and QR code generation in `public/app.js`.
- [ ] Test UI locally and verify with `npm test`.
- [ ] Commit Task 3.

---

### Task 4: Version Bump to 1.0.3, Regression Testing & Git Push

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

- [ ] Update version strings to `1.0.3` across all metadata files.
- [ ] Update `README.md` documenting the "No Wifi No Problem" feature.
- [ ] Run full test suite (`npm test`).
- [ ] Commit with message `"Update 1.0.3 - No Wifi No Problem Hotspot Update"`.
- [ ] Tag `v1.0.3` and push to GitHub `main` and tag `v1.0.3`.
- [ ] Verify GitHub Actions CI/CD release workflow passes.
