const express = require('express');
const router = express.Router();

const {
  getAllUpdateRequests,
  getUpdateRequestById,
  reviewUpdateRequest,
} = require('../controllers/memberUpdateRequestController');

const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get(
  '/',
  verifyToken,
  verifyPermission('members.verify'),
  getAllUpdateRequests
);

router.get(
  '/:id',
  verifyToken,
  verifyPermission('members.verify'),
  getUpdateRequestById
);

router.patch(
  '/:id/review',
  verifyToken,
  verifyPermission('members.verify'),
  reviewUpdateRequest
);

module.exports = router;
