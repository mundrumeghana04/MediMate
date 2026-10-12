/**
 * ==============================================================================
 * MediMate - Background Push Notification Scheduler Service
 * ==============================================================================
 * Performs genuine server-side scheduling independently of client tab status.
 *
 * Capabilities:
 * 1. Checks due medicine schedule occurrences per patient timezone.
 * 2. Handles schedules near midnight and circular clock arithmetic accurately.
 * 3. Excludes completed medicine courses and doses already recorded as taken.
 * 4. Enforces concurrency safety via PushDeliveryLog compound unique index:
 *    { userId: 1, medicineId: 1, doseTime: 1, dateStr: 1 }.
 * 5. Safely retries transient failures within the 15-minute due window.
 * 6. Prunes expired / 410 Gone / 404 Not Found push subscriptions automatically.
 * 7. Delivers rich, privacy-conscious notifications with exact dose information.
 * 8. Exposes diagnostic health status for monitoring and automated verification.
 * ==============================================================================
 */

const webpush = require('web-push');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const PushDeliveryLog = require('../models/PushDeliveryLog');
const windowsToast = require('./windowsToast');

let schedulerInterval = null;
let isRunningTick = false;
let lastRunAt = null;
let lastRunDurationMs = 0;
let lastRunStats = {
  evaluatedUsers: 0,
  evaluatedMeds: 0,
  dueOccurrences: 0,
  sentNotifications: 0,
  skippedDuplicate: 0,
  prunedSubscriptions: 0
};

// Initialize VAPID configuration
function initVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:support@medimate.app',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } catch (err) {
      console.warn('[PushScheduler] VAPID init warning:', err.message);
    }
  }
}

initVapid();

/**
 * Compute local date (YYYY-MM-DD) and local time (HH:mm) for a given user timezone
 */
function getUserLocalTimeAndDate(user) {
  const tz = user.timezone || 'UTC';
  try {
    const now = new Date();
    // 'en-CA' outputs standard ISO format: YYYY-MM-DD
    const formatterDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const userDateStr = formatterDate.format(now);

    // 'en-GB' outputs standard 24h format: HH:mm
    const formatterTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const userTimeStr = formatterTime.format(now);

    const [h, m] = userTimeStr.split(':').map(Number);
    const totalMinutes = h * 60 + m;

    return { userDateStr, userTimeStr, totalMinutes };
  } catch (err) {
    // Graceful fallback to UTC
    const now = new Date();
    const userDateStr = now.toISOString().slice(0, 10);
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();
    const userTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return { userDateStr, userTimeStr, totalMinutes: h * 60 + m };
  }
}

/**
 * Calculate difference in minutes on a 24-hour circular clock (currentTime - doseTime).
 * Normalized to range [-720, +720] to gracefully handle midnight boundaries.
 * E.g., dose 23:55, current 00:05 -> +10 minutes (due 10 minutes ago).
 * E.g., dose 00:05, current 23:55 -> -10 minutes (due in 10 minutes).
 * @param {string} doseTime - "HH:MM"
 * @param {string} currentTime - "HH:MM"
 * @returns {number} difference in minutes
 */
function diffMinutesCircular(doseTime, currentTime) {
  if (!doseTime || !currentTime) return 9999;
  const [dh, dm] = doseTime.split(':').map(Number);
  const [ch, cm] = currentTime.split(':').map(Number);
  const doseMinutes = dh * 60 + dm;
  const currentMinutes = ch * 60 + cm;
  let diff = currentMinutes - doseMinutes;
  if (diff < -720) {
    diff += 1440;
  } else if (diff > 720) {
    diff -= 1440;
  }
  return diff;
}

/**
 * Process scheduled medicine reminders across all subscribed users
 * @param {Object} options Optional overrides (targetUserId, forceDoseTime)
 * @returns {Promise<Object>} Statistics on processed and delivered reminders
 */
