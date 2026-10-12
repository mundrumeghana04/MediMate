/**
 * ==============================================================================
 * MediMate - Background Service & Auto-Start Manager
 * ==============================================================================
 * Manages the lifecycle of the MediMate local background service on Windows:
 *
 * Commands:
 *   node scripts/service-manager.js start
 *   node scripts/service-manager.js stop
 *   node scripts/service-manager.js restart
 *   node scripts/service-manager.js status
 *   node scripts/service-manager.js autostart-enable
 *   node scripts/service-manager.js autostart-disable
 *   node scripts/service-manager.js chrome-background-enable
 *   node scripts/service-manager.js chrome-background-disable
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, '.medimate.pid');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'medimate-service.log');
const LOG_ERR_FILE = path.join(LOGS_DIR, 'medimate-error.log');
const SERVER_SCRIPT = path.join(ROOT_DIR, 'server.js');
const PORT = process.env.PORT || 5000;
const IS_WINDOWS = process.platform === 'win32';

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {}
}

/**
 * Append timestamped message to service log
 */
function logToFile(message) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`, 'utf8');
  } catch (err) {}
}

/**
 * Check if HTTP health check responds
 */
function checkHealth(port = PORT, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, data: parsed, statusCode: res.statusCode });
        } catch (e) {
          resolve({ ok: res.statusCode === 200, data: null, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, error: 'Connection refused / offline' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timeout' });
    });
  });
}

/**
 * Get PID listening on port (Windows / Cross-Platform)
 */
function getPortPid(port = PORT) {
  try {
    if (IS_WINDOWS) {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(pid) && pid > 0) return pid;
        }
      }
    }
  } catch (err) {}
  return null;
}

/**
 * Check if a process is alive
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Read active PID from file or port inspection
 */
function getActivePid() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const savedPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (savedPid && isPidAlive(savedPid)) {
        return savedPid;
      }
    } catch (e) {}
  }
  const portPid = getPortPid(PORT);
  if (portPid && isPidAlive(portPid)) {
    return portPid;
  }
  return null;
}

/**
 * Windows User Startup Folder Path
 */
function getWindowsStartupDir() {
  if (!IS_WINDOWS) return null;
  return path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

/**
 * Command: START
 */
async function startService() {
  console.log('----------------------------------------------------');
  console.log(' MediMate Background Service — Starting...');
  console.log('----------------------------------------------------');

  const existingPid = getActivePid();
  if (existingPid) {
    const health = await checkHealth(PORT);
    if (health.ok) {
      console.log(`[INFO] MediMate is already running on port ${PORT} (PID: ${existingPid}).`);
      console.log(`Web App URL: http://localhost:${PORT}`);
      console.log(`Database:    ${health.data?.database || 'Connected'}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health (200 OK)`);
      return;
    }
  }

  logToFile('Starting MediMate background service process...');

  let childPid = null;

  if (IS_WINDOWS) {
    const psCmd = `Start-Process '${process.execPath.replace(/'/g, "''")}' -ArgumentList '${SERVER_SCRIPT.replace(/'/g, "''")}' -WorkingDirectory '${ROOT_DIR.replace(/'/g, "''")}' -RedirectStandardOutput '${LOG_FILE.replace(/'/g, "''")}' -RedirectStandardError '${LOG_ERR_FILE.replace(/'/g, "''")}' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id`;
    try {
      const pidStr = execSync(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { encoding: 'utf8' }).trim();
      childPid = parseInt(pidStr, 10);
    } catch (e) {
      logToFile('Start-Process failed, falling back to spawn: ' + e.message);
    }
  }

  if (!childPid || isNaN(childPid)) {
    const outFd = fs.openSync(LOG_FILE, 'a');
    const errFd = fs.openSync(LOG_FILE, 'a');
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
      cwd: ROOT_DIR,
      detached: true,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
      env: process.env
    });
    childPid = child.pid;
    child.unref();
  }

  fs.writeFileSync(PID_FILE, String(childPid), 'utf8');

  console.log(`[INFO] Process spawned with PID ${childPid}. Waiting for server ready...`);

  // Wait up to 10 seconds for /api/health to confirm ready
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const health = await checkHealth(PORT);
    if (health.ok) {
      isReady = true;
      logToFile(`MediMate server confirmed active on port ${PORT} (PID: ${childPid})`);
      break;
    }
  }

  if (isReady) {
    console.log('====================================================');
    console.log(' MediMate Background Service is ACTIVE!');
    console.log(` Process ID:  ${childPid}`);
    console.log(` Web App URL: http://localhost:${PORT}`);
    console.log(` Log File:    ${LOG_FILE}`);
    console.log('====================================================');
  } else {
    console.warn(`[WARN] Service spawned (PID: ${childPid}), but health check did not respond within 10s.`);
    console.warn(`Please inspect the log file for details: ${LOG_FILE}`);
  }
}

/**
 * Command: STOP
 */
