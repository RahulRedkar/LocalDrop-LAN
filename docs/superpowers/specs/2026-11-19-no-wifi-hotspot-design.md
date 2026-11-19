# Design Document: "No Wifi No Problem" Temporary Hotspot Mode

**Date:** 2026-11-19  
**Version Target:** 1.0.3  
**Status:** Proposed (Approved Option A)

---

## 1. Intent & The "Why"
LocalDrop LAN is designed for direct, high-speed, local file transfers between phones, tablets, and computers over a shared Wi-Fi or Ethernet local area network. However, when users are traveling, outdoors, or in environments without an existing Wi-Fi network or router, devices cannot discover each other or establish a transport channel.

The **"No Wifi No Problem"** update provides a built-in mechanism that allows a laptop running LocalDrop to temporarily spin up a local Wi-Fi Hotspot on demand. Nearby devices (such as iPhones, Android phones, or other laptops) can connect directly to this hotspot to exchange files at uncapped hardware speeds without requiring an external Wi-Fi router or an internet connection.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
* **Automated Offline Detection:** Detect when the laptop is disconnected from local Wi-Fi/Ethernet (only loopback or virtual adapters available) and surface a clear "No Wi-Fi? No Problem!" prompt.
* **One-Click Hotspot Activation (Option A):** Allow the user to start a temporary local Wi-Fi hotspot directly from the LocalDrop UI with a single click.
* **Seamless Phone Pairing (Wi-Fi QR Code):** Display a specialized Wi-Fi configuration QR code (`WIFI:T:WPA;S:...;P:...;;`) so mobile phones can connect to the hotspot in one camera tap without typing passwords.
* **Direct Web Access:** Once connected, mobile devices can open `http://<hotspot-ip>:8080` (or scan the second web QR code) to immediately access LocalDrop.
* **Clean Teardown:** Provide a "Stop Hotspot" button in the UI and automatically shut down the hotspot when the LocalDrop app is closed or terminated.
* **Cross-Platform Safety:** If a machine has no Wi-Fi hardware (e.g. desktop Ethernet PC) or runs on a non-Windows OS, fail gracefully with a friendly message instead of crashing.

### Non-Goals
* **Internet Sharing / Cellular Tethering:** The hotspot is not meant to forward cellular or internet data; it serves solely as an isolated local peer-to-peer Wi-Fi network for LocalDrop LAN.
* **Permanent Hotspot Infrastructure:** The hotspot is temporary and session-bound to the app lifetime.

### Anti-Goals
* **Accidental Activation:** Never force or start a hotspot automatically while the user is already connected to an active working Wi-Fi network.
* **Stale / Zombie Broadcasts:** Never leave the hotspot running silently in the background after the user exits LocalDrop.

---

## 3. Approaches Considered

| Approach | Description | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Option A: Auto-Detect + One-Click Activation** | Detects lack of Wi-Fi and prompts the user with an Apple Liquid Glass card to start the hotspot. Generates a Wi-Fi QR code and auto-cleans on exit. | Predictable, zero accidental hotspot toggling, seamless UX with Wi-Fi QR pairing. | Requires 1 click from user. | **Selected by User** |
| **Option B: Fully Headless Auto-Start** | Automatically activates the hotspot on app launch if no Wi-Fi is detected without asking. | Zero user interaction. | Could start unwanted hotspots if the user temporarily toggled airplane mode or was about to plug in an Ethernet cable. | Rejected |
| **Option C: Third-Party Utility Dependency** | Bundles external CLI tools or drivers to create virtual network adapters. | Works on older Windows 7/8. | Heavyweight, security flags, driver conflicts, anti-virus warnings. | Rejected |

---

## 4. Technical Architecture

