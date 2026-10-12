/**
 * ==============================================================================
 * MediMate - Rate Limiting Middleware
 * ==============================================================================
 * Protects authentication endpoints from credential-stuffing and brute-force attacks.
 * ==============================================================================
 */

const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 30 : 1000, // Limit each IP
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    error: 'Too many sign-in attempts from this connection. Please try again in 15 minutes.'
  }
});

const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 30 : 1000, // Limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many caregiver invitation attempts from this connection. Please try again later.'
  }
});

module.exports = { authLimiter, inviteLimiter };
