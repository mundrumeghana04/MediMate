/**
 * ==============================================================================
 * MediMate - Caregiver Relationship & Invitation Routes (/api/caregiver)
 * ==============================================================================
 * Manages secure patient-caregiver relationships:
 * 1. POST /api/caregiver/invite       - Patient creates 15-minute cryptographically secure invitation.
 * 2. POST /api/caregiver/accept       - Caregiver accepts invitation atomically.
 * 3. GET  /api/caregiver/patients     - Caregiver lists active linked patients.
 * 4. GET  /api/caregiver/links        - Patient lists active caregivers & pending invites.
 * 5. POST /api/caregiver/links/:id/revoke - Patient/caregiver immediately revokes a relationship.
 * 6. POST /api/caregiver/links/:id/leave  - Caregiver voluntarily leaves a relationship.
 *
 * Security:
 * - Cryptographic SHA-256 token hashing (raw tokens are never stored in DB).
 * - Strict role authorization (patients create, caregivers accept).
 * - Atomic updates prevent concurrent double-acceptance.
 * - Read-only access for caregivers in Phase 1 (no medication edits/deletions).
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const Medicine = require('../models/Medicine');
const CaregiverLink = require('../models/CaregiverLink');
const { requireAuth, requireRole, verifyCaregiverPatientAccess } = require('../middleware/auth');
const { inviteLimiter } = require('../middleware/rateLimiter');

// Protect all caregiver endpoints with authentication
router.use(requireAuth);

/**
 * ------------------------------------------------------------------------------
 * POST /api/caregiver/invite
 * ------------------------------------------------------------------------------
 * Patient generates a secure, 15-minute invitation token for a caregiver.
 */
