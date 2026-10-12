/**
 * ==============================================================================
 * MediMate - Doctor Visits & Appointments Routes (/api/doctor-visits)
 * ==============================================================================
 * Provides user-scoped management for upcoming appointments and past visits.
 * All operations enforce strict patient ownership and input validation.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const DoctorVisit = require('../models/DoctorVisit');
const { requireAuth } = require('../middleware/auth');

// Protect all doctor visit routes with authentication
router.use(requireAuth);

/**
 * ------------------------------------------------------------------------------
 * GET /api/doctor-visits
 * ------------------------------------------------------------------------------
 * Retrieve all visits for the authenticated patient, sorted chronologically.
 */
router.get('/', async (req, res) => {
  try {
    const visits = await DoctorVisit.find({ user: req.user._id }).sort({
      appointmentDate: 1,
      appointmentTime: 1
    });

    return res.status(200).json({ visits });
  } catch (error) {
    console.error('[Get Visits Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve doctor visits.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/doctor-visits
 * ------------------------------------------------------------------------------
 * Schedule a new doctor appointment.
 */
router.post('/', async (req, res) => {
  try {
    const {
      doctorName,
      specialty,
      clinicOrHospital,
      appointmentDate,
      appointmentTime,
      reason,
      contactNumber,
      notes,
      status
    } = req.body;

    if (!doctorName || typeof doctorName !== 'string' || !doctorName.trim()) {
      return res.status(400).json({ error: "Please enter the doctor's name." });
    }

    if (!appointmentDate || typeof appointmentDate !== 'string' || !appointmentDate.trim()) {
      return res.status(400).json({ error: 'Please select an appointment date.' });
    }

    if (!appointmentTime || typeof appointmentTime !== 'string' || !appointmentTime.trim()) {
      return res.status(400).json({ error: 'Please select an appointment time.' });
    }

    const validStatuses = ['Upcoming', 'Completed', 'Cancelled'];
    const visitStatus = validStatuses.includes(status) ? status : 'Upcoming';

    const newVisit = new DoctorVisit({
      user: req.user._id,
      doctorName: doctorName.trim(),
      specialty: typeof specialty === 'string' ? specialty.trim() : '',
      clinicOrHospital: typeof clinicOrHospital === 'string' ? clinicOrHospital.trim() : '',
      appointmentDate: appointmentDate.trim(),
      appointmentTime: appointmentTime.trim(),
      reason: typeof reason === 'string' ? reason.trim() : '',
      contactNumber: typeof contactNumber === 'string' ? contactNumber.trim() : '',
      notes: typeof notes === 'string' ? notes.trim() : '',
      status: visitStatus
    });

    await newVisit.save();

    return res.status(201).json({
      message: 'Doctor appointment scheduled successfully.',
      visit: newVisit
    });
  } catch (error) {
    console.error('[Create Visit Error]', error.message);
    return res.status(500).json({ error: 'Failed to schedule doctor visit.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/doctor-visits/:id
 * ------------------------------------------------------------------------------
 * Get details of a single doctor visit.
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid visit identifier.' });
    }

    const visit = await DoctorVisit.findOne({ _id: id, user: req.user._id });
    if (!visit) {
      return res.status(404).json({ error: 'Doctor visit not found or access denied.' });
    }

    return res.status(200).json({ visit });
  } catch (error) {
    console.error('[Get Visit Detail Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve visit details.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * PUT /api/doctor-visits/:id
 * ------------------------------------------------------------------------------
 * Update an existing doctor appointment, enforcing user ownership.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid visit identifier.' });
    }

    const {
      doctorName,
      specialty,
      clinicOrHospital,
      appointmentDate,
      appointmentTime,
      reason,
      contactNumber,
      notes,
      status
    } = req.body;

    if (!doctorName || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ error: "Doctor name, appointment date, and time are required." });
    }

    const visit = await DoctorVisit.findOne({ _id: id, user: req.user._id });
    if (!visit) {
      return res.status(404).json({ error: 'Doctor visit not found or access denied.' });
    }

    visit.doctorName = doctorName.trim();
    visit.appointmentDate = appointmentDate.trim();
    visit.appointmentTime = appointmentTime.trim();

    if (typeof specialty === 'string') visit.specialty = specialty.trim();
    if (typeof clinicOrHospital === 'string') visit.clinicOrHospital = clinicOrHospital.trim();
    if (typeof reason === 'string') visit.reason = reason.trim();
    if (typeof contactNumber === 'string') visit.contactNumber = contactNumber.trim();
    if (typeof notes === 'string') visit.notes = notes.trim();

    const validStatuses = ['Upcoming', 'Completed', 'Cancelled'];
    if (validStatuses.includes(status)) {
      visit.status = status;
    }

    await visit.save();

    return res.status(200).json({
      message: 'Doctor appointment updated successfully.',
      visit
    });
  } catch (error) {
    console.error('[Update Visit Error]', error.message);
    return res.status(500).json({ error: 'Failed to update doctor visit.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * PATCH /api/doctor-visits/:id/status
 * ------------------------------------------------------------------------------
 * Quick status update (e.g. mark as Completed or Cancelled).
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid visit identifier.' });
    }

    const validStatuses = ['Upcoming', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid appointment status.' });
    }

    const visit = await DoctorVisit.findOne({ _id: id, user: req.user._id });
    if (!visit) {
      return res.status(404).json({ error: 'Doctor visit not found or access denied.' });
    }

    visit.status = status;
    await visit.save();

    return res.status(200).json({
      message: `Appointment status updated to ${status}.`,
      visit
    });
  } catch (error) {
    console.error('[Patch Visit Status Error]', error.message);
    return res.status(500).json({ error: 'Failed to update appointment status.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * DELETE /api/doctor-visits/:id
 * ------------------------------------------------------------------------------
 * Remove a doctor visit from the patient's schedule.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid visit identifier.' });
    }

    const deleted = await DoctorVisit.findOneAndDelete({ _id: id, user: req.user._id });
    if (!deleted) {
      return res.status(404).json({ error: 'Doctor visit not found or access denied.' });
    }

    return res.status(200).json({ message: 'Doctor visit removed successfully.' });
  } catch (error) {
    console.error('[Delete Visit Error]', error.message);
    return res.status(500).json({ error: 'Failed to delete doctor visit.' });
  }
});

module.exports = router;
