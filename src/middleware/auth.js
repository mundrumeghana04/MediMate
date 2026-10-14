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

  // 3. Verify JWT token signature and expiration (Token errors return 401)
  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (tokenErr) {
    if (tokenErr.name === 'TokenExpiredError') {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication credentials.' });
  }

  // 4. Database user lookup and authoritative role resolution
  // Database lookup failures MUST return 500, never be converted to 401 invalid-token errors
  try {
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      // Clear invalid cookie if account no longer exists in database
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({
        error: 'Your session has expired. Please sign in again.'
      });
    }

    const validRoles = ['patient', 'caregiver'];
    const rawDbRole = user.role ? String(user.role).trim().toLowerCase() : null;

    // Requirement 1: Database role is authoritative whenever it is present and valid
    if (rawDbRole && validRoles.includes(rawDbRole)) {
      user.role = rawDbRole;
    } else {
      // Requirement: If database role is missing or invalid, resolve it only when the
      // existing CaregiverLink schema provides clear, unambiguous evidence.
      // Active status is required. Revoked, inactive, conflicting, or insufficient
      // evidence strictly fails closed as 'unverified'.
      const [hasActiveCaregiver, hasAnyCaregiver, hasActivePatient, hasAnyPatient] = await Promise.all([
        CaregiverLink.exists({ caregiverId: user._id, status: 'active' }),
        CaregiverLink.exists({ caregiverId: user._id }),
        CaregiverLink.exists({ patientId: user._id, status: 'active' }),
        CaregiverLink.exists({ patientId: user._id })
      ]);

      if (hasActiveCaregiver && !hasAnyPatient) {
        // Unambiguously an active caregiver with zero conflicting patient links
        user.role = 'caregiver';
      } else if (hasActivePatient && !hasAnyCaregiver) {
        // Unambiguously an active patient with zero conflicting caregiver links
        user.role = 'patient';
      } else {
        // Conflicting, revoked/inactive, or insufficient evidence -> fail closed
        user.role = 'unverified';
      }
    }

    req.tokenRole = decoded.role ? String(decoded.role).trim().toLowerCase() : null;
    req.user = user;
    next();
  } catch (dbErr) {
    console.error('[Auth Database Error]', dbErr.message);
    return res.status(500).json({ error: 'Database service error during authentication.' });
  }
}

/**
 * Require specific user role(s).
 * Strictly fails closed if the user role is unverified or missing.
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  const normalizedAllowed = allowedRoles.map(r => String(r).trim().toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const currentRole = req.user.role ? String(req.user.role).trim().toLowerCase() : null;
    if (!currentRole || currentRole === 'unverified') {
      return res.status(403).json({
        error: 'Access denied. Account role is undefined or unverified.'
      });
    }
    if (!normalizedAllowed.includes(currentRole)) {
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
