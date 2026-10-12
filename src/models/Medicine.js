/**
 * ==============================================================================
 * MediMate - Medicine Data Model
 * ==============================================================================
 * Stores user-specific medicine prescriptions, dosages, schedules, and dose events.
 * Strictly scoped to the authenticated user via the `user` reference.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const doseEventSchema = new mongoose.Schema(
  {
    date: {
      type: String, // YYYY-MM-DD
      required: true
    },
    status: {
      type: String,
      enum: ['taken', 'pending'],
      default: 'taken'
    },
    takenAt: {
      type: String // Formatted time e.g., "08:15 AM"
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const medicineSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Medicine must belong to a registered user.'],
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide the medicine name.'],
      trim: true,
      maxlength: [100, 'Medicine name cannot exceed 100 characters.']
    },
    dosage: {
      type: String,
      required: [true, 'Please specify the dosage (e.g., 5mg, 500mg, 1 tablet).'],
      trim: true,
      maxlength: [50, 'Dosage cannot exceed 50 characters.']
    },
    timeOfDay: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Evening', 'Night', 'Custom'],
      default: 'Morning'
    },
    scheduleTimes: {
      type: [String], // Array of times e.g., ["08:00", "20:00"]
      default: ['08:00']
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters.'],
      default: ''
    },
    startDate: {
      type: String, // YYYY-MM-DD
      default: null
    },
    endDate: {
      type: String, // YYYY-MM-DD
      default: null
    },
    doseHistory: [doseEventSchema]
  },
  {
    timestamps: true
  }
);

// Compound index to optimize user-scoped lookups
medicineSchema.index({ user: 1, name: 1 });

module.exports = mongoose.model('Medicine', medicineSchema);