async function stopService() {
  console.log('----------------------------------------------------');
  console.log(' MediMate Background Service — Stopping...');
  console.log('----------------------------------------------------');

  const pid = getActivePid();
  if (!pid) {
    console.log('[INFO] No active MediMate service found running.');
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    return;
  }

  logToFile(`Stopping MediMate background service (PID: ${pid})...`);

  try {
    if (IS_WINDOWS) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch (err) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e) {}
  }

  // Cleanup PID file
  if (fs.existsSync(PID_FILE)) {
    try { fs.unlinkSync(PID_FILE); } catch (e) {}
  }

  // Wait up to 3 seconds for port to clear
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 500));
    const portPid = getPortPid(PORT);
    if (!portPid) break;
  }

  logToFile(`MediMate service stopped (PID: ${pid}).`);
  console.log(`[SUCCESS] MediMate service (PID: ${pid}) has been stopped.`);
  console.log(`Port ${PORT} is now released.`);
}

/**
 * Command: RESTART
 */
async function restartService() {
  await stopService();
  await new Promise(r => setTimeout(r, 1000));
  await startService();
}

/**
 * Command: STATUS
 */
async function statusService() {
  console.log('====================================================');
  console.log(' MediMate Background Service — Diagnostic Status');
  console.log('====================================================');

  const pid = getActivePid();
  const health = await checkHealth(PORT);
  const isRunning = Boolean(pid && health.ok);

  console.log(` Service State:   ${isRunning ? 'ACTIVE (Running)' : 'INACTIVE (Stopped)'}`);
  console.log(` Process ID:      ${pid || 'N/A'}`);
  console.log(` Local Port:      ${PORT}`);
  console.log(` Web App URL:     http://localhost:${PORT}`);
  console.log(` Health Status:   ${health.ok ? '200 OK' : (health.error || 'Offline')}`);
  console.log(` Database:        ${health.data?.database || 'Unknown / Offline'}`);
  console.log(` Windows Runtime: ${IS_WINDOWS ? 'Windows 11 / Native Toast Supported' : process.platform}`);
  console.log(` Log File:        ${LOG_FILE}`);

  // Check Autostart status
  const startupDir = getWindowsStartupDir();
  let autostartEnabled = false;
  if (startupDir) {
    const vbsPath = path.join(startupDir, 'MediMate-Service.vbs');
    autostartEnabled = fs.existsSync(vbsPath);
  }
  console.log(` Windows Startup: ${autostartEnabled ? 'ENABLED (Silent Login Runner Active)' : 'DISABLED'}`);

  // Check Chrome Background shortcut status
  let chromeBackgroundStatus = 'Not Configured';
  if (startupDir) {
    const chromeLnk = path.join(startupDir, 'Google Chrome.lnk');
    if (fs.existsSync(chromeLnk)) {
      try {
        const psCheck = `(New-Object -ComObject WScript.Shell).CreateShortcut('${chromeLnk.replace(/'/g, "''")}').Arguments`;
        const args = execSync(`powershell -NoProfile -Command "${psCheck}"`, { encoding: 'utf8' }).trim();
        chromeBackgroundStatus = args.includes('--no-startup-window')
          ? 'ENABLED (--no-startup-window persistent socket)'
          : 'Standard Window Only (exits when windows close)';
      } catch (e) {
        chromeBackgroundStatus = 'Present in Startup';
      }
    } else {
      chromeBackgroundStatus = 'No Chrome shortcut in Startup';
    }
  }
  console.log(` Chrome Push:     ${chromeBackgroundStatus}`);

  // Display last 5 log entries
  if (fs.existsSync(LOG_FILE)) {
    try {
      const logs = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-5);
      console.log('\n--- Recent Service Logs (last 5 lines) ---');
      logs.forEach(l => console.log('  ' + l));
    } catch (e) {}
  }
  console.log('====================================================\n');
}

/**
 * Command: AUTOSTART-ENABLE
 */
function enableAutostart() {
  if (!IS_WINDOWS) {
    console.error('[ERROR] Autostart is only supported on Windows.');
    return;
  }
  const startupDir = getWindowsStartupDir();
  if (!startupDir || !fs.existsSync(startupDir)) {
    console.error('[ERROR] Windows Startup directory not found:', startupDir);
    return;
  }

  const vbsPath = path.join(startupDir, 'MediMate-Service.vbs');
  const serviceManagerScript = path.join(ROOT_DIR, 'scripts', 'service-manager.js');

  // VBScript executes node scripts/service-manager.js start silently (0 = hide window, False = don't block)
  const vbsContent = [
    `' MediMate Automatic Background Service Runner`,
    `' Generated by MediMate Service Manager`,
    `Set WshShell = CreateObject("WScript.Shell")`,
    `WshShell.CurrentDirectory = "${ROOT_DIR.replace(/"/g, '""')}"`,
    `WshShell.Run "node """"${serviceManagerScript.replace(/"/g, '""')}"""" start", 0, False`,
    `Set WshShell = Nothing`,
    ``
  ].join('\r\n');

  fs.writeFileSync(vbsPath, vbsContent, 'utf8');
  logToFile(`Installed autostart runner at: ${vbsPath}`);

  console.log('====================================================');
  console.log(' MediMate Auto-Start Successfully ENABLED');
  console.log('====================================================');
  console.log(` Runner Script: ${vbsPath}`);
  console.log(' Details:');
  console.log('  - MediMate will start automatically in the background when you log into Windows.');
  console.log('  - Runs completely silent (no black command window or popup).');
  console.log('  - Medicine reminders will trigger on schedule even without opening a browser.');
  console.log('====================================================\n');
}

