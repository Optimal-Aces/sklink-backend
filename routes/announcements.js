const express = require('express');
const router = express.Router();
const {
  getActiveAnnouncements,
  getAllAnnouncements
} = require('../controllers/announcementController');
const { verifyToken } = require('../middleware/auth');

// Public-ish — member app uses this
router.get('/active', verifyToken, getActiveAnnouncements);

// Admin — all announcements with expiry status
router.get('/', verifyToken, getAllAnnouncements);

module.exports = router;