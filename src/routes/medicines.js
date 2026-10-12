/**
 * ==============================================================================
 * MediMate - Medicine & Schedule Routes (/api/medicines)
 * ==============================================================================
 * Provides user-scoped CRUD endpoints and real dose adherence tracking.
 * All operations require valid authentication and verify record ownership.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Medicine = require('../models/Medicine');
const { requireAuth, requireRole } = require('../middleware/auth');

// Protect all medicine routes with authentication
router.use(requireAuth);

/**
 * ------------------------------------------------------------------------------
 * GET /api/medicines
 * ------------------------------------------------------------------------------
 * Fetch all medicines belonging to the authenticated user.
 */
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find({ user: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({ medicines });
  } catch (error) {
    console.error('[Get Medicines Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve your medicines.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/medicines
 * ------------------------------------------------------------------------------
 * Create a new medicine entry scoped to the authenticated user.
 */
router.post('/', requireRole('patient'), async (req, res) => {
  try {
    const { name, dosage, timeOfDay, time, scheduleTimes, notes, confirmDuplicate, startDate, endDate } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Please enter a medicine name.' });
    }

    if (!dosage || typeof dosage !== 'string' || !dosage.trim()) {
      return res.status(400).json({ error: 'Please enter the dosage or strength (e.g., 5mg, 500mg).' });
    }

    const trimmedName = name.trim();

    // Validate optional start and end dates
    let cleanStartDate = null;
    let cleanEndDate = null;

    if (startDate && typeof startDate === 'string' && startDate.trim()) {
      const s = startDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return res.status(400).json({ error: 'Start date must be in YYYY-MM-DD format.' });
      }
      cleanStartDate = s;
    }

    if (endDate && typeof endDate === 'string' && endDate.trim()) {
      const e = endDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) {
        return res.status(400).json({ error: 'End date must be in YYYY-MM-DD format.' });
      }
      if (cleanStartDate && e < cleanStartDate) {
        return res.status(400).json({ error: 'End date cannot be earlier than the start date.' });
      }
      cleanEndDate = e;
    }

    // Check for duplicate medicine under this authenticated user unless explicitly confirmed
    if (confirmDuplicate !== true) {
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existing = await Medicine.findOne({
        user: req.user._id,
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
      });

      if (existing) {
        return res.status(409).json({
          isDuplicate: true,
          message: 'This medicine is already in your list.',
          existingMedicine: {
            _id: existing._id,
            name: existing.name,
            dosage: existing.dosage,
            timeOfDay: existing.timeOfDay,
            scheduleTimes: existing.scheduleTimes,
            endDate: existing.endDate
          }
        });
      }
    }

    // Prepare schedule times array
    let timesArray = ['08:00'];
    if (Array.isArray(scheduleTimes) && scheduleTimes.length > 0) {
      timesArray = scheduleTimes.filter(t => typeof t === 'string' && t.trim());
    } else if (time && typeof time === 'string') {
      timesArray = [time.trim()];
    }

    const validTimesOfDay = ['Morning', 'Afternoon', 'Evening', 'Night', 'Custom'];
    const selectedTimeOfDay = validTimesOfDay.includes(timeOfDay) ? timeOfDay : 'Morning';

    const newMedicine = new Medicine({
      user: req.user._id, // Scoped to authenticated user
      name: trimmedName,
      dosage: dosage.trim(),
      timeOfDay: selectedTimeOfDay,
      scheduleTimes: timesArray,
      notes: typeof notes === 'string' ? notes.trim() : '',
      startDate: cleanStartDate,
      endDate: cleanEndDate
    });

    await newMedicine.save();

    return res.status(201).json({
      message: 'Medicine added successfully.',
      medicine: newMedicine
    });
  } catch (error) {
    console.error('[Create Medicine Error]', error.message);
    return res.status(500).json({ error: 'Failed to save medicine.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * PUT /api/medicines/:id
 * ------------------------------------------------------------------------------
 * Update an existing medicine, enforcing strict user ownership.
 */
router.put('/:id', requireRole('patient'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine identifier.' });
    }

    const { name, dosage, timeOfDay, time, scheduleTimes, notes, startDate, endDate } = req.body;

    if (!name || !dosage) {
      return res.status(400).json({ error: 'Medicine name and dosage are required.' });
    }

    // Scoped query: ensures user can only edit their OWN record
    const medicine = await Medicine.findOne({ _id: id, user: req.user._id });
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine record not found or access denied.' });
    }

    // Validate optional dates
    let cleanStartDate = medicine.startDate || null;
    let cleanEndDate = medicine.endDate || null;

    if (startDate !== undefined) {
      if (startDate && typeof startDate === 'string' && startDate.trim()) {
        const s = startDate.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          return res.status(400).json({ error: 'Start date must be in YYYY-MM-DD format.' });
        }
        cleanStartDate = s;
      } else {
        cleanStartDate = null;
      }
    }

    if (endDate !== undefined) {
      if (endDate && typeof endDate === 'string' && endDate.trim()) {
        const e = endDate.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e)) {
          return res.status(400).json({ error: 'End date must be in YYYY-MM-DD format.' });
        }
        if (cleanStartDate && e < cleanStartDate) {
          return res.status(400).json({ error: 'End date cannot be earlier than the start date.' });
        }
        cleanEndDate = e;
      } else {
        cleanEndDate = null;
      }
    }

    medicine.name = name.trim();
    medicine.dosage = dosage.trim();
    medicine.startDate = cleanStartDate;
    medicine.endDate = cleanEndDate;

    const validTimesOfDay = ['Morning', 'Afternoon', 'Evening', 'Night', 'Custom'];
    if (validTimesOfDay.includes(timeOfDay)) {
      medicine.timeOfDay = timeOfDay;
    }

    if (Array.isArray(scheduleTimes) && scheduleTimes.length > 0) {
      medicine.scheduleTimes = scheduleTimes.filter(t => typeof t === 'string' && t.trim());
    } else if (time && typeof time === 'string') {
      medicine.scheduleTimes = [time.trim()];
    }

    if (typeof notes === 'string') {
      medicine.notes = notes.trim();
    }

    await medicine.save();

    return res.status(200).json({
      message: 'Medicine updated successfully.',
      medicine
    });
  } catch (error) {
    console.error('[Update Medicine Error]', error.message);
    return res.status(500).json({ error: 'Failed to update medicine.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * DELETE /api/medicines/:id
 * ------------------------------------------------------------------------------
 * Delete a medicine, enforcing strict user ownership.
 */
router.delete('/:id', requireRole('patient'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine identifier.' });
    }

    // Scoped query: ensures user can only delete their OWN record
    const deleted = await Medicine.findOneAndDelete({ _id: id, user: req.user._id });
    if (!deleted) {
      return res.status(404).json({ error: 'Medicine record not found or access denied.' });
    }

    return res.status(200).json({ message: 'Medicine removed successfully.' });
  } catch (error) {
    console.error('[Delete Medicine Error]', error.message);
    return res.status(500).json({ error: 'Failed to delete medicine.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/medicines/:id/dose
 * ------------------------------------------------------------------------------
 * Real dose tracking: mark a dose as taken or undo checkoff.
 */
router.post('/:id/dose', requireRole('patient'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, date } = req.body; // action: 'take' | 'undo'

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid medicine identifier.' });
    }

    const medicine = await Medicine.findOne({ _id: id, user: req.user._id });
    if (!medicine) {
      return res.status(404).json({ error: 'Medicine record not found or access denied.' });
    }

    const todayDate = date || new Date().toISOString().split('T')[0];

    if (action === 'undo') {
      // Remove dose event for today
      medicine.doseHistory = medicine.doseHistory.filter(d => d.date !== todayDate);
    } else {
      // Action is 'take' - check if already recorded
      const existing = medicine.doseHistory.find(d => d.date === todayDate);
      if (!existing) {
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const takenTimeFormatted = `${hours}:${minutes} ${ampm}`;

        medicine.doseHistory.push({
          date: todayDate,
          status: 'taken',
          takenAt: takenTimeFormatted,
          timestamp: new Date()
        });
      }
    }

    await medicine.save();

    return res.status(200).json({
      message: action === 'undo' ? 'Dose marked as due.' : 'Dose marked as taken.',
      medicine
    });
  } catch (error) {
    console.error('[Dose Tracking Error]', error.message);
    return res.status(500).json({ error: 'Failed to record dose status.' });
  }
});

module.exports = router;
