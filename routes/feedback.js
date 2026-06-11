const express = require('express');
const router = express.Router();
const {
  getAllFeedback, getFeedbackById, submitFeedback,
  updateFeedbackStatus, deleteFeedback
} = require('../controllers/feedbackController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get('/', verifyToken, verifyPermission('feedback.view'), getAllFeedback);
router.get('/:id', verifyToken, verifyPermission('feedback.view'), getFeedbackById);
router.post('/', verifyToken, submitFeedback);
router.patch('/:id/status', verifyToken, verifyPermission('feedback.update'), updateFeedbackStatus);
router.delete('/:id', verifyToken, verifyPermission('feedback.delete'), deleteFeedback);

module.exports = router;