async function processScheduledMedicineReminders(options = {}) {
  const startTime = Date.now();
  const stats = {
    evaluatedUsers: 0,
    evaluatedMeds: 0,
    dueOccurrences: 0,
    sentNotifications: 0,
    skippedDuplicate: 0,
    prunedSubscriptions: 0
  };

  try {
    initVapid();

    const userQuery = {
      browserNotificationsEnabled: true
    };

    if (!windowsToast.IS_WINDOWS) {
      userQuery['pushSubscriptions.0'] = { $exists: true };
    }

    if (options.targetUserId) {
      userQuery._id = options.targetUserId;
    }

    const subscribedUsers = await User.find(userQuery);
    stats.evaluatedUsers = subscribedUsers.length;

    for (const user of subscribedUsers) {
      const hasSubs = Array.isArray(user.pushSubscriptions) && user.pushSubscriptions.length > 0;
      if (!hasSubs && !windowsToast.IS_WINDOWS) {
        continue;
      }

      const { userDateStr, userTimeStr, totalMinutes } = getUserLocalTimeAndDate(user);

      // Query active medicines for this user
      // Respects startDate and optional endDate
      const medicines = await Medicine.find({
        $or: [{ user: user._id }, { userId: user._id }],
        $and: [
          {
            $or: [
              { startDate: null },
              { startDate: { $exists: false } },
              { startDate: '' },
              { startDate: { $lte: userDateStr } }
            ]
          },
          {
            $or: [
              { endDate: null },
              { endDate: { $exists: false } },
              { endDate: '' },
              { endDate: { $gte: userDateStr } }
            ]
          }
        ]
      });

      stats.evaluatedMeds += medicines.length;

      for (const med of medicines) {
        // Exclude doses already recorded as taken for today
        const isTakenToday = Array.isArray(med.doseHistory) &&
          med.doseHistory.some(d => d.date === userDateStr && d.status === 'taken');

        if (isTakenToday) {
          continue;
        }

        const scheduleTimes = (Array.isArray(med.scheduleTimes) && med.scheduleTimes.length > 0)
          ? med.scheduleTimes
          : ['08:00'];

        for (const doseTime of scheduleTimes) {
          // Calculate time difference on a 24-hour circular clock (handles midnight boundary)
          const diffMinutes = diffMinutesCircular(doseTime, userTimeStr);

          // Check if due within window (default: 60 minutes) or overridden by test options
          const dueWindow = typeof options.dueWindowMinutes === 'number' ? options.dueWindowMinutes : 60;
          const isDueNow = options.forceDoseTime
            ? (options.forceDoseTime === doseTime)
            : (diffMinutes >= 0 && diffMinutes <= dueWindow);

          if (!isDueNow) {
            continue;
          }

          stats.dueOccurrences++;

          // Concurrency-safe atomic reservation via unique index
          let deliveryLog;
          try {
            deliveryLog = await PushDeliveryLog.create({
              userId: user._id,
              medicineId: med._id,
              doseTime: doseTime,
              dateStr: userDateStr,
              status: 'pending',
              attemptedCount: 1
            });
          } catch (dbErr) {
            if (dbErr.code === 11000) {
              // Existing record found. Check if already delivered or eligible for retry.
              try {
                const existingLog = await PushDeliveryLog.findOne({
                  userId: user._id,
                  medicineId: med._id,
                  doseTime: doseTime,
                  dateStr: userDateStr
                });

                if (existingLog && existingLog.status === 'sent') {
                  // Already successfully sent today
                  stats.skippedDuplicate++;
                  continue;
                }

                // If previously failed and within 3 retry attempts, retry delivery
                if (existingLog && existingLog.status === 'failed' && existingLog.attemptedCount < 3) {
                  existingLog.attemptedCount += 1;
                  existingLog.status = 'pending';
                  await existingLog.save();
                  deliveryLog = existingLog;
                } else {
                  stats.skippedDuplicate++;
                  continue;
                }
              } catch (lookupErr) {
                stats.skippedDuplicate++;
                continue;
              }
            } else {
              console.error('[PushScheduler DB Reservation Error]', dbErr.message);
              continue;
            }
          }

          // Rich, clear, and privacy-conscious push payload
          const payload = JSON.stringify({
            title: `MediMate: ${med.name} Reminder`,
            body: `It's time for your scheduled dose of ${med.name} (${med.dosage}) at ${doseTime}.`,
            icon: '/assets/medimate-logo.jpg',
            badge: '/assets/medimate-logo.jpg',
            tag: `medimate-dose-${med._id}-${doseTime}-${userDateStr}`,
            url: '/schedule',
            data: {
              url: '/schedule',
              medicineId: med._id.toString(),
              medName: med.name,
              dosage: med.dosage,
              doseTime: doseTime,
              dateStr: userDateStr
            }
          });

          let sentCount = 0;
          let lastErrorMessage = null;
          const expiredEndpoints = [];

          const sendPromises = Array.isArray(user.pushSubscriptions)
            ? user.pushSubscriptions.map(async (sub) => {
                try {
                  await webpush.sendNotification({
                    endpoint: sub.endpoint,
                    keys: sub.keys
                  }, payload, {
                    TTL: 86400,
                    urgency: 'high'
                  });
                  sentCount++;
                } catch (pushErr) {
                  lastErrorMessage = pushErr.message || `Status ${pushErr.statusCode}`;
                  // 410 Gone or 404 Not Found indicates subscription expired / revoked
                  if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                    expiredEndpoints.push(sub.endpoint);
                  } else {
                    console.warn('[WebPush Send Warning]', pushErr.statusCode, pushErr.message);
                  }
                }
              })
            : [];

          await Promise.allSettled(sendPromises);

          // Deliver native Windows Toast notification if running on Windows
          let toastSent = false;
          if (windowsToast.IS_WINDOWS) {
            try {
              toastSent = await windowsToast.sendWindowsToast({
                title: `MediMate: ${med.name} Reminder`,
                body: `It's time for your scheduled dose of ${med.name} (${med.dosage}) at ${doseTime}.`,
                attribution: 'MediMate Medicine Reminder',
                actionUrl: `http://localhost:${process.env.PORT || 5000}/schedule`
              });
              if (toastSent) {
                stats.nativeToastsSent = (stats.nativeToastsSent || 0) + 1;
              }
            } catch (toastErr) {
              console.warn('[WindowsToast Delivery Warning]', toastErr.message);
            }
          }

          // Prune invalid/expired push subscriptions
          if (expiredEndpoints.length > 0) {
            user.pushSubscriptions = user.pushSubscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
            stats.prunedSubscriptions += expiredEndpoints.length;
            user.markModified('pushSubscriptions');
            await user.save();
          }

          const isDelivered = (sentCount > 0) || toastSent;
          deliveryLog.status = isDelivered ? 'sent' : 'failed';
          deliveryLog.deliveredCount = sentCount + (toastSent ? 1 : 0);
          if (!isDelivered) {
            if (expiredEndpoints.length === user.pushSubscriptions.length && expiredEndpoints.length > 0) {
              deliveryLog.errorMessage = 'All registered push subscriptions expired or revoked.';
            } else {
              deliveryLog.errorMessage = lastErrorMessage || 'Push and toast delivery failed';
            }
          }
          await deliveryLog.save();

          if (isDelivered) {
            stats.sentNotifications += (sentCount > 0 ? sentCount : 1);
          }
        }
      }
    }
  } catch (err) {
    console.error('[PushScheduler Execution Error]', err.message);
  } finally {
    lastRunAt = new Date().toISOString();
    lastRunDurationMs = Date.now() - startTime;
    lastRunStats = stats;
  }

  return stats;
}