### 4.1 Backend Engine (`server.js` & Hotspot Helper)
1. **Network Status Detection (`GET /api/network-status`)**:
   - Queries `os.networkInterfaces()`.
   - Distinguishes between active external Wi-Fi/Ethernet adapters vs loopback (`127.0.0.1`) and virtual host-only bridges (VirtualBox, Hyper-V).
   - If no valid external LAN connection is found, flags `isOffline: true`.
2. **Hotspot Management Script (`scripts/hotspot.ps1` or inline PowerShell execution)**:
   - Uses Windows native WinRT API: `[Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]`.
   - Method `CreateFromConnectionProfile` to query current tethering capability.
   - Sets SSID (e.g., `LocalDrop-Direct`) and a secure auto-generated WPA2 passphrase (e.g., `localdrop8080`).
   - Calls `StartTetheringAsync()` / `StopTetheringAsync()`.
   - Secondary fallback for legacy Wi-Fi drivers: `netsh wlan set hostednetwork mode=allow ssid=LocalDrop-Direct key=...` and `netsh wlan start hostednetwork`.
3. **Endpoints**:
   - `GET /api/hotspot/status`: Returns `{ supported: boolean, active: boolean, ssid: string, ip: string }`.
   - `POST /api/hotspot/start`: Starts the hotspot, obtains the assigned subnet gateway IP (typically `192.168.137.1`), and responds with credentials and connection strings.
   - `POST /api/hotspot/stop`: Cleanly shuts down the hotspot.
4. **Lifecycle Hooks**:
   - Registered in `cleanup()` (`SIGINT`, `SIGTERM`, `process.on('exit')`) to ensure the hotspot is always stopped when the server exits.

### 4.2 Frontend UI & UX (`public/index.html` & `public/app.js`)
1. **"No Wi-Fi? No Problem!" Banner & Modal**:
   - When `networkIpBadge` detects no active LAN connection (or user clicks the new "Hotspot" button in the header), an Apple Liquid Glass card slides into view:
     > **📡 No Wi-Fi? No Problem!**  
     > Create an instant temporary hotspot so your phone or another laptop can connect directly.  
     > `[ Create Instant Hotspot ]`
2. **Active Hotspot Pairing View**:
   - Displays active status: `Broadcasting: LocalDrop-Direct`.
   - **Wi-Fi QR Code**: Renders a standard Wi-Fi pairing QR code:
     `WIFI:T:WPA;S:LocalDrop-Direct;P:localdrop8080;;`
     Scanning this from iOS Camera or Android Quick Settings instantly connects the device to the laptop's Wi-Fi without manual typing.
   - **LocalDrop App Link**: Shows `http://192.168.137.1:8080` with a one-click button to open or share.
   - **Stop Button**: Clear "Stop Hotspot" button to return to normal mode.

---

## 5. Security & Permission Considerations
* Windows requires standard user or administrator rights depending on policy. The WinRT `NetworkOperatorTetheringManager` operates under standard user privileges on modern Windows 10/11 for local tethering.
* The hotspot uses WPA2-PSK encryption so unauthorized passersby cannot connect without the QR code or passphrase.
* The hotspot is strictly bound to the application lifecycle.

---

## 6. Verification & Test Plan
* **Unit & Integration Tests (`test/app.test.js`)**:
  - Test `/api/network-status` returns valid connectivity information.
  - Test `/api/hotspot/status` handles supported/unsupported environments without throwing uncaught exceptions.
  - Test UI asset elements (`#hotspotModal`, `#startHotspotBtn`, `#hotspotBanner`) exist and adhere to Apple Liquid Glass styling.
  - Test graceful fallback when wireless interface is not present.
* **Manual Verification**:
  - Disconnect Wi-Fi on laptop.
  - Launch LocalDrop LAN.
  - Verify "No Wi-Fi? No Problem" prompt appears.
  - Click "Create Instant Hotspot" and scan Wi-Fi QR code from mobile device.
  - Verify high-speed file transfer between phone and laptop.
  - Verify clicking "Stop Hotspot" or closing app cleanly restores network state.
