# MediMate: Background Push Notifications Troubleshooting Guide

This guide explains how **MediMate** delivers background medicine reminders when your browser is closed, what conditions can prevent them from popping up on your device, and how to resolve them on Windows, macOS, Android, and iOS.

---

## 1. How Medicine Reminders Work in MediMate

MediMate uses a 3-tier notification system:
1. **In-App Reminders:** Visual banner and audio chime displayed while you have the MediMate website actively open in your browser.
2. **Desktop / Browser Notifications:** Browser alerts that appear on your screen while your browser is open (even if the MediMate tab is minimized or in the background).
3. **Genuine Background Web Push:** Operating-system-level alerts delivered via the standardized **Web Push API** and service worker (`/sw.js`). These can be delivered by the operating system push service (such as Google FCM, Apple APNs, or Mozilla Push) **even when the MediMate website tab is completely closed**.

---

## 2. Server-Side Execution on Render Free Tier

If your MediMate instance is deployed on Render's free tier:
- Free web instances automatically spin down (sleep) after **15 minutes of inactivity** to conserve resources.
- When the instance sleeps, internal Node.js timers (`setInterval`) stop running, meaning reminders cannot be generated while asleep.

### How to ensure reminders trigger 24/7 on Render:
1. **GitHub Actions Workflow (Included):**
   - MediMate includes `.github/workflows/medimate-scheduler.yml`, which pings `POST /api/notifications/scheduler/run` every 10 minutes.
   - Configure secrets in your GitHub repository:
     - `MEDIMATE_APP_URL`: Your live Render URL (e.g., `https://medimate.onrender.com`)
     - `MEDIMATE_CRON_SECRET`: Your `CRON_SECRET` defined in `.env` or Render environment settings.
2. **Free External Cron Service (e.g., cron-job.org or UptimeRobot):**
   - Create a free recurring job every 5–10 minutes targeting:  
     `POST https://your-app.onrender.com/api/notifications/scheduler/run`
   - Add the HTTP header:  
     `Authorization: Bearer <your-CRON_SECRET>` or `x-cron-secret: <your-CRON_SECRET>`

---

## 3. Device & Operating System Conditions

Even when the server sends a push notification, your device's operating system may silence or suppress it. Check the settings below for your device:

### Windows (10 & 11)
1. **Focus Assist / Do Not Disturb:**
   - Open **Settings** > **System** > **Focus** (or **Focus assist**).
   - If "Do Not Disturb" or "Priority only" is turned on, notifications are silenced or sent straight to the Notification Center without a popup banner.
   - Turn off Focus Assist or add your browser (Google Chrome, Microsoft Edge, Firefox) to your **Priority list**.
2. **Windows Notification Permissions for Browser:**
   - Open **Settings** > **System** > **Notifications**.
   - Ensure **Notifications** is switched **On**.
   - Scroll down to "Notifications from apps and other senders" and verify that your browser (e.g. Google Chrome, Brave, Edge) is toggled **On**.
3. **Background Apps Permission:**
   - In Chrome/Edge: Open browser **Settings** > **System** > toggle on **"Continue running background apps when Google Chrome is closed"**.

### macOS (Ventura, Sonoma, Sequoia)
1. **Focus Modes & Do Not Disturb:**
   - Open the **Control Center** (top-right menu bar) and check if **Do Not Disturb** or a Focus profile (Work, Sleep) is active.
   - Go to **System Settings** > **Focus** to allow notifications from your web browser.
2. **macOS Notification Permissions:**
   - Open **System Settings** > **Notifications**.
   - Find your web browser (Chrome, Safari, Edge, Firefox) in the left sidebar.
   - Verify **Allow Notifications** is enabled and alerts are set to **Banners** or **Alerts**.

### Android (Phones & Tablets)
1. **Battery Optimization (App Sleeping):**
   - Open **Settings** > **Apps** > select your browser (Chrome).
   - Tap **Battery** > select **Unrestricted** (or disable "Put app to sleep").
2. **Chrome Background Data:**
   - Go to **Settings** > **Apps** > **Chrome** > **Mobile data & Wi-Fi**.
   - Ensure **Background data** and **Unrestricted data usage** are enabled.
3. **Site Notifications:**
   - In Chrome, tap the **3 dots** > **Settings** > **Site settings** > **Notifications** > verify MediMate is set to **Allowed**.

### iPhone & iPad (iOS 16.4+)
- Web Push on iOS requires installing the web app as a Progressive Web App (PWA):
  1. Open MediMate in **Safari**.
  2. Tap the **Share** button (box with upward arrow).
  3. Tap **"Add to Home Screen"**.
  4. Launch MediMate from your **Home Screen icon** (not regular Safari).
  5. Go to **My Profile** > **Notification Preferences** > tap **"Allow in Browser"** / **"Enable Push"**.

---

## 4. Built-In Diagnostics in MediMate

Patients and healthcare administrators can verify system health at any time:
1. Sign in to your MediMate portal.
2. Navigate to **My Profile** (`/profile`).
3. Under the **Notification & Reminder Preferences** section, click **🔍 Diagnostics**.
4. The diagnostic modal will inspect and report:
   - **Browser & Device:** Service worker registration state, PushManager support, device token preview.
   - **Server & Scheduler:** VAPID keys status, server local time calculation, last sweep timestamp and statistics.
   - **Prescriptions:** Medicines scheduled for today and completion status.
   - **Delivery Logs:** History of recent pushes, delivery counts, and any carrier errors.
5. You can also click **⚡ Run Scheduler Once** to trigger an immediate check.