router.post('/invite', requireRole('patient'), inviteLimiter, async (req, res) => {
  try {
    // Generate 48-character cryptographically secure token (24 bytes hex)
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 15-minute expiration period
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const link = await CaregiverLink.create({
      patientId: req.user._id,
      status: 'pending',
      tokenHash,
      expiresAt
    });

    return res.status(201).json({
      message: 'Caregiver invitation code generated successfully.',
      inviteToken: rawToken,
      token: rawToken,
      expiresAt: link.expiresAt,
      expiresInMinutes: 15,
      linkId: link._id
    });
  } catch (error) {
    console.error('[Caregiver Invite Error]', error.message);
    return res.status(500).json({ error: 'Failed to generate caregiver invitation.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/caregiver/accept
 * ------------------------------------------------------------------------------
 * Authenticated caregiver accepts an invitation token atomically.
 */
router.post('/accept', requireRole('caregiver'), inviteLimiter, async (req, res) => {
  try {
    const rawInput = req.body.token || req.body.inviteToken;

    if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
      return res.status(400).json({ error: 'Please enter a valid invitation code.' });
    }

    const cleanToken = rawInput.trim();
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    // Look up pending invitation by token hash
    const pendingLink = await CaregiverLink.findOne({
      tokenHash,
      status: 'pending'
    });

    if (!pendingLink) {
      return res.status(400).json({ error: 'Invalid or already used invitation code.' });
    }

    // Check expiration
    if (!pendingLink.expiresAt || new Date() > pendingLink.expiresAt) {
      return res.status(400).json({ error: 'This invitation code has expired. Please ask the patient to generate a new one.' });
    }

    // Prevent patient from accepting their own invite as caregiver (self-link)
    if (pendingLink.patientId.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot link to your own account.' });
    }

    // Prevent duplicate active relationship
    const existingActive = await CaregiverLink.findOne({
      patientId: pendingLink.patientId,
      caregiverId: req.user._id,
      status: 'active'
    });

    if (existingActive) {
      return res.status(409).json({ error: 'You are already linked to this patient.' });
    }

    // Atomically accept the invitation and burn the token hash
    const activeLink = await CaregiverLink.findOneAndUpdate(
      {
        _id: pendingLink._id,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          status: 'active',
          caregiverId: req.user._id,
          acceptedAt: new Date(),
          tokenHash: null // Burn token immediately to prevent reuse
        }
      },
      { new: true }
    ).populate('patientId', 'name email phone');

    if (!activeLink) {
      return res.status(400).json({ error: 'Invitation could not be accepted. It may have expired or already been claimed.' });
    }

    return res.status(200).json({
      message: 'Patient linked successfully.',
      linkId: activeLink._id,
      link: {
        id: activeLink._id,
        _id: activeLink._id,
        linkId: activeLink._id,
        status: activeLink.status,
        acceptedAt: activeLink.acceptedAt,
        patient: {
          id: activeLink.patientId._id,
          name: activeLink.patientId.name,
          email: activeLink.patientId.email,
          phone: activeLink.patientId.phone || ''
        }
      }
    });
  } catch (error) {
    console.error('[Caregiver Accept Error]', error.message);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An active relationship with this patient already exists.' });
    }
    return res.status(500).json({ error: 'Failed to accept invitation.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/caregiver/patients
 * ------------------------------------------------------------------------------
 * Caregiver lists their active linked patients with minimal required information.
 */
router.get('/patients', requireRole('caregiver'), async (req, res) => {
  try {
    const links = await CaregiverLink.find({
      caregiverId: req.user._id,
      status: 'active'
    })
      .populate('patientId', 'name email phone createdAt')
      .sort({ acceptedAt: -1 });

    const patients = links
      .filter(l => l.patientId)
      .map(l => ({
        linkId: l._id,
        id: l.patientId._id,
        name: l.patientId.name,
        email: l.patientId.email,
        phone: l.patientId.phone || '',
        memberSince: l.patientId.createdAt,
        linkedSince: l.acceptedAt || l.createdAt,
        patient: {
          id: l.patientId._id,
          name: l.patientId.name,
          email: l.patientId.email,
          phone: l.patientId.phone || '',
          memberSince: l.patientId.createdAt
        },
        linkedAt: l.acceptedAt || l.createdAt
      }));

    return res.status(200).json({ patients });
  } catch (error) {
    console.error('[Caregiver Get Patients Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve linked patients.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/caregiver/links
 * ------------------------------------------------------------------------------
 * Patient views their connected caregivers and pending invitation codes.
 * Sensitive token hashes are never exposed.
 */
router.get('/links', requireRole('patient'), async (req, res) => {
  try {
    const links = await CaregiverLink.find({
      patientId: req.user._id
    })
      .populate('caregiverId', 'name email phone')
      .sort({ createdAt: -1 });

    const activeCaregivers = links
      .filter(l => l.status === 'active' && l.caregiverId)
      .map(l => ({
        linkId: l._id,
        _id: l._id,
        status: 'active',
        caregiver: {
          id: l.caregiverId._id,
          name: l.caregiverId.name,
          email: l.caregiverId.email,
          phone: l.caregiverId.phone || ''
        },
        caregiverId: {
          id: l.caregiverId._id,
          name: l.caregiverId.name,
          email: l.caregiverId.email,
          phone: l.caregiverId.phone || ''
        },
        acceptedAt: l.acceptedAt,
        linkedAt: l.acceptedAt || l.createdAt
      }));

    const now = new Date();
    const pendingInvitations = links
      .filter(l => l.status === 'pending' && l.expiresAt && l.expiresAt > now)
      .map(l => ({
        linkId: l._id,
        _id: l._id,
        status: 'pending',
        createdAt: l.createdAt,
        expiresAt: l.expiresAt
      }));

    const allLinks = links.map(l => ({
      _id: l._id,
      linkId: l._id,
      status: l.status,
      caregiverId: l.caregiverId ? {
        id: l.caregiverId._id,
        name: l.caregiverId.name,
        email: l.caregiverId.email
      } : null,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      acceptedAt: l.acceptedAt,
      revokedAt: l.revokedAt
    }));

    return res.status(200).json({
      activeCaregivers,
      pendingInvitations,
      links: allLinks
    });
  } catch (error) {
    console.error('[Caregiver Get Links Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve caregiver links.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/caregiver/links/:linkId/revoke
 * ------------------------------------------------------------------------------
 * Patient (or caregiver) immediately revokes an invitation or active relationship.
 */
router.post('/links/:linkId/revoke', async (req, res) => {
  try {
    const { linkId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ error: 'Invalid relationship identifier.' });
    }

    const link = await CaregiverLink.findById(linkId);
    if (!link) {
      return res.status(404).json({ error: 'Caregiver relationship not found.' });
    }

    // Must be either the patient or the linked caregiver
    const isPatient = link.patientId.toString() === req.user._id.toString();
    const isCaregiver = link.caregiverId && link.caregiverId.toString() === req.user._id.toString();

    if (!isPatient && !isCaregiver) {
      return res.status(403).json({ error: 'Access denied. You do not own this caregiver relationship.' });
    }

    if (link.status === 'revoked') {
      return res.status(400).json({ error: 'This caregiver link is already revoked.' });
    }

    link.status = 'revoked';
    link.revokedAt = new Date();
    link.revokedBy = req.user._id;
    link.tokenHash = null; // Purge token hash
    await link.save();

    return res.status(200).json({
      message: 'Caregiver relationship revoked successfully.',
      linkId: link._id,
      status: 'revoked',
      link: {
        id: link._id,
        _id: link._id,
        status: 'revoked'
      }
    });
  } catch (error) {
    console.error('[Caregiver Revoke Error]', error.message);
    return res.status(500).json({ error: 'Failed to revoke caregiver relationship.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * POST /api/caregiver/links/:linkId/leave
 * ------------------------------------------------------------------------------
 * Caregiver voluntarily disconnects from a patient relationship.
 */
router.post('/links/:linkId/leave', requireRole('caregiver'), async (req, res) => {
  try {
    const { linkId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res.status(400).json({ error: 'Invalid relationship identifier.' });
    }

    const link = await CaregiverLink.findOne({
      _id: linkId,
      caregiverId: req.user._id
    });

    if (!link) {
      return res.status(404).json({ error: 'Caregiver relationship not found or access denied.' });
    }

    if (link.status === 'revoked') {
      return res.status(400).json({ error: 'You are already disconnected from this patient.' });
    }

    link.status = 'revoked';
    link.revokedAt = new Date();
    link.revokedBy = req.user._id;
    link.tokenHash = null;
    await link.save();

    return res.status(200).json({
      message: 'Disconnected from patient successfully.',
      linkId: link._id,
      status: 'revoked',
      link: {
        id: link._id,
        _id: link._id,
        status: 'revoked'
      }
    });
  } catch (error) {
    console.error('[Caregiver Leave Error]', error.message);
    return res.status(500).json({ error: 'Failed to disconnect from patient.' });
  }
});

/**
 * ------------------------------------------------------------------------------
 * GET /api/caregiver/patients/:patientId/dashboard
 * ------------------------------------------------------------------------------
 * Caregiver retrieves authorized read-only medication schedule & adherence
 * overview for a linked patient.
 *
 * Security:
 * - Requires authentication and 'caregiver' role.
 * - Verifies active, patient-consented CaregiverLink for this specific patient.
 * - Strictly scopes medicine queries to verified patientId.
 * - Protects patient privacy: never returns password hashes, tokens, or private security fields.
 * - Enforces read-only access (no mutation operations).
 */
router.get(
  '/patients/:patientId/dashboard',
  requireRole('caregiver'),
  verifyCaregiverPatientAccess,
  async (req, res) => {
    try {
      const { patientId } = req.params;

      const patient = await User.findById(patientId).select('name email phone createdAt timezone timezoneOffset');
      if (!patient) {
        return res.status(404).json({ error: 'Patient account not found.' });
      }

      // Compute patient's current local date (YYYY-MM-DD) and time (HH:mm)
      let patientDateStr;
      let patientTimeStr;
      const tz = patient.timezone || 'UTC';
      try {
        const now = new Date();
        const formatterDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        patientDateStr = formatterDate.format(now);

        const formatterTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        patientTimeStr = formatterTime.format(now);
      } catch (err) {
        const now = new Date();
        patientDateStr = now.toISOString().slice(0, 10);
        const h = String(now.getUTCHours()).padStart(2, '0');
        const m = String(now.getUTCMinutes()).padStart(2, '0');
        patientTimeStr = `${h}:${m}`;
      }

      // Optional date query parameter (YYYY-MM-DD), default to patient's local date
      const targetDate = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date.trim()))
        ? req.query.date.trim()
        : patientDateStr;

      // Query medicines belonging to this patient ONLY
      const medicines = await Medicine.find({ user: patient._id }).sort({ createdAt: 1 });

      // Active medicines for targetDate
      const activeMeds = medicines.filter(m => {
        const afterStart = !m.startDate || m.startDate <= targetDate;
        const beforeEnd = !m.endDate || m.endDate >= targetDate;
        return afterStart && beforeEnd;
      });

      // Construct today's schedule items without duplicate doses
      // Each active medicine produces exactly one daily dose entry
      const schedule = activeMeds.map(med => {
        const todayDose = Array.isArray(med.doseHistory)
          ? med.doseHistory.find(d => d.date === targetDate && d.status === 'taken')
          : null;
        const isTaken = !!todayDose;
        const status = isTaken ? 'taken' : 'pending';
        const takenAt = todayDose ? (todayDose.takenAt || 'Taken') : null;
        const scheduleTimes = (Array.isArray(med.scheduleTimes) && med.scheduleTimes.length > 0)
          ? med.scheduleTimes
          : ['08:00'];
        const primaryTime = scheduleTimes[0] || '08:00';

        return {
          id: med._id,
          medicineId: med._id,
          name: med.name,
          dosage: med.dosage,
          timeOfDay: med.timeOfDay || 'Morning',
          time: primaryTime,
          scheduleTimes,
          notes: med.notes || '',
          startDate: med.startDate || null,
          endDate: med.endDate || null,
          status,
          takenAt
        };
      });

      // Sort schedule by primary scheduled time
      schedule.sort((a, b) => a.time.localeCompare(b.time));

      // Calculate adherence metrics
      const totalDoses = schedule.length;
      const takenDoses = schedule.filter(s => s.status === 'taken').length;
      const pendingDoses = totalDoses - takenDoses;
      const adherencePercentage = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;
      const allTaken = totalDoses > 0 && takenDoses === totalDoses;

      // Calculate next upcoming dose among pending doses
      let nextUpcomingDose = null;
      if (!allTaken && totalDoses > 0) {
        const pendingItems = schedule.filter(s => s.status === 'pending');
        // Find first pending item whose scheduled time is >= current time
        const futureItem = pendingItems.find(s => s.time >= patientTimeStr);
        const selectedNext = futureItem || pendingItems[0];
        if (selectedNext) {
          nextUpcomingDose = {
            medicineId: selectedNext.medicineId,
            name: selectedNext.name,
            dosage: selectedNext.dosage,
            time: selectedNext.time,
            timeOfDay: selectedNext.timeOfDay,
            notes: selectedNext.notes
          };
        }
      }

      return res.status(200).json({
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
          phone: patient.phone || '',
          linkedSince: req.caregiverLink.acceptedAt || req.caregiverLink.createdAt
        },
        date: targetDate,
        currentTime: patientTimeStr,
        totalMedicines: medicines.length,
        activeMedicinesCount: activeMeds.length,
        summary: {
          totalDoses,
          takenDoses,
          pendingDoses,
          adherencePercentage,
          hasSchedule: totalDoses > 0,
          allTaken
        },
        nextUpcomingDose,
        schedule
      });
    } catch (error) {
      console.error('[Caregiver Patient Dashboard Error]', error.message);
      return res.status(500).json({ error: 'Failed to retrieve patient dashboard.' });
    }
  }
);

module.exports = router;
