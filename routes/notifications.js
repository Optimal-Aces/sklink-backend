const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');


// Get unread count
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const [rows] = await db.query(
      `SELECT COUNT(*) AS unread_count FROM notifications
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    res.json({ unread_count: rows[0].unread_count || 0 });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unread count.', error: error.message });
  }
});

// Get notification preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const [rows] = await db.query(
      'SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();
      await db.query(
        `INSERT INTO notification_preferences (id, user_id)
         VALUES (?, ?)`,
        [id, userId]
      );
      const [created] = await db.query(
        'SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1',
        [userId]
      );
      return res.json(created[0]);
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch preferences.', error: error.message });
  }
});

// Update notification preferences
router.patch('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const prefs = req.body || {};
    const { v4: uuidv4 } = require('uuid');

    await db.query(
      `INSERT INTO notification_preferences
        (id, user_id, event_notifications, reward_notifications, announcement_notifications,
         transparency_notifications, registration_notifications)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        event_notifications = VALUES(event_notifications),
        reward_notifications = VALUES(reward_notifications),
        announcement_notifications = VALUES(announcement_notifications),
        transparency_notifications = VALUES(transparency_notifications),
        registration_notifications = VALUES(registration_notifications)`,
      [
        uuidv4(),
        userId,
        prefs.event_notifications ? 1 : 0,
        prefs.reward_notifications ? 1 : 0,
        prefs.announcement_notifications ? 1 : 0,
        prefs.transparency_notifications ? 1 : 0,
        prefs.registration_notifications ? 1 : 0,
      ]
    );

    res.json({ message: 'Notification preferences updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update preferences.', error: error.message });
  }
});

// Get my notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const [rows] = await db.query(
      `SELECT *
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch notifications.',
      error: error.message,
    });
  }
});

// Mark all as read
router.patch('/mark-all/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE user_id = ?`,
      [userId]
    );

    res.json({
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update notifications.',
      error: error.message,
    });
  }
});

// Mark one notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const [result] = await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ? AND user_id = ?`,
      [req.params.id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Notification not found.',
      });
    }

    res.json({
      message: 'Notification marked as read.',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to update notification.',
      error: error.message,
    });
  }
});

// ── DEV: Debug endpoint — shows raw DB rows for this user ──
// GET /api/notifications/debug
// Use this in Postman/browser to verify notifications exist in DB
router.get('/debug', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    // Show this user's notifications
    const [myRows] = await db.query(
      `SELECT id, user_id, title, notification_type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    // Show all recent notifications in DB (last 20 across all users)
    const [allRows] = await db.query(
      `SELECT n.id, n.user_id, u.email, u.role,
              n.title, n.notification_type, n.is_read, n.created_at
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC LIMIT 20`
    );

    // Show total count per notification_type
    const [typeCounts] = await db.query(
      `SELECT notification_type, COUNT(*) as total,
              SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
       FROM notifications
       GROUP BY notification_type`
    );

    // Show active member users
    const [members] = await db.query(
      `SELECT id, email, role, status FROM users
       WHERE role = 'member' AND status = 'active'`
    );

    res.json({
      your_user_id: userId,
      your_notifications: { count: myRows.length, rows: myRows },
      all_recent:         { count: allRows.length, rows: allRows },
      type_breakdown:     typeCounts,
      active_members:     { count: members.length, rows: members },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;