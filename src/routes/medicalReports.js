
/**
 * MediMate - Secure Medical Reports API
 * Cloudinary authenticated storage with ownership-checked access.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const MedicalReport = require('../models/MedicalReport');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const VALID_CATEGORIES = [
  'Lab Report',
  'Prescription',
  'Scan / X-Ray',
  'Discharge Summary',
  'Other'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      return cb(
        new Error('Only PDF, JPG, JPEG, and PNG documents are allowed.')
      );
    }

    cb(null, true);
  }
});

function uploadToCloudinary(buffer, publicId, format) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        type: 'authenticated',
        public_id: publicId,
        format,
        overwrite: false,
        unique_filename: false,
        use_filename: false
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function destroyCloudinaryAsset(publicId) {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true
  });
}

// GET /api/medical-reports
router.get('/', async (req, res) => {
  try {
    const reports = await MedicalReport.find({
      user: req.user._id
    }).sort({ reportDate: -1, createdAt: -1 });

    return res.status(200).json({ reports });
  } catch (error) {
    console.error('[Get Reports Error]', error.message);
    return res.status(500).json({
      error: 'Failed to retrieve your medical documents.'
    });
  }
});

// POST /api/medical-reports
router.post('/', (req, res) => {
  upload.single('document')(req, res, async (uploadError) => {
    if (uploadError) {
      const isSizeError = uploadError instanceof multer.MulterError &&
        uploadError.code === 'LIMIT_FILE_SIZE';

      return res.status(400).json({
        error: isSizeError
          ? 'File size exceeds the 10 MB limit.'
          : uploadError.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Please select a PDF, JPG, or PNG document.'
      });
    }

    let uploadedPublicId;

    try {
      const { title, category, reportDate, notes } = req.body;

      if (
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > 120
      ) {
        return res.status(400).json({
          error: 'Please provide a document title of up to 120 characters.'
        });
      }

      if (typeof notes === 'string' && notes.length > 1000) {
        return res.status(400).json({
          error: 'Notes cannot exceed 1000 characters.'
        });
      }

      if (
        reportDate &&
        !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)
      ) {
        return res.status(400).json({
          error: 'Please provide a valid report date in YYYY-MM-DD format.'
        });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      const publicId =
        `medimate/${req.user._id}/${crypto.randomUUID()}`;

      const result = await uploadToCloudinary(
        req.file.buffer,
        publicId,
        ext.slice(1)
      );

      uploadedPublicId = result.public_id;

      const safeOriginalFilename = path
        .basename(req.file.originalname)
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      const report = new MedicalReport({
        user: req.user._id,
        title: title.trim(),
        category: VALID_CATEGORIES.includes(category)
          ? category
          : 'Lab Report',
        reportDate: reportDate || new Date().toISOString().slice(0, 10),
        notes: typeof notes === 'string' ? notes.trim() : '',
        originalFilename: safeOriginalFilename,
        filename: result.public_id,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageProvider: 'cloudinary',
        storagePath: result.public_id
      });

      await report.save();

      return res.status(201).json({
        message: 'Medical report uploaded successfully.',
        report
      });
    } catch (error) {
      console.error('[Save Report Error]', error.message);

      if (uploadedPublicId) {
        try {
          await destroyCloudinaryAsset(uploadedPublicId);
        } catch (cleanupError) {
          console.error(
            '[Cloudinary Cleanup Error]',
            cleanupError.message
          );
        }
      }

      return res.status(500).json({
        error: 'Failed to securely store the medical document.'
      });
    }
  });
});

// GET /api/medical-reports/:id/file
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid document identifier.'
      });
    }

    const report = await MedicalReport.findOne({
      _id: id,
      user: req.user._id
    });

    if (!report) {
      return res.status(404).json({
        error: 'Document not found or access denied.'
      });
    }

    if (report.storageProvider !== 'cloudinary') {
      return res.status(404).json({
        error: 'This document is not available in cloud storage.'
      });
    }

    // Generate a short-lived authenticated download URL only after
    // verifying that the requesting user owns this report.
    const ext = path.extname(report.originalFilename).slice(1).toLowerCase();
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;

    const downloadUrl = cloudinary.utils.private_download_url(
      report.storagePath,
      ext,
      {
        resource_type: 'image',
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: true
      }
    );

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('[Download Report Error]', error.message);
    return res.status(500).json({
      error: 'Failed to access document.'
    });
  }
});

// PUT /api/medical-reports/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid document identifier.'
      });
    }

    const { title, category, reportDate, notes } = req.body;

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.trim().length > 120
    ) {
      return res.status(400).json({
        error: 'Document title is required and must be at most 120 characters.'
      });
    }

    if (typeof notes === 'string' && notes.length > 1000) {
      return res.status(400).json({
        error: 'Notes cannot exceed 1000 characters.'
      });
    }

    if (
      reportDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)
    ) {
      return res.status(400).json({
        error: 'Please provide a valid report date in YYYY-MM-DD format.'
      });
    }

    const report = await MedicalReport.findOne({
      _id: id,
      user: req.user._id
    });

    if (!report) {
      return res.status(404).json({
        error: 'Document not found or access denied.'
      });
    }

    report.title = title.trim();

    if (VALID_CATEGORIES.includes(category)) {
      report.category = category;
    }

    if (reportDate) report.reportDate = reportDate;
    if (typeof notes === 'string') report.notes = notes.trim();

    await report.save();

    return res.status(200).json({
      message: 'Medical report updated successfully.',
      report
    });
  } catch (error) {
    console.error('[Update Report Error]', error.message);
    return res.status(500).json({
      error: 'Failed to update document metadata.'
    });
  }
});

// DELETE /api/medical-reports/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: 'Invalid document identifier.'
      });
    }

    const report = await MedicalReport.findOne({
      _id: id,
      user: req.user._id
    });

    if (!report) {
      return res.status(404).json({
        error: 'Document not found or access denied.'
      });
    }

    if (report.storageProvider === 'cloudinary') {
      const result = await destroyCloudinaryAsset(report.storagePath);

      if (result.result !== 'ok' && result.result !== 'not found') {
        return res.status(502).json({
          error: 'Could not remove the document from secure storage.'
        });
      }
    } else {
      return res.status(409).json({
        error: 'This report uses local storage and requires migration.'
      });
    }

    await MedicalReport.deleteOne({
      _id: report._id,
      user: req.user._id
    });

    return res.status(200).json({
      message: 'Medical document removed successfully.'
    });
  } catch (error) {
    console.error('[Delete Report Error]', error.message);
    return res.status(500).json({
      error: 'Failed to delete medical document.'
    });
  }
});

module.exports = router;
