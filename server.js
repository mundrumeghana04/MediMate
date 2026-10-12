/**
 * ==============================================================================
 * MediMate - Core Server Entry Point
 * ==============================================================================
 * "Your personal healthcare companion."
 *
 * Full-Stack Node.js + Express backend integrated with MongoDB Atlas.
 * Serves frontend static assets, authenticates patients via secure HTTP-only
 * cookies, and exposes user-scoped REST API endpoints.
 * ==============================================================================
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { connectDB, isDBConnected } = require('./src/config/db');

// Import Route Handlers
const authRoutes = require('./src/routes/auth');
const medicineRoutes = require('./src/routes/medicines');
const healthRecordRoutes = require('./src/routes/healthRecords');
const medicalReportRoutes = require('./src/routes/medicalReports');
const doctorVisitRoutes = require('./src/routes/doctorVisits');
const profileRoutes = require('./src/routes/profile');
const notificationRoutes = require('./src/routes/notifications');
const caregiverRoutes = require('./src/routes/caregiver');
const notificationScheduler = require('./src/services/notificationScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Basic Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 2. Body Parsing & Cookie Middleware
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

// 3. Serve Static Frontend Web Files
app.use(express.static(path.join(__dirname, 'public')));

// 4. Mount REST API Routes
app.use('/api/auth', authRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/health-records', healthRecordRoutes);
app.use('/api/medical-reports', medicalReportRoutes);
app.use('/api/doctor-visits', doctorVisitRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/caregiver', caregiverRoutes);

/**
 * ------------------------------------------------------------------------------
 * Internal Developer Health Check Endpoint
 * ------------------------------------------------------------------------------
 * Purpose: Verifies backend server and MongoDB Atlas connectivity.
 * Note: Kept for automated testing and Render health checks; not shown on patient UI.
 * ------------------------------------------------------------------------------
 */
app.get('/api/health', (req, res) => {
  const dbStatus = isDBConnected() ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    service: 'MediMate Backend Service',
    version: '1.0.0',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// 5. 404 Handler for Unmatched API Endpoints
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `The requested endpoint '${req.originalUrl}' does not exist.`
  });
});

// 6. Dedicated Frontend Page Routes (Supports Direct Navigation & Page Refresh)
const FRONTEND_ROUTES = [
  '/', 
  '/dashboard', 
  '/schedule', 
  '/medicines', 
  '/health-records', 
  '/medical-reports', 
  '/doctor-visits', 
  '/profile', 
  '/caregiver',
  '/caregiver/dashboard',
  '/caregiver/patients',
  '/caregiver/schedule'
];
FRONTEND_ROUTES.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// Fallback for any other non-API navigation requests (HTML5 History routing)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// 7. Global Safe Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err.message);
  res.status(err.status || 500).json({
    error: 'An unexpected server error occurred. Please try again later.'
  });
});

/**
 * ------------------------------------------------------------------------------
 * Initialize Database Connection and Start Server
 * ------------------------------------------------------------------------------
 */
async function startServer() {
  try {
    // Connect to MongoDB Atlas
    await connectDB();
  } catch (dbErr) {
    console.error('[Warning] Server starting with database connection issue:', dbErr.message);
    console.error('Please verify your MONGODB_URI in .env or Atlas Network Access list.');
  }

  const server = app.listen(PORT, () => {
    console.log('====================================================');
    console.log(` MediMate Server is active!`);
    console.log(` Web App URL:   http://localhost:${PORT}`);
    console.log(` Database:      ${isDBConnected() ? 'Connected (Atlas)' : 'Connecting / Offline'}`);
    console.log('====================================================');
  });

  // Start background medicine push scheduler loop (every 60s)
  try {
    notificationScheduler.startScheduler(60000);
  } catch (schedErr) {
    console.warn('[PushScheduler Warning] Could not start background scheduler:', schedErr.message);
  }

  return server;
}

const serverInstance = startServer();

module.exports = { app, serverInstance };
