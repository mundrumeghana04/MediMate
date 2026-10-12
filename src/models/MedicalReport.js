/**
 * ==============================================================================
 * MediMate - Medical Report Data Model
 * ==============================================================================
 * Stores metadata for patient-uploaded medical reports, laboratory results,
 * prescriptions, scan images, and clinical documents.
 * All files are stored privately and strictly scoped to the authenticated user.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must belong to a registered user.'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Please provide a title for this medical document.'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters.']
    },
    category: {
      type: String,
      enum: ['Lab Report', 'Prescription', 'Scan / X-Ray', 'Discharge Summary', 'Other'],
      default: 'Lab Report'
    },
    reportDate: {
      type: String, // YYYY-MM-DD
      default: () => new Date().toISOString().split('T')[0]
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters.'],
      default: ''
    },
    originalFilename: {
      type: String,
      required: true,
      trim: true
    },
    filename: {
      type: String,
      required: true,
      trim: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    storageProvider: {
      type: String,
      enum: ['local_private', 'cloudinary'],
      default: 'local_private'
    },
    storagePath: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

medicalReportSchema.index({ user: 1, reportDate: -1, createdAt: -1 });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
