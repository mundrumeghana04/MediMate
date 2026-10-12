/**
 * ==============================================================================
 * MediMate - Authentication Middleware
 * ==============================================================================
 * Verifies JWT tokens delivered via secure HTTP-only cookie (primary)
 * or Authorization Bearer header (fallback).
 * Attaches the verified authenticated user to `req.user`.
 * ==============================================================================
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const CaregiverLink = require('../models/CaregiverLink');

const COOKIE_NAME = 'medimate_token';

/**
 * Require valid authenticated user
 */
async function requireAuth(req, res, next) {
  try {
    let token = null;

    // 1. Check HTTP-only cookie first (preferred browser security design)
    if (req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    }
    // 2. Fallback to Authorization: Bearer <token>
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in to access this feature.'
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[Auth Error] JWT_SECRET is not configured.');
      return res.status(500).json({ error: 'Server authentication configuration error.' });
    }

    // Verify token
    const decoded = jwt.verify(token, secret);

    // Verify user still exists in database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      // Clear invalid cookie
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({
        error: 'Your session has expired. Please sign in again.'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication credentials.' });
  }
}

/**
 * Require specific user role(s), defaulting legacy/unspecified accounts to 'patient'
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const currentRole = req.user.role || 'patient';
    if (!allowedRoles.includes(currentRole)) {
      return res.status(403).json({
        error: `Access denied. This action is restricted to ${allowedRoles.join(' or ')} accounts.`
      });
    }
    next();
  };
}

/**
 * Reusable relationship verification middleware:
 * Confirms an active, patient-consented link exists between req.user and target patientId.
 */
async function verifyCaregiverPatientAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const patientId = req.params.patientId || req.query.patientId || req.body.patientId;
    if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ error: 'Valid patient identifier is required.' });
    }

    const activeLink = await CaregiverLink.findOne({
      caregiverId: req.user._id,
      patientId: patientId,
      status: 'active'
    });

    if (!activeLink) {
      return res.status(403).json({
        error: 'Access denied. You do not have an active caregiver relationship with this patient.'
      });
    }

    req.caregiverLink = activeLink;
    next();
  } catch (err) {
    console.error('[Caregiver Access Verification Error]', err.message);
    return res.status(500).json({ error: 'Failed to verify relationship authorization.' });
  }
}

module.exports = {
  requireAuth,
  requireRole,
  verifyCaregiverPatientAccess,
  COOKIE_NAME
};
