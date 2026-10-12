/**
 * ==============================================================================
 * MediMate - Notification & Reminder Routes (/api/notifications)
 * ==============================================================================
 * Manages Web Push subscriptions, VAPID key distribution, today's calculated
 * reminders, and secure test notifications.
 * All routes are strictly authenticated and scoped to req.user._id.
 * Test notifications never create or fabricate medicine or patient records.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const { requireAuth } = require('../middleware/auth');
const notificationScheduler = require('../services/notificationScheduler');
const windowsToast = require('../services/windowsToast');

// Configure web-push with VAPID credentials if provided
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@medimate.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.warn('[WebPush] Error initializing VAPID credentials:', err.message);
  }
}

/**
 * ------------------------------------------------------------------------------
 * POST /api/notifications/scheduler/run
 * GET  /api/notifications/scheduler/run
 * ------------------------------------------------------------------------------
 * External cron / webhook trigger for ephemeral or sleep-prone hosting (e.g. Render).
 * Can be triggered with header 'x-cron-secret' or 'x-cron-key', query ?cronSecret=...,
 * or via standard user JWT authentication.
 */

async function cronOrAuthMiddleware(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

  const providedKey =
    req.headers['x-cron-secret'] ||
    req.headers['x-cron-key'] ||
    bearerToken;

  if (providedKey) {
    if (!cronSecret) {
      return res.status(503).json({
        error: 'Scheduler authentication is not configured.'
      });
    }

       if (providedKey === cronSecret) {
      req.isCronRequest = true;
      return next();
    }

    // Don't let an incorrect cron credential fall through to user auth.
    if (
      req.headers['x-cron-secret'] ||
      req.headers['x-cron-key'] ||
      bearerToken
    ) {
      return res.status(401).json({
        error: 'Invalid scheduler credentials.'
      });
    }
  }

  return requireAuth(req, res, next);
}


