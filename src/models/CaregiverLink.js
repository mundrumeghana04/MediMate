/**
 * ==============================================================================
 * MediMate - Caregiver Link Model
 * ==============================================================================
 * Represents secure, patient-consented relationships between patients and caregivers.
 * Supports:
 * 1. Cryptographically generated 15-minute pending invitation tokens (hashed with SHA-256).
 * 2. Atomic acceptance by verified caregiver accounts.
 * 3. Prevention of duplicate active relationships.
 * 4. Immediate, auditable revocation by either party.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const caregiverLinkSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Caregiver relationship must be linked to a patient account.'],
      index: true
    },
    caregiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'rejected', 'revoked'],
      default: 'pending',
      index: true
    },
    tokenHash: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Index on tokenHash for fast, secure invitation lookups (sparse so null burned tokens do not collide)
caregiverLinkSchema.index({ tokenHash: 1 }, { sparse: true });

// Compound index for patient link management
caregiverLinkSchema.index({ patientId: 1, status: 1 });

// Compound index for caregiver patient list lookups
caregiverLinkSchema.index({ caregiverId: 1, status: 1 });

// Unique partial index preventing duplicate active relationships between the same patient and caregiver
caregiverLinkSchema.index(
  { patientId: 1, caregiverId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'active',
      caregiverId: { $type: 'objectId' }
    }
  }
);

module.exports = mongoose.model('CaregiverLink', caregiverLinkSchema);
