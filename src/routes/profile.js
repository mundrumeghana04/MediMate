/**
 * ==============================================================================
 * MediMate - Patient Profile Routes (/api/profile)
 * ==============================================================================
 * Manages user profile information and secure profile picture uploads.
 * All operations are strictly authenticated and scoped to `req.user._id`.
 * Profile pictures are stored privately on disk and streamed through an
 * authorized endpoint, preventing unauthorized access.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// Require authentication for all profile endpoints
router.use(requireAuth);

// Ensure private upload directory for profile avatars exists
const PROFILES_DIR = path.join(__dirname, '../../uploads/profiles');
if (!fs.existsSync(PROFILES_DIR)) {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

// ------------------------------------------------------------------------------
// Multer Configuration for Profile Picture Uploads
// ------------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PROFILES_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.user._id}-${uniqueSuffix}${safeExt}`);
  }
});

// File validation: Only JPG/JPEG, PNG, WebP allowed; max 3 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(mime)) {
    return cb(new Error('Unsupported file type. Only JPG, PNG, and WebP images are allowed.'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024 // 3 MB limit
  },
  fileFilter
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/profile
 * ------------------------------------------------------------------------------
 * Fetch current authenticated user profile
 */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'patient',
        phone: user.phone || '',
        emergencyContact: user.emergencyContact || '',
        profilePicture: user.profilePicture ? '/api/profile/picture' : null,
        themePreference: user.themePreference || 'system',
        timezone: user.timezone || 'UTC',
        timezoneOffset: user.timezoneOffset || 0,
        pushSubscriptionsCount: (user.pushSubscriptions || []).length,
        hasPushSubscription: (user.pushSubscriptions || []).length > 0,
        inAppRemindersEnabled: user.inAppRemindersEnabled !== undefined ? user.inAppRemindersEnabled : true,
        browserNotificationsEnabled: user.browserNotificationsEnabled !== undefined ? user.browserNotificationsEnabled : false,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[Get Profile Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve your profile details.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * PUT /api/profile
 * ------------------------------------------------------------------------------
 * Update editable profile details (name, phone, emergency contact, theme, notifications, timezone)
 */
router.put('/', async (req, res) => {
  try {
    const { name, phone, emergencyContact, themePreference, inAppRemindersEnabled, browserNotificationsEnabled, timezone, timezoneOffset } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Name validation
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters long.' });
      }
      if (name.trim().length > 60) {
        return res.status(400).json({ error: 'Name cannot exceed 60 characters.' });
      }
      user.name = name.trim();
    }

    // Optional phone validation
    if (phone !== undefined) {
      user.phone = typeof phone === 'string' ? phone.trim().slice(0, 30) : '';
    }

    // Optional emergency contact validation
    if (emergencyContact !== undefined) {
      user.emergencyContact = typeof emergencyContact === 'string' ? emergencyContact.trim().slice(0, 100) : '';
    }

    // Optional theme preference
    if (themePreference !== undefined) {
      if (['light', 'dark', 'system'].includes(themePreference)) {
        user.themePreference = themePreference;
      }
    }

    // Optional notification preferences
    if (inAppRemindersEnabled !== undefined) {
      user.inAppRemindersEnabled = Boolean(inAppRemindersEnabled);
    }
    if (browserNotificationsEnabled !== undefined) {
      user.browserNotificationsEnabled = Boolean(browserNotificationsEnabled);
    }

    // Optional timezone synchronization
    if (timezone !== undefined && typeof timezone === 'string' && timezone.trim().length > 0) {
      user.timezone = timezone.trim().slice(0, 60);
    }
    if (timezoneOffset !== undefined && typeof timezoneOffset === 'number') {
      user.timezoneOffset = timezoneOffset;
    }

    await user.save();

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        emergencyContact: user.emergencyContact || '',
        profilePicture: user.profilePicture ? '/api/profile/picture' : null,
        themePreference: user.themePreference || 'system',
        timezone: user.timezone || 'UTC',
        timezoneOffset: user.timezoneOffset || 0,
        pushSubscriptionsCount: (user.pushSubscriptions || []).length,
        hasPushSubscription: (user.pushSubscriptions || []).length > 0,
        inAppRemindersEnabled: user.inAppRemindersEnabled !== undefined ? user.inAppRemindersEnabled : true,
        browserNotificationsEnabled: user.browserNotificationsEnabled !== undefined ? user.browserNotificationsEnabled : false,
        role: user.role || 'patient',
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('[Update Profile Error]', error.message);
    return res.status(500).json({ error: 'Failed to update your profile.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/profile/picture
 * ------------------------------------------------------------------------------
 * Upload and update the user's profile picture
 */
router.post('/picture', (req, res) => {
  upload.fields([
    { name: 'picture', maxCount: 1 },
    { name: 'avatar', maxCount: 1 }
  ])(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image exceeds the 3 MB size limit. Please choose a smaller photo.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    const uploadedFile = (req.files && req.files.picture && req.files.picture[0]) ||
                         (req.files && req.files.avatar && req.files.avatar[0]);

    if (!uploadedFile) {
      return res.status(400).json({ error: 'Please select an image file (JPG, PNG, or WebP).' });
    }

    req.file = uploadedFile;

    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        // Delete uploaded file if user not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'User account not found.' });
      }

      // If user already had a previous picture, delete old file to avoid orphan disk accumulation
      if (user.profilePicture) {
        const oldFilePath = path.join(PROFILES_DIR, path.basename(user.profilePicture));
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (delErr) {
            console.warn('[Old Avatar Cleanup Warning]', delErr.message);
          }
        }
      }

      user.profilePicture = req.file.filename;
      await user.save();

      return res.status(200).json({
        message: 'Profile photo updated successfully.',
        profilePicture: '/api/profile/picture',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          profilePicture: '/api/profile/picture'
        }
      });
    } catch (dbErr) {
      console.error('[Avatar Save Error]', dbErr.message);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to save your profile photo.' });
    }
  });
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/profile/picture
 * ------------------------------------------------------------------------------
 * Stream the authenticated user's private profile picture
 */
router.get('/picture', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.profilePicture) {
      return res.status(404).json({ error: 'No profile picture set.' });
    }

    const filePath = path.join(PROFILES_DIR, path.basename(user.profilePicture));
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Profile image file not found.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const readStream = fs.createReadStream(filePath);
    return readStream.pipe(res);
  } catch (error) {
    console.error('[Stream Picture Error]', error.message);
    return res.status(500).json({ error: 'Failed to load profile photo.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * DELETE /api/profile/picture
 * ------------------------------------------------------------------------------
 * Remove the profile picture and restore default initials avatar
 */
router.delete('/picture', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (user.profilePicture) {
      const filePath = path.join(PROFILES_DIR, path.basename(user.profilePicture));
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (delErr) {
          console.warn('[Avatar Delete Warning]', delErr.message);
        }
      }
      user.profilePicture = null;
      await user.save();
    }

    return res.status(200).json({
      message: 'Profile photo removed. Restored default avatar.',
      profilePicture: null
    });
  } catch (error) {
    console.error('[Delete Picture Error]', error.message);
    return res.status(500).json({ error: 'Failed to remove profile photo.' });
  }
});

module.exports = router;
