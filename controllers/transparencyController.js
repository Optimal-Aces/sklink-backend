const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get all posts
const getAllPosts = async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT t.*, u.first_name, u.last_name,
        CASE
          WHEN t.expires_at IS NULL THEN 'permanent'
          WHEN t.expires_at > NOW() THEN 'active'
          ELSE 'expired'
        END as expiry_status
       FROM transparency_posts t
       LEFT JOIN users u ON t.posted_by = u.id
       ORDER BY t.is_pinned DESC, t.created_at DESC`
    );

    res.json(posts);
  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message,
    });
  }
};

// Get single post
const getPostById = async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT t.*, u.first_name, u.last_name
       FROM transparency_posts t
       LEFT JOIN users u ON t.posted_by = u.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        message: 'Post not found.',
      });
    }

    res.json(posts[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message,
    });
  }
};

// Calculate expires_at from duration
// Returns a MySQL DATE_ADD expression string so expiry is always
// computed in MySQL's own timezone (avoids UTC vs UTC+8 mismatch).
const getExpiresAt = (duration) => {
  if (!duration || duration === 'never') return null;

  const intervalMap = {
    '6h':  'INTERVAL 6 HOUR',
    '24h': 'INTERVAL 24 HOUR',
    '3d':  'INTERVAL 3 DAY',
    '7d':  'INTERVAL 7 DAY',
    '30d': 'INTERVAL 30 DAY',
  };

  return intervalMap[duration] || null;
};

// Send notification to all active members.
//
// IMPORTANT: mysql2 promise pool does NOT support the bulk
// `VALUES ?` syntax from mysql v1. We insert row-by-row in
// parallel with Promise.all instead.
//
// referenceId   = UUID of the linked post/event/reward (optional)
// referenceType = 'transparency_post' | 'event' | 'reward' (optional)
const notifyAllMembers = async ({
  title,
  message,
  notificationType = 'system',
  referenceId = null,
  referenceType = null,
}) => {
  try {
    const [users] = await db.query(
      `SELECT id FROM users WHERE role = 'member' AND status = 'active'`
    );

    if (!users || users.length === 0) {
      console.log('[notifyAllMembers] No active members found — skipping.');
      return;
    }

    console.log(`[notifyAllMembers] Sending "${notificationType}" to ${users.length} members. ref=${referenceId}`);

    // Insert one notification per member concurrently.
    // Uses individual VALUES — NOT bulk VALUES ?
    // because mysql2 promise pool does not support the bulk syntax.
    await Promise.all(
      users.map((user) =>
        db.query(
          `INSERT INTO notifications
             (id, user_id, title, message, notification_type, reference_id, reference_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), user.id, title, message, notificationType, referenceId, referenceType]
        )
      )
    );

    console.log(`[notifyAllMembers] Done — inserted ${users.length} notifications.`);
  } catch (err) {
    console.error('[notifyAllMembers] FAILED:', err.message);
  }
};

// Create post
const createPost = async (req, res) => {
  const {
    title,
    content,
    category,
    amount,
    expiry_duration,
    is_pinned,
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({
      message: 'Title and content are required.',
    });
  }

  try {
    const id = uuidv4();
    const postCategory = category || 'announcement';

    const expires_at =
      postCategory === 'announcement'
        ? getExpiresAt(expiry_duration)
        : null;

    // Build the INSERT dynamically: if expires_at is an INTERVAL expression
    // we embed it directly in SQL; if null we store NULL.
    const expiresInterval = expires_at; // e.g. 'INTERVAL 24 HOUR' or null
    const insertSql = expiresInterval
      ? `INSERT INTO transparency_posts
           (id, title, content, category, amount, expires_at, is_pinned, posted_by)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), ${expiresInterval}), ?, ?)`
      : `INSERT INTO transparency_posts
           (id, title, content, category, amount, expires_at, is_pinned, posted_by)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`;

    await db.query(insertSql, [
      id,
      title,
      content,
      postCategory,
      amount || 0,
      is_pinned ? 1 : 0,
      req.user.id,
    ]);

    // Map each category to a specific notification title and type.
    // 'transparency' is used as the notification_type for all non-announcement
    // transparency posts so the mobile app groups them in one inbox.
    const notifMap = {
      announcement: {
        title: '📢 New Announcement',
        notificationType: 'announcement',
      },
      budget: {
        title: '💰 Budget Update Posted',
        notificationType: 'transparency',
      },
      project: {
        title: '🏗️ New Project Update',
        notificationType: 'transparency',
      },
      report: {
        title: '📄 New Report Available',
        notificationType: 'transparency',
      },
      other: {
        title: '📌 New Transparency Post',
        notificationType: 'transparency',
      },
    };

    const notifConfig = notifMap[postCategory] || notifMap.other;

    notifyAllMembers({
      title: notifConfig.title,
      message: title,
      notificationType: notifConfig.notificationType,
      referenceId: id,
      referenceType: 'transparency_post',
    });

    res.status(201).json({
      message: 'Post created successfully.',
      id,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message,
    });
  }
};

// Update post
const updatePost = async (req, res) => {
  const {
    title,
    content,
    category,
    amount,
    expiry_duration,
    is_pinned,
  } = req.body;

  try {
    const postCategory = category || 'announcement';

    const expires_at =
      postCategory === 'announcement'
        ? getExpiresAt(expiry_duration)
        : null;

    const [result] = await db.query(
      `UPDATE transparency_posts SET
        title = ?, content = ?, category = ?,
        amount = ?, expires_at = ?, is_pinned = ?
       WHERE id = ?`,
      [
        title,
        content,
        postCategory,
        amount || 0,
        expires_at,
        is_pinned ? 1 : 0,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Post not found.',
      });
    }

    res.json({
      message: 'Post updated successfully.',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message,
    });
  }
};

// Delete post
const deletePost = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM transparency_posts WHERE id = ?',
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Post not found.',
      });
    }

    res.json({
      message: 'Post deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error.',
      error: error.message,
    });
  }
};

module.exports = {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
};