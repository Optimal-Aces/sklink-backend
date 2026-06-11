const db = require('../config/db');

// Get active announcements (for member app)
const getActiveAnnouncements = async (req, res) => {
  try {
    const [posts] = await db.query(
      `SELECT t.*, u.first_name, u.last_name
       FROM transparency_posts t
       LEFT JOIN users u ON t.posted_by = u.id
       WHERE t.category = 'announcement'
       AND (t.expires_at IS NULL OR t.expires_at > NOW())
       ORDER BY t.is_pinned DESC, t.created_at DESC`
    );
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get all announcements (for admin)
const getAllAnnouncements = async (req, res) => {
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
       WHERE t.category = 'announcement'
       ORDER BY t.is_pinned DESC, t.created_at DESC`
    );
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = { getActiveAnnouncements, getAllAnnouncements };