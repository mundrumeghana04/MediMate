/**
 * ==============================================================================
 * MediMate - Doctor Visit & Appointment Data Model
 * ==============================================================================
 * Stores user-managed upcoming appointments and past doctor visit history.
 * Strictly scoped to the authenticated user via the `user` reference.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const doctorVisitSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor visit must belong to a registered user.'],
      index: true
    },
    doctorName: {
      type: String,
      required: [true, "Please provide the doctor's name."],
      trim: true,
      maxlength: [100, "Doctor's name cannot exceed 100 characters."]
    },
    specialty: {
      type: String,
      trim: true,
      maxlength: [100, 'Specialty cannot exceed 100 characters.'],
      default: ''
    },
    clinicOrHospital: {
      type: String,
      trim: true,
      maxlength: [150, 'Clinic or hospital name cannot exceed 150 characters.'],
      default: ''
    },
    appointmentDate: {
      type: String, // YYYY-MM-DD format
      required: [true, 'Please provide the appointment date.']
    },
    appointmentTime: {
      type: String, // HH:MM (24-hour format)
      required: [true, 'Please provide the appointment time.']
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [300, 'Reason for visit cannot exceed 300 characters.'],
      default: ''
    },
    contactNumber: {
      type: String,
      trim: true,
      maxlength: [40, 'Contact number cannot exceed 40 characters.'],
      default: ''
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1500, 'Notes cannot exceed 1500 characters.'],
      default: ''
    },
    status: {
      type: String,
      enum: ['Upcoming', 'Completed', 'Cancelled'],
      default: 'Upcoming'
    }
  },
  {
    timestamps: true
  }
);

doctorVisitSchema.index({ user: 1, appointmentDate: 1, appointmentTime: 1 });

module.exports = mongoose.model('DoctorVisit', doctorVisitSchema);