router.all('/scheduler/run', cronOrAuthMiddleware, async (req, res) => {
  try {
    const isCronRequest = req.isCronRequest === true;

    // Ordinary signed-in users may run the scheduler only for themselves.
    const targetUserId = isCronRequest
      ? ((req.body && req.body.userId) ||
         req.query.userId ||
         undefined)
      : String(req.user._id);

    // Timing overrides are reserved for trusted cron requests.
    const forceDoseTime = isCronRequest
      ? ((req.body && req.body.forceDoseTime) ||
         req.query.forceDoseTime ||
         null)
      : null;

    const rawWindow = isCronRequest
      ? ((req.body && req.body.dueWindowMinutes) ??
         req.query.dueWindowMinutes)
      : undefined;

    const dueWindowMinutes =
      rawWindow !== undefined && rawWindow !== null && rawWindow !== ''
        ? Number(rawWindow)
        : undefined;

    if (
      dueWindowMinutes !== undefined &&
      (!Number.isFinite(dueWindowMinutes) ||
        dueWindowMinutes < 0 ||
        dueWindowMinutes > 1440)
    ) {
      return res.status(400).json({
        error: 'dueWindowMinutes must be between 0 and 1440.'
      });
    }

    const stats =
      await notificationScheduler.processScheduledMedicineReminders({
        targetUserId,
        forceDoseTime,
        dueWindowMinutes
      });

    return res.status(200).json({
      success: true,
      message: 'Background medicine scheduler pass completed successfully.',
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error) {
    console.error('[Scheduler Trigger Error]', error.message);
    return res.status(500).json({
      error: 'Failed to execute scheduled reminders pass.'
    });
  }
});


/**
 * ------------------------------------------------------------------------------
 * POST /api/notifications/test-push
 * ------------------------------------------------------------------------------
 * Closed-tab administrative & verification test push.
 * Sends a genuine Web Push payload via web-push directly to target user device(s).
 * Accessible with CRON_SECRET (headers x-cron-secret or Bearer) or user session.
 */
router.post('/test-push', cronOrAuthMiddleware, async (req, res) => {
  try {
    
const isCronRequest = req.isCronRequest === true;

let user;

if (isCronRequest) {
  // Trusted cron requests may explicitly target an account.
  const targetUserId = (req.body && req.body.userId) || req.query.userId;
  const targetEmail = (req.body && req.body.email) || req.query.email;

  if (targetUserId) {
    user = await User.findById(targetUserId);
  } else if (targetEmail) {
    user = await User.findOne({
      email: targetEmail.toLowerCase().trim()
    });
  }
} else if (req.user) {
  // A normal signed-in user can test notifications only for themselves.
  user = await User.findById(req.user._id);
}


    if (!user) {
      return res.status(404).json({ error: 'Target user account not found.' });
    }

    const testPayload = JSON.stringify({
      title: 'MediMate Test Reminder',
      body: 'Your notification system is working properly! Reminders will arrive right on schedule even when closed.',
      icon: '/assets/medimate-logo.jpg',
      badge: '/assets/medimate-logo.jpg',
      tag: 'medimate-test-' + Date.now(),
      url: '/schedule',
      data: {
        url: '/schedule',
        type: 'test-push',
        timestamp: Date.now()
      }
    });

    const pushOptions = {
      TTL: 300,
      urgency: 'high'
    };

    let sentCount = 0;
    let pushAttempted = false;
    const errors = [];
    const expiredEndpoints = [];

    const subs = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];

    if (subs.length > 0 && process.env.VAPID_PUBLIC_KEY) {
      pushAttempted = true;
      const sendPromises = subs.map(async (sub) => {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: sub.keys
          }, testPayload, pushOptions);
          sentCount++;
        } catch (pushErr) {
          errors.push({
            endpointPreview: sub.endpoint.slice(0, 40) + '...',
            statusCode: pushErr.statusCode,
            message: pushErr.message
          });
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      });

      await Promise.allSettled(sendPromises);

      if (expiredEndpoints.length > 0) {
        user.pushSubscriptions = user.pushSubscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        user.markModified('pushSubscriptions');
        await user.save();
      }
    }

    // Deliver native Windows Toast notification if running on Windows
    let windowsToastSent = false;
    if (windowsToast.IS_WINDOWS) {
      try {
        windowsToastSent = await windowsToast.sendWindowsToast({
          title: 'MediMate Test Reminder',
          body: 'Your notification system is working properly! Reminders will arrive right on schedule even when closed.',
          attribution: 'MediMate Local Companion',
          actionUrl: `http://localhost:${process.env.PORT || 5000}/schedule`
        });
      } catch (tErr) {
        console.warn('[WindowsToast Test Warning]', tErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: (sentCount > 0 || windowsToastSent)
        ? 'Real Web Push and native notification successfully delivered.'
        : (pushAttempted ? 'Push service rejected delivery.' : 'User has no registered push subscriptions.'),
      pushAttempted,
      sentCount,
      windowsToastSent,
      windowsToastSupported: windowsToast.IS_WINDOWS,
      totalSubscriptions: subs.length,
      prunedSubscriptions: expiredEndpoints.length,
      errors: errors.length > 0 ? errors : undefined,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        browserNotificationsEnabled: Boolean(user.browserNotificationsEnabled)
      }
    });
  } catch (error) {
    console.error('[Test Push Error]', error.message);
    return res.status(500).json({ error: 'Failed to execute test push: ' + error.message });
  }
});

// Require authentication for all standard user notification routes
router.use(requireAuth);

