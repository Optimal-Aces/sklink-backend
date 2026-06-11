const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Log an action
const logAction = async (userId, action, module, targetId = null, details = null, ip = null) => {
  try {
    await db.query(
      `INSERT INTO audit_logs (id, user_id, action, module, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId, action, module, targetId, details ? JSON.stringify(details) : null, ip]
    );
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

// Get all audit logs
const getAuditLogs = async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT a.*, u.first_name, u.last_name, u.role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.created_at DESC
       LIMIT 500`
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = { logAction, getAuditLogs };