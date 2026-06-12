const express = require('express');
const router = express.Router();

const { getMyPointsHistory } = require('../controllers/pointsController');
const { verifyToken } = require('../middleware/auth');

router.get('/me/history', verifyToken, getMyPointsHistory);

module.exports = router;