/**
 * ------------------------------------------------------------------------------
 * GET /api/notifications/diagnostics
 * ------------------------------------------------------------------------------
 * Comprehensive diagnostic health check for background notifications.
 * Reports server scheduler status, VAPID health, user subscriptions, and logs.
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const { userDateStr, userTimeStr } = notificationScheduler.getUserLocalTimeAndDate(user);

    // Active medicines for this user
    const medicines = await Medicine.find({
      $or: [{ user: req.user._id }, { userId: req.user._id }],
      $and: [
        {
          $or: [
            { endDate: null },
            { endDate: { $exists: false } },
            { endDate: '' },
            { endDate: { $gte: userDateStr } }
          ]
        }
      ]
    }).sort({ name: 1 });

    const medicinesSummary = medicines.map(m => ({
      id: m._id,
      name: m.name,
      dosage: m.dosage,
      scheduleTimes: m.scheduleTimes || ['08:00'],
      startDate: m.startDate || null,
      endDate: m.endDate || null,
      takenToday: Array.isArray(m.doseHistory) && m.doseHistory.some(d => d.date === userDateStr && d.status === 'taken')
    }));

    // Recent delivery logs from PushDeliveryLog
    const PushDeliveryLog = require('../models/PushDeliveryLog');
    const recentLogs = await PushDeliveryLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('medicineId doseTime dateStr status deliveredCount attemptedCount errorMessage createdAt');

    const subs = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      vapid: {
        configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
        subject: process.env.VAPID_SUBJECT || 'mailto:support@medimate.app',
        publicKeyLength: (process.env.VAPID_PUBLIC_KEY || '').length
      },
      scheduler: notificationScheduler.getSchedulerStatus(),
      user: {
        id: user._id,
        name: user.name,
        timezone: user.timezone || 'UTC',
        serverCalculatedLocalDate: userDateStr,
        serverCalculatedLocalTime: userTimeStr,
        browserNotificationsEnabled: Boolean(user.browserNotificationsEnabled),
        inAppRemindersEnabled: Boolean(user.inAppRemindersEnabled),
        totalPushSubscriptions: subs.length,
        subscriptions: subs.map(s => {
          let host = 'Unknown';
          try { host = new URL(s.endpoint).hostname; } catch (e) {}
          return {
            provider: host,
            endpointPreview: s.endpoint.slice(0, 45) + '...',
            subscribedAt: s.subscribedAt
          };
        })
      },
      medicines: {
        totalActive: medicines.length,
        items: medicinesSummary
      },
      recentLogs
    });
  } catch (err) {
    console.error('[Notification Diagnostics Error]', err.message);
    return res.status(500).json({ error: 'Failed to retrieve notification diagnostics.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/notifications/subscription-status
 * ------------------------------------------------------------------------------
 * Check browser push subscription status for authenticated user
 */
