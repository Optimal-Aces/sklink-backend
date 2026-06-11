const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get all rewards
const getAllRewards = async (req, res) => {
  try {
    const [rewards] = await db.query(
      'SELECT * FROM rewards ORDER BY created_at DESC'
    );
    res.json(rewards);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get single reward
const getRewardById = async (req, res) => {
  try {
    const [rewards] = await db.query(
      'SELECT * FROM rewards WHERE id = ?',
      [req.params.id]
    );
    if (rewards.length === 0) {
      return res.status(404).json({ message: 'Reward not found.' });
    }
    res.json(rewards[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Create reward
const createReward = async (req, res) => {
  const { name, description, points_required, quantity } = req.body;

  if (!name || !points_required) {
    return res.status(400).json({
      message: 'Name and points required are required.'
    });
  }

  try {
    const id = uuidv4();

    await db.query(
      `INSERT INTO rewards
       (id, name, description, points_required, quantity, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [
        id,
        name,
        description || null,
        points_required,
        quantity || 0
      ]
    );

    // ─────────────────────────────────────────────
    // AUTO NOTIFICATION TO ALL VERIFIED MEMBERS
    // ─────────────────────────────────────────────

    await db.query(
      `INSERT INTO notifications (
        id,
        user_id,
        title,
        message,
        notification_type,
        reference_id,
        reference_type,
        is_read,
        created_at
      )
      SELECT
        UUID(),
        m.user_id,
        '🎁 New Reward Available',
        CONCAT(?, ' is now available for redemption.'),
        'reward',
        ?,
        'reward',
        0,
        NOW()
      FROM members m
      WHERE m.verification_status IN ('approved', 'verified')
      AND m.user_id IS NOT NULL`,
      [name, id]
    );

    res.status(201).json({
      message: 'Reward created successfully.',
      id
    });

  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message
    });
  }
};

// Update reward
const updateReward = async (req, res) => {
  const { name, description, points_required, quantity, status } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE rewards SET
        name = ?, description = ?, points_required = ?,
        quantity = ?, status = ?
       WHERE id = ?`,
      [name, description, points_required, quantity, status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward not found.' });
    }
    res.json({ message: 'Reward updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Delete reward
const deleteReward = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM rewards WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reward not found.' });
    }
    res.json({ message: 'Reward deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Redeem a reward
const redeemReward = async (req, res) => {
  const { member_id } = req.body;
  const reward_id = req.params.id;

  if (!member_id) {
    return res.status(400).json({ message: 'member_id is required.' });
  }

  try {
    // Check reward exists and is active
    const [rewards] = await db.query(
      'SELECT * FROM rewards WHERE id = ? AND status = ?',
      [reward_id, 'active']
    );
    if (rewards.length === 0) {
      return res.status(404).json({ message: 'Reward not found or not active.' });
    }

    const reward = rewards[0];

    // Check quantity
    if (reward.quantity <= 0) {
      return res.status(400).json({ message: 'Reward is out of stock.' });
    }

    // Check member exists and is approved
    const [members] = await db.query(
      'SELECT * FROM members WHERE id = ? AND verification_status = ?',
      [member_id, 'approved']
    );
    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found or not verified.' });
    }

    const member = members[0];

    // Check if member has enough points
    if (member.points_balance < reward.points_required) {
      return res.status(400).json({
        message: 'Insufficient points.',
        points_required: reward.points_required,
        points_balance: member.points_balance
      });
    }

    // Generate redemption code
    const redemption_code = 'RDM-' + String(Date.now()).slice(-6);
    const id = uuidv4();

    // Create redemption record
    await db.query(
      `INSERT INTO redemptions (id, member_id, reward_id, redemption_code, status)
       VALUES (?, ?, ?, ?, 'pending_release')`,
      [id, member_id, reward_id, redemption_code]
    );

    // Deduct points from member
    await db.query(
      'UPDATE members SET points_balance = points_balance - ? WHERE id = ?',
      [reward.points_required, member_id]
    );

    // Add to points ledger
    await db.query(
      `INSERT INTO points_ledger (id, member_id, transaction_type, points, source_type, source_id)
       VALUES (?, ?, 'redeemed', ?, 'reward_redemption', ?)`,
      [uuidv4(), member_id, reward.points_required, reward_id]
    );

    // Decrease reward quantity
    await db.query(
      'UPDATE rewards SET quantity = quantity - 1 WHERE id = ?',
      [reward_id]
    );

    res.status(201).json({
      message: 'Reward redeemed successfully.',
      redemption_code,
      reward: reward.name,
      points_used: reward.points_required,
      remaining_balance: member.points_balance - reward.points_required
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get all redemptions
const getAllRedemptions = async (req, res) => {
  try {
    const [redemptions] = await db.query(
      `SELECT r.*, 
        m.first_name, m.last_name, m.member_id as member_code,
        rw.name as reward_name, rw.points_required
       FROM redemptions r
       LEFT JOIN members m ON r.member_id = m.id
       LEFT JOIN rewards rw ON r.reward_id = rw.id
       ORDER BY r.redeemed_at DESC`
    );
    res.json(redemptions);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Release redemption (admin confirms)
const releaseRedemption = async (req, res) => {
  try {
    const [result] = await db.query(
      `UPDATE redemptions SET
        status = 'released',
        released_at = NOW(),
        released_by = ?
       WHERE id = ? AND status = 'pending_release'`,
      [req.user.id, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Redemption not found or already released.' });
    }
    res.json({ message: 'Redemption released successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  getAllRewards,
  getRewardById,
  createReward,
  updateReward,
  deleteReward,
  redeemReward,
  getAllRedemptions,
  releaseRedemption
};