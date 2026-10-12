/**
 * ==============================================================================
 * MediMate - Push Delivery Log Model
 * ==============================================================================
 * Concurrency-safe registry of scheduled medicine push notifications.
 * The compound unique index on { userId, medicineId, doseTime, dateStr }
 * guarantees that each dose occurrence is never sent more than once per day,
 * even across clustered environments or rapid scheduler intervals.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const pushDeliveryLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
      index: true
    },
    doseTime: {
      type: String, // HH:mm in user's local timezone (e.g., "08:00")
      required: true
    },
    dateStr: {
      type: String, // YYYY-MM-DD in user's local timezone (e.g., "2026-10-11")
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending'
    },
    attemptedCount: {
      type: Number,
      default: 0
    },
    deliveredCount: {
      type: Number,
      default: 0
    },
    errorMessage: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index ensuring concurrency-safe deduplication per dose occurrence
pushDeliveryLogSchema.index(
  { userId: 1, medicineId: 1, doseTime: 1, dateStr: 1 },
  { unique: true }
);

module.exports = mongoose.model('PushDeliveryLog', pushDeliveryLogSchema);