router.get('/subscription-status', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    const count = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions.length : 0;
    return res.status(200).json({
      browserNotificationsEnabled: Boolean(user.browserNotificationsEnabled),
      totalSubscriptions: count,
      isSubscribed: count > 0
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve subscription status.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/notifications/vapid-public-key
 * ------------------------------------------------------------------------------
 * Return the public VAPID key for browser push subscription
 */
router.get('/vapid-public-key', (req, res) => {
  return res.status(200).json({
    publicKey: process.env.VAPID_PUBLIC_KEY || null
  });
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/notifications/subscribe
 * ------------------------------------------------------------------------------
 * Store a browser PushManager subscription for the authenticated user
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Initialize array if needed
    if (!Array.isArray(user.pushSubscriptions)) {
      user.pushSubscriptions = [];
    }

    // Deduplicate existing endpoint
    const existingIndex = user.pushSubscriptions.findIndex(s => s.endpoint === endpoint);
    if (existingIndex >= 0) {
      user.pushSubscriptions[existingIndex] = { endpoint, keys, subscribedAt: new Date() };
    } else {
      user.pushSubscriptions.push({ endpoint, keys, subscribedAt: new Date() });
    }

    user.browserNotificationsEnabled = true;
    user.markModified('pushSubscriptions');
    await user.save();

    return res.status(201).json({
      message: 'Push subscription registered successfully.',
      totalSubscriptions: user.pushSubscriptions.length
    });
  } catch (error) {
    console.error('[Push Subscribe Error]', error.message);
    return res.status(500).json({ error: 'Failed to register push subscription.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/notifications/unsubscribe
 * ------------------------------------------------------------------------------
 * Remove a browser PushManager subscription
 */
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (Array.isArray(user.pushSubscriptions) && endpoint) {
      user.pushSubscriptions = user.pushSubscriptions.filter(s => s.endpoint !== endpoint);
      user.markModified('pushSubscriptions');
      await user.save();
    }

    return res.status(200).json({ message: 'Push subscription removed successfully.' });
  } catch (error) {
    console.error('[Push Unsubscribe Error]', error.message);
    return res.status(500).json({ error: 'Failed to remove push subscription.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/notifications/test
 * ------------------------------------------------------------------------------
 * Sends an immediate safe test notification without touching medical history
 */
router.post('/test', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const testPayload = JSON.stringify({
      title: 'MediMate Test Reminder',
      body: 'Your notification system is working properly! Reminders will arrive right on schedule.',
      icon: '/assets/medimate-logo.jpg',
      badge: '/assets/medimate-logo.jpg',
      tag: 'medimate-test-' + Date.now(),
      url: '/schedule',
      data: {
        url: '/schedule',
        type: 'test-push',
        timestamp: Date.now()
      }
    });

    const pushOptions = {
      TTL: 300,
      urgency: 'high'
    };

    let sentCount = 0;
    let pushAttempted = false;
    const expiredEndpoints = [];

    if (Array.isArray(user.pushSubscriptions) && user.pushSubscriptions.length > 0 && process.env.VAPID_PUBLIC_KEY) {
      pushAttempted = true;
      const sendPromises = user.pushSubscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: sub.keys
          }, testPayload, pushOptions);
          sentCount++;
        } catch (pushErr) {
          console.warn('[WebPush Test Send Warning]', pushErr.statusCode, pushErr.message);
          // If 410 Gone or 404, subscription expired
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      });

      await Promise.allSettled(sendPromises);

      if (expiredEndpoints.length > 0) {
        user.pushSubscriptions = user.pushSubscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        user.markModified('pushSubscriptions');
        await user.save();
      }
    }

    return res.status(200).json({
      message: 'Test notification processed successfully.',
      pushAttempted,
      sentCount,
      title: 'MediMate Test Reminder',
      body: 'Your notification system is working properly! Reminders will arrive right on schedule.'
    });
  } catch (error) {
    console.error('[Notification Test Error]', error.message);
    return res.status(500).json({ error: 'Failed to process test notification.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/notifications/today
 * ------------------------------------------------------------------------------
 * Fetch server-calculated today reminders for the authenticated user
 */
router.get('/today', async (req, res) => {
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Find active medicines that haven't ended before today
    const medicines = await Medicine.find({
      $or: [{ user: req.user._id }, { userId: req.user._id }],
      $and: [
        {
          $or: [
            { endDate: null },
            { endDate: { $exists: false } },
            { endDate: '' },
            { endDate: { $gte: todayStr } }
          ]
        }
      ]
    }).sort({ name: 1 });

    const reminders = [];

    medicines.forEach(med => {
      const times = (Array.isArray(med.scheduleTimes) && med.scheduleTimes.length > 0)
        ? med.scheduleTimes
        : ['08:00'];

      times.forEach(timeStr => {
        const occurrenceId = `${req.user._id}_${med._id}_${timeStr}_${todayStr}`;
        const isTaken = Array.isArray(med.doseHistory) &&
          med.doseHistory.some(d => d.date === todayStr && d.status === 'taken');

        const [h, m] = timeStr.split(':').map(Number);
        const doseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
        const diffMinutes = Math.round((doseDate.getTime() - now.getTime()) / 60000);

        let urgency = 'scheduled';
        if (isTaken) {
          urgency = 'taken';
        } else if (diffMinutes <= 60 && diffMinutes >= -180) {
          urgency = 'due-now';
        } else if (diffMinutes > 60 && diffMinutes <= 240) {
          urgency = 'upcoming';
        }

        reminders.push({
          occurrenceId,
          medId: med._id,
          medName: med.name,
          dosage: med.dosage,
          timeOfDay: med.timeOfDay,
          timeStr,
          diffMinutes,
          isTaken,
          urgency
        });
      });
    });

    reminders.sort((a, b) => a.timeStr.localeCompare(b.timeStr));

    return res.status(200).json({
      today: todayStr,
      total: reminders.length,
      pending: reminders.filter(r => !r.isTaken).length,
      reminders
    });
  } catch (error) {
    console.error('[Get Today Notifications Error]', error.message);
    return res.status(500).json({ error: 'Failed to calculate today reminders.' });
  }
});

module.exports = router;
