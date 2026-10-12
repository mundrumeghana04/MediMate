/**
 * ==============================================================================
 * MediMate - Authentication Routes (/api/auth)
 * ==============================================================================
 * Endpoints for registration, login, logout, and session verification.
 * Employs secure HTTP-only cookies, normalized emails, and bcrypt hashing.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

/**
 * Helper to generate JWT and set secure HTTP-only cookie
 */
function sendTokenCookie(res, user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured on the server.');
  }

  const token = jwt.sign(
    { id: user._id, email: user.email },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // Prevents client-side scripts from reading token (XSS protection)
    secure: isProduction, // HTTPS required in production
    sameSite: 'lax', // CSRF mitigation
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });

  return token;
}

/**
 * ------------------------------------------------------------------------------
 * POST /api/auth/register
 * ------------------------------------------------------------------------------
 * Register a new patient account.
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // 1. Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please provide your full name (minimum 2 characters).' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format (e.g., name@example.com).' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match. Please re-enter both passwords.' });
    }

    // 2. Validate optional role (defaults to patient)
    let userRole = 'patient';
    if (req.body.role !== undefined && req.body.role !== null && req.body.role !== '') {
      if (typeof req.body.role !== 'string' || !['patient', 'caregiver'].includes(req.body.role.toLowerCase().trim())) {
        return res.status(400).json({ error: 'Invalid account role. Allowed roles are patient or caregiver.' });
      }
      userRole = req.body.role.toLowerCase().trim();
    }

    // 3. Check for duplicate email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email address already exists. Please sign in instead.'
      });
    }

    // 4. Create new user
    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password, // Will be hashed by pre('save') hook
      role: userRole
    });

    await newUser.save();

    // 5. Issue authenticated session
    sendTokenCookie(res, newUser);

    return res.status(201).json({
      message: 'Account registered successfully.',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role || 'patient'
      }
    });
  } catch (error) {
    console.error('[Registration Error]', error.message);
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'An account with this email address already exists. Please sign in instead.'
      });
    }
    return res.status(500).json({ error: 'Registration failed due to a server error. Please try again.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/auth/login
 * ------------------------------------------------------------------------------
 * Authenticate existing patient.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both your email address and password.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Find user by normalized email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Generic error avoids revealing account existence
      return res.status(401).json({ error: 'Invalid email address or password.' });
    }

    // Check password hash
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email address or password.' });
    }

    // Issue authenticated session
    sendTokenCookie(res, user);

    return res.status(200).json({
      message: 'Signed in successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'patient'
      }
    });
  } catch (error) {
    console.error('[Login Error]', error.message);
    return res.status(500).json({ error: 'Sign in failed due to a server error. Please try again.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/auth/logout
 * ------------------------------------------------------------------------------
 * Clear session cookie and invalidate client state.
 */
const handleSignOutRequest = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  });

  return res.status(200).json({ message: 'Signed out successfully.' });
};

router.post('/logout', handleSignOutRequest);
router.post('/signout', handleSignOutRequest);

/**
 * ------------------------------------------------------------------------------
 * GET /api/auth/me
 * ------------------------------------------------------------------------------
 * Fetch current authenticated user profile to restore session.
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role || 'patient',
      phone: req.user.phone || '',
      emergencyContact: req.user.emergencyContact || '',
      profilePicture: req.user.profilePicture ? `/api/profile/picture` : null,
      themePreference: req.user.themePreference || 'system',
      createdAt: req.user.createdAt
    }
  });
});

module.exports = router;
