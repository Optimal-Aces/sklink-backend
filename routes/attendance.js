const express = require('express');
const router = express.Router();
const { scanAttendance } = require('../controllers/attendanceController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.post('/scan', verifyToken, verifyPermission('attendance.scan'), scanAttendance);
router.get('/event/:eventId/logs', verifyToken, getAttendanceLogs);

module.exports = router;