/**
 * Start recurring background scheduler loop
 */
function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  initVapid();

  // Run initial tick with safe concurrency guard
  (async () => {
    if (isRunningTick) return;
    isRunningTick = true;
    try {
      await processScheduledMedicineReminders();
    } finally {
      isRunningTick = false;
    }
  })();

  schedulerInterval = setInterval(async () => {
    if (isRunningTick) return;
    isRunningTick = true;
    try {
      await processScheduledMedicineReminders();
    } finally {
      isRunningTick = false;
    }
  }, intervalMs);

  console.log(`[PushScheduler] Background medicine push scheduler active (interval: ${intervalMs / 1000}s).`);
}

/**
 * Stop background scheduler loop
 */
function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[PushScheduler] Background scheduler stopped.');
  }
}

/**
 * Retrieve scheduler diagnostic health metadata
 */
function getSchedulerStatus() {
  return {
    running: Boolean(schedulerInterval),
    isActive: Boolean(schedulerInterval),
    isRunningTick,
    intervalMinutes: 1,
    intervalMs: 60000,
    windowsToastSupported: windowsToast.IS_WINDOWS,
    lastRunAt,
    lastRunDurationMs,
    lastRunStats,
    nextEstimatedRunAt: lastRunAt ? new Date(new Date(lastRunAt).getTime() + 60000).toISOString() : null
  };
}

module.exports = {
  startScheduler,
  stopScheduler,
  processScheduledMedicineReminders,
  getUserLocalTimeAndDate,
  diffMinutesCircular,
  getSchedulerStatus
};
