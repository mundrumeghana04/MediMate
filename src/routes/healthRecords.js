/**
 * ==============================================================================
 * MediMate - Health Records Routes (/api/health-records)
 * ==============================================================================
 * Provides user-scoped CRUD endpoints for personal clinical notes and vitals.
 * All operations require valid authentication and verify record ownership.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const HealthRecord = require('../models/HealthRecord');
const { requireAuth } = require('../middleware/auth');

// Protect all health-record routes with authentication
router.use(requireAuth);

/**
 * ------------------------------------------------------------------------------
 * GET /api/health-records
 * ------------------------------------------------------------------------------
 * Retrieve all records belonging to the authenticated user, newest first.
 */
router.get('/', async (req, res) => {
  try {
    const records = await HealthRecord.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
    return res.status(200).json({ records });
  } catch (error) {
    console.error('[Get Health Records Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve your health records.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/health-records
 * ------------------------------------------------------------------------------
 * Create a new health record entry scoped to the authenticated user.
 */
router.post('/', async (req, res) => {
  try {
    const { title, date, category, notes } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Please enter a record title.' });
    }

    if (!date || typeof date !== 'string' || !date.trim()) {
      return res.status(400).json({ error: 'Please select a date for this record.' });
    }

    if (!notes || typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ error: 'Please provide notes or details for this record.' });
    }

    const validCategories = ['Doctor Visit', 'Vitals & BP', 'Lab Results', 'General Notes', 'Allergy', 'Other'];
    const selectedCategory = validCategories.includes(category) ? category : 'General Notes';

    const newRecord = new HealthRecord({
      user: req.user._id, // Scoped to authenticated user
      title: title.trim(),
      date: date.trim(),
      category: selectedCategory,
      notes: notes.trim()
    });

    await newRecord.save();

    return res.status(201).json({
      message: 'Health record saved successfully.',
      record: newRecord
    });
  } catch (error) {
    console.error('[Create Health Record Error]', error.message);
    return res.status(500).json({ error: 'Failed to save health record.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * PUT /api/health-records/:id
 * ------------------------------------------------------------------------------
 * Update an existing health record, enforcing strict user ownership.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid record identifier.' });
    }

    const { title, date, category, notes } = req.body;

    if (!title || !date || !notes) {
      return res.status(400).json({ error: 'Title, date, and notes are required fields.' });
    }

    // Scoped query: ensures user can only edit their OWN record
    const record = await HealthRecord.findOne({ _id: id, user: req.user._id });
    if (!record) {
      return res.status(404).json({ error: 'Health record not found or access denied.' });
    }

    record.title = title.trim();
    record.date = date.trim();

    const validCategories = ['Doctor Visit', 'Vitals & BP', 'Lab Results', 'General Notes', 'Allergy', 'Other'];
    if (validCategories.includes(category)) {
      record.category = category;
    }

    record.notes = notes.trim();

    await record.save();

    return res.status(200).json({
      message: 'Health record updated successfully.',
      record
    });
  } catch (error) {
    console.error('[Update Health Record Error]', error.message);
    return res.status(500).json({ error: 'Failed to update health record.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * DELETE /api/health-records/:id
 * ------------------------------------------------------------------------------
 * Delete a health record, enforcing strict user ownership.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid record identifier.' });
    }

    // Scoped query: ensures user can only delete their OWN record
    const deleted = await HealthRecord.findOneAndDelete({ _id: id, user: req.user._id });
    if (!deleted) {
      return res.status(404).json({ error: 'Health record not found or access denied.' });
    }

    return res.status(200).json({ message: 'Health record removed successfully.' });
  } catch (error) {
    console.error('[Delete Health Record Error]', error.message);
    return res.status(500).json({ error: 'Failed to delete health record.' });
  }
});

module.exports = router;
