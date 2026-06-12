const express = require('express');
const router = express.Router();
const { scanAttendance, getAttendanceLogs } = require('../controllers/attendanceController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.post('/scan', verifyToken, verifyPermission('attendance.scan'), scanAttendance);
router.get('/event/:eventId/logs', verifyToken, verifyPermission('attendance.view_logs'), getAttendanceLogs);

module.exports = router;