/**
 * ==============================================================================
 * MediMate - Medical Reports & Document Routes (/api/medical-reports)
 * ==============================================================================
 * Secure private upload, download, metadata management, and deletion.
 * All files are stored privately outside public static directories and are
 * protected by strict ownership verification.
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');

const MedicalReport = require('../models/MedicalReport');
const { requireAuth } = require('../middleware/auth');

// Protect all medical report routes with authentication
router.use(requireAuth);

// Ensure private upload directory exists outside of public/
const UPLOADS_DIR = path.join(__dirname, '../../uploads/medical-reports');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ------------------------------------------------------------------------------
// Multer Storage Configuration
// ------------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate safe, collision-resistant unique filename
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `report-${uniqueSuffix}${safeExt}`);
  }
});

// File validation: Only PDF, JPG/JPEG, PNG allowed; max 10MB
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(mime)) {
    return cb(new Error('Unsupported file type. Only PDF, JPG, and PNG documents are allowed.'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB maximum
  },
  fileFilter
});

// ------------------------------------------------------------------------------
// GET /api/medical-reports
// ------------------------------------------------------------------------------
// List all medical reports belonging to the authenticated patient
router.get('/', async (req, res) => {
  try {
    const reports = await MedicalReport.find({ user: req.user._id }).sort({ reportDate: -1, createdAt: -1 });
    return res.status(200).json({ reports });
  } catch (error) {
    console.error('[Get Reports Error]', error.message);
    return res.status(500).json({ error: 'Failed to retrieve your medical documents.' });
  }
});

// ------------------------------------------------------------------------------
// POST /api/medical-reports
// ------------------------------------------------------------------------------
// Upload a new medical document with metadata
router.post('/', (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds the 10 MB limit. Please select a smaller file.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please select a document file to upload (PDF, JPG, or PNG).' });
    }

    try {
      const { title, category, reportDate, notes } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        // Clean up uploaded file if validation fails
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ error: 'Please provide a title for this medical document.' });
      }

      const validCategories = ['Lab Report', 'Prescription', 'Scan / X-Ray', 'Discharge Summary', 'Other'];
      const selectedCategory = validCategories.includes(category) ? category : 'Lab Report';

      // Sanitize original filename
      const safeOriginalFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');

      const newReport = new MedicalReport({
        user: req.user._id,
        title: title.trim(),
        category: selectedCategory,
        reportDate: reportDate ? reportDate.trim() : new Date().toISOString().split('T')[0],
        notes: typeof notes === 'string' ? notes.trim() : '',
        originalFilename: safeOriginalFilename,
        filename: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageProvider: 'local_private',
        storagePath: req.file.path
      });

      await newReport.save();

      return res.status(201).json({
        message: 'Medical report uploaded successfully.',
        report: newReport
      });
    } catch (dbErr) {
      console.error('[Save Report Error]', dbErr.message);
      // Clean up orphaned file on database error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to save medical report metadata.' });
    }
  });
});

// ------------------------------------------------------------------------------
// GET /api/medical-reports/:id/file
// ------------------------------------------------------------------------------
// Securely view or download document with authoritative ownership check
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid document identifier.' });
    }

    // Strictly enforce that document belongs to authenticated user
    const report = await MedicalReport.findOne({ _id: id, user: req.user._id });
    if (!report) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    const filePath = path.resolve(report.storagePath);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR))) {
      return res.status(403).json({ error: 'Access denied: invalid file path.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document file not found on private storage.' });
    }

    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(report.originalFilename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.sendFile(filePath);
  } catch (error) {
    console.error('[Download Report Error]', error.message);
    return res.status(500).json({ error: 'Failed to access document.' });
  }
});

// ------------------------------------------------------------------------------
// PUT /api/medical-reports/:id
// ------------------------------------------------------------------------------
// Update medical document metadata
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid document identifier.' });
    }

    const { title, category, reportDate, notes } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Document title is required.' });
    }

    const report = await MedicalReport.findOne({ _id: id, user: req.user._id });
    if (!report) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    report.title = title.trim();

    const validCategories = ['Lab Report', 'Prescription', 'Scan / X-Ray', 'Discharge Summary', 'Other'];
    if (validCategories.includes(category)) {
      report.category = category;
    }

    if (reportDate) report.reportDate = reportDate.trim();
    if (typeof notes === 'string') report.notes = notes.trim();

    await report.save();

    return res.status(200).json({
      message: 'Medical report updated successfully.',
      report
    });
  } catch (error) {
    console.error('[Update Report Error]', error.message);
    return res.status(500).json({ error: 'Failed to update document metadata.' });
  }
});

// ------------------------------------------------------------------------------
// DELETE /api/medical-reports/:id
// ------------------------------------------------------------------------------
// Permanently remove document and stored file from private storage
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid document identifier.' });
    }

    const report = await MedicalReport.findOne({ _id: id, user: req.user._id });
    if (!report) {
      return res.status(404).json({ error: 'Document not found or access denied.' });
    }

    // Delete stored private file if exists
    if (report.storagePath && fs.existsSync(report.storagePath)) {
      try {
        fs.unlinkSync(report.storagePath);
      } catch (fsErr) {
        console.warn('[Warning] Could not remove file from disk:', fsErr.message);
      }
    }

    // Delete database document
    await MedicalReport.deleteOne({ _id: id });

    return res.status(200).json({ message: 'Medical document removed successfully.' });
  } catch (error) {
    console.error('[Delete Report Error]', error.message);
    return res.status(500).json({ error: 'Failed to delete medical document.' });
  }
});

module.exports = router;
