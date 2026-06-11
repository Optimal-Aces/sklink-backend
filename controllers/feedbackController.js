const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get all feedback (admin)
const getAllFeedback = async (req, res) => {
  try {
    const [feedback] = await db.query(
      `SELECT f.*, m.first_name, m.last_name, m.member_id as member_code
       FROM feedback f
       LEFT JOIN members m ON f.member_id = m.id
       ORDER BY f.created_at DESC`
    );
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get single feedback
const getFeedbackById = async (req, res) => {
  try {
    const [feedback] = await db.query(
      `SELECT f.*, m.first_name, m.last_name
       FROM feedback f
       LEFT JOIN members m ON f.member_id = m.id
       WHERE f.id = ?`,
      [req.params.id]
    );
    if (feedback.length === 0) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }
    res.json(feedback[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Submit feedback (member)
const submitFeedback = async (req, res) => {
  const { member_id, category, message } = req.body;

  if (!message) {
    return res.status(400).json({ message: 'Message is required.' });
  }

  try {
    const id = uuidv4();
    await db.query(
      `INSERT INTO feedback (id, member_id, category, message, status)
       VALUES (?, ?, ?, ?, 'open')`,
      [id, member_id || null, category || null, message]
    );
    res.status(201).json({ message: 'Feedback submitted successfully.', id });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Update feedback status (admin)
const updateFeedbackStatus = async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['open', 'in_review', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE feedback SET status = ? WHERE id = ?',
      [status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }
    res.json({ message: 'Feedback status updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Delete feedback (admin)
const deleteFeedback = async (req, res) => {
  try {
    const [result] = await db.query(
      'DELETE FROM feedback WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }
    res.json({ message: 'Feedback deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  getAllFeedback,
  getFeedbackById,
  submitFeedback,
  updateFeedbackStatus,
  deleteFeedback
};