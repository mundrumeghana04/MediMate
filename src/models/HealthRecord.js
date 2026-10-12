/**
 * ==============================================================================
 * MediMate - Health Record Data Model
 * ==============================================================================
 * Stores user-specific clinical notes, doctor visits, vitals, and lab summaries.
 * Strictly scoped to the authenticated user via the `user` reference.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const healthRecordSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Health record must belong to a registered user.'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Please provide a title for the health record.'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters.']
    },
    date: {
      type: String, // YYYY-MM-DD format for high accessibility and timezone stability
      required: [true, 'Please provide a date for this record.']
    },
    category: {
      type: String,
      enum: ['Doctor Visit', 'Vitals & BP', 'Lab Results', 'General Notes', 'Allergy', 'Other'],
      default: 'General Notes'
    },
    notes: {
      type: String,
      required: [true, 'Please provide details or notes for this record.'],
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters.']
    }
  },
  {
    timestamps: true
  }
);

// Index to optimize user-specific chronological lookups
healthRecordSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('HealthRecord', healthRecordSchema);
