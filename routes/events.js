const express = require('express');
const router = express.Router();
const {
  getAllEvents, getEventById, createEvent,
  updateEvent, deleteEvent, publishEvent, getEventAttendance
} = require('../controllers/eventController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get('/', verifyToken, verifyPermission('events.view'), getAllEvents);
router.get('/:id', verifyToken, verifyPermission('events.view'), getEventById);
router.get('/:id/attendance', verifyToken, verifyPermission('events.view'), getEventAttendance);
router.post('/', verifyToken, verifyPermission('events.create'), createEvent);
router.put('/:id', verifyToken, verifyPermission('events.edit'), updateEvent);
router.delete('/:id', verifyToken, verifyPermission('events.delete'), deleteEvent);
router.patch('/:id/publish', verifyToken, verifyPermission('events.edit'), publishEvent);

module.exports = router;