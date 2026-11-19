const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = process.platform === 'win32';

function resolveScriptPath() {
  const cwdPath = path.join(process.cwd(), 'scripts', 'hotspot.ps1');
  if (fs.existsSync(cwdPath)) return cwdPath;

  const exePath = path.join(path.dirname(process.execPath), 'scripts', 'hotspot.ps1');
  if (fs.existsSync(exePath)) return exePath;

  const dirPath = path.join(__dirname, 'scripts', 'hotspot.ps1');
  if (fs.existsSync(dirPath)) return dirPath;

  try {
    const embeddedContent = fs.readFileSync(dirPath, 'utf8');
    const tmpScriptPath = path.join(os.tmpdir(), 'localdrop-hotspot.ps1');
    fs.writeFileSync(tmpScriptPath, embeddedContent, 'utf8');
    return tmpScriptPath;
  } catch (_) {
    return dirPath;
  }
}

function runPowerShellScript(action, ssid = 'LocalDrop-Direct', password = 'localdrop8080') {
  return new Promise((resolve) => {
    if (!isWindows) {
      return resolve({
        supported: false,
        active: false,
        reason: 'Temporary hotspot creation is supported on Windows laptops.'
      });
    }

    const scriptPath = resolveScriptPath();
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Action', action,
      '-Ssid', ssid,
      '-Password', password
    ];

    execFile('powershell.exe', args, { timeout: 15000 }, (err, stdout) => {
      if (err && !stdout) {
        return resolve({
          supported: false,
          active: false,
          error: err.message
        });
      }

      try {
        const cleaned = (stdout || '').trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonStr);
          return resolve(parsed);
        }
      } catch (_) {}

      resolve({
        supported: false,
        active: false,
        error: 'Failed parsing hotspot response'
      });
    });
  });
}

async function getStatus() {
  const result = await runPowerShellScript('status');
  return {
    supported: Boolean(result.supported),
    active: Boolean(result.active),
    ssid: result.ssid || null,
    ip: result.ip || '192.168.137.1',
    reason: result.reason || ''
  };
}

async function startHotspot(options = {}) {
  const ssid = options.ssid || 'LocalDrop-Direct';
  const password = options.password || 'localdrop8080';
  const result = await runPowerShellScript('start', ssid, password);
  return {
    success: Boolean(result.success),
    ssid,
    password,
    ip: result.ip || '192.168.137.1',
    error: result.error || null
  };
}

async function stopHotspot() {
  const result = await runPowerShellScript('stop');
  return {
    success: Boolean(result.success),
    message: result.message || 'Hotspot stopped.'
  };
}

module.exports = {
  getStatus,
  startHotspot,
  stopHotspot
};
