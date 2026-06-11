const express = require('express');
const router = express.Router();
const {
  getAllRewards, getRewardById, createReward,
  updateReward, deleteReward, redeemReward,
  getAllRedemptions, releaseRedemption
} = require('../controllers/rewardController');
const { verifyToken, verifyPermission } = require('../middleware/auth');

router.get('/', verifyToken, verifyPermission('rewards.view'), getAllRewards);
router.get('/redemptions', verifyToken, verifyPermission('redemptions.view'), getAllRedemptions);
router.get('/:id', verifyToken, verifyPermission('rewards.view'), getRewardById);
router.post('/', verifyToken, verifyPermission('rewards.create'), createReward);
router.put('/:id', verifyToken, verifyPermission('rewards.edit'), updateReward);
router.delete('/:id', verifyToken, verifyPermission('rewards.delete'), deleteReward);
router.post('/:id/redeem', verifyToken, verifyPermission('rewards.view'), redeemReward);
router.patch('/redemptions/:id/release', verifyToken, verifyPermission('redemptions.release'), releaseRedemption);

module.exports = router;