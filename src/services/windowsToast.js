/**
 * ==============================================================================
 * MediMate - Native Windows Toast Notification Service
 * ==============================================================================
 * Dispatches native Windows 10/11 Action Center toast notifications directly
 * from the local Node.js service using PowerShell's Windows Runtime (WinRT) APIs.
 *
 * Why this is essential:
 * Desktop Chrome does not have an OS-level background push daemon on Windows.
 * When all Chrome windows are closed, Chrome completely exits from Task Manager,
 * cutting the connection to Google's FCM servers.
 *
 * This local helper allows scheduled medicine reminders to display on the
 * patient's desktop with sound and banner even when Chrome is completely closed!
 * ==============================================================================
 */

const { execFile } = require('child_process');
const os = require('os');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';

/**
 * Escapes text for XML toast payload
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Dispatch a native Windows toast notification
 * @param {Object} options
 * @param {string} options.title - Header title
 * @param {string} options.body - Reminder message text
 * @param {string} [options.attribution] - Footer attribution
 * @param {string} [options.actionUrl] - Optional URL to launch on click
 * @returns {Promise<boolean>}
 */
function sendWindowsToast({ title, body, attribution = 'MediMate Medicine Reminder', actionUrl = 'http://localhost:5000/schedule' }) {
  if (!IS_WINDOWS) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const safeTitle = escapeXml(title || 'MediMate Reminder');
    const safeBody = escapeXml(body || 'It is time for your scheduled medicine dose.');
    const safeAttribution = escapeXml(attribution);
    const safeUrl = escapeXml(actionUrl);

    // PowerShell script using WinRT ToastNotificationManager
    // Runs via powershell.exe with -NoProfile -NonInteractive -ExecutionPolicy Bypass
    const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null

$xmlTemplate = @"
<toast duration="long" launch="${safeUrl}">
    <visual>
        <binding template="ToastGeneric">
            <text>${safeTitle}</text>
            <text>${safeBody}</text>
            <text placement="attribution">${safeAttribution}</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Reminder" />
    <actions>
        <action content="Open MediMate" arguments="${safeUrl}" activationType="protocol" />
        <action content="Dismiss" arguments="dismiss" activationType="system" />
    </actions>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($xmlTemplate)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("MediMate")
$notifier.Show($toast)
`;

    // Execute asynchronously with bounded timeout (5 seconds max)
    const child = execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psScript
    ], {
      timeout: 5000,
      windowsHide: true
    }, (err, stdout, stderr) => {
      if (err) {
        console.warn('[WindowsToast Warning]', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

module.exports = {
  sendWindowsToast,
  IS_WINDOWS
};