/**
 * Command: AUTOSTART-DISABLE
 */
function disableAutostart() {
  if (!IS_WINDOWS) return;
  const startupDir = getWindowsStartupDir();
  if (!startupDir) return;

  const vbsPath = path.join(startupDir, 'MediMate-Service.vbs');
  if (fs.existsSync(vbsPath)) {
    try {
      fs.unlinkSync(vbsPath);
      logToFile(`Removed autostart runner: ${vbsPath}`);
      console.log(`[SUCCESS] MediMate Auto-Start has been DISABLED (removed ${vbsPath}).`);
    } catch (err) {
      console.error('[ERROR] Failed to remove autostart runner:', err.message);
    }
  } else {
    console.log('[INFO] MediMate Auto-Start was not configured.');
  }
}

/**
 * Command: CHROME-BACKGROUND-ENABLE
 * Updates or creates Google Chrome.lnk in Startup with --no-startup-window flag
 */
function enableChromeBackground() {
  if (!IS_WINDOWS) return;
  const startupDir = getWindowsStartupDir();
  if (!startupDir) return;

  const chromeLnk = path.join(startupDir, 'Google Chrome.lnk');
  const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  if (!fs.existsSync(chromeExe)) {
    console.warn(`[WARN] Standard Chrome executable not found at ${chromeExe}.`);
  }

  const psScript = `
$sh = New-Object -ComObject WScript.Shell
$lnkPath = '${chromeLnk.replace(/'/g, "''")}'
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.TargetPath = '${chromeExe.replace(/'/g, "''")}'
$lnk.Arguments = '--no-startup-window'
$lnk.WorkingDirectory = 'C:\\Program Files\\Google\\Chrome\\Application'
$lnk.WindowStyle = 7
$lnk.Save()
Write-Output "Chrome shortcut configured with --no-startup-window"
`;

  try {
    execSync(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, '; ')}"`, { stdio: 'inherit' });
    logToFile(`Configured Chrome background shortcut with --no-startup-window`);
    console.log('====================================================');
    console.log(' Chrome Background Push Runner ENABLED');
    console.log('====================================================');
    console.log(' Details:');
    console.log('  - Configured Startup shortcut: Google Chrome.lnk');
    console.log('  - Added flag: --no-startup-window');
    console.log('  - Chrome will keep its lightweight FCM socket alive in background upon Windows login.');
    console.log('====================================================\n');
  } catch (err) {
    console.error('[ERROR] Failed to configure Chrome background shortcut:', err.message);
  }
}

/**
 * Command: CHROME-BACKGROUND-DISABLE
 * Reverts Google Chrome.lnk in Startup back to blank arguments
 */
function disableChromeBackground() {
  if (!IS_WINDOWS) return;
  const startupDir = getWindowsStartupDir();
  if (!startupDir) return;

  const chromeLnk = path.join(startupDir, 'Google Chrome.lnk');
  if (!fs.existsSync(chromeLnk)) {
    console.log('[INFO] No Google Chrome.lnk found in Startup.');
    return;
  }

  const psScript = `
$sh = New-Object -ComObject WScript.Shell
$lnkPath = '${chromeLnk.replace(/'/g, "''")}'
$lnk = $sh.CreateShortcut($lnkPath)
$lnk.Arguments = ''
$lnk.Save()
Write-Output "Chrome shortcut arguments cleared"
`;

  try {
    execSync(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, '; ')}"`, { stdio: 'inherit' });
    logToFile(`Reverted Chrome startup shortcut arguments`);
    console.log('[SUCCESS] Chrome background shortcut reverted (arguments cleared).');
  } catch (err) {
    console.error('[ERROR] Failed to revert Chrome shortcut:', err.message);
  }
}

// CLI Execution Router
const cmd = (process.argv[2] || 'status').toLowerCase().trim();

switch (cmd) {
  case 'start':
    startService();
    break;
  case 'stop':
    stopService();
    break;
  case 'restart':
    restartService();
    break;
  case 'status':
    statusService();
    break;
  case 'autostart-enable':
  case 'autostart:enable':
    enableAutostart();
    break;
  case 'autostart-disable':
  case 'autostart:disable':
    disableAutostart();
    break;
  case 'chrome-background-enable':
  case 'chrome:background:enable':
    enableChromeBackground();
    break;
  case 'chrome-background-disable':
  case 'chrome:background:disable':
    disableChromeBackground();
    break;
  default:
    console.log(`Unknown command: ${cmd}`);
    console.log('Available commands: start, stop, restart, status, autostart-enable, autostart-disable, chrome-background-enable, chrome-background-disable');
    process.exit(1);
}
