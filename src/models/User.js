/**
 * ==============================================================================
 * MediMate - User Data Model
 * ==============================================================================
 * Stores registered patient accounts.
 * Passwords are automatically hashed with bcryptjs before persisting.
 * Password hashes are stripped from any JSON serialization to protect privacy.
 * ==============================================================================
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide your full name.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long.'],
      maxlength: [60, 'Name cannot exceed 60 characters.']
    },
    email: {
      type: String,
      required: [true, 'Please provide a valid email address.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address format.']
    },
    password: {
      type: String,
      required: [true, 'Please provide a secure password.'],
      minlength: [6, 'Password must be at least 6 characters long.']
    },
    role: {
      type: String,
      enum: ['patient', 'caregiver'],
      default: 'patient'
    },
    profilePicture: {
      type: String, // Stored filename in uploads/profiles
      default: null
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [30, 'Phone number cannot exceed 30 characters.'],
      default: ''
    },
    emergencyContact: {
      type: String,
      trim: true,
      maxlength: [100, 'Emergency contact cannot exceed 100 characters.'],
      default: ''
    },
    themePreference: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    timezone: {
      type: String,
      default: 'UTC',
      trim: true
    },
    timezoneOffset: {
      type: Number,
      default: 0
    },
    inAppRemindersEnabled: {
      type: Boolean,
      default: true
    },
    browserNotificationsEnabled: {
      type: Boolean,
      default: false
    },
    pushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true }
        },
        subscribedAt: { type: Date, default: Date.now }
      }
    ]
  },
  {
    timestamps: true
  }
);

/**
 * Pre-save hook: Hash password with bcryptjs before saving
 */
userSchema.pre('save', async function () {
  // Only hash the password if it has been modified or is new
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare entered password against stored bcrypt hash
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Ensure password hash is NEVER returned in JSON representations
 */
userSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.__v;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
