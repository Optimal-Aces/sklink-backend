const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const normalizeJson = (value, fallback = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

const toBoolInt = (value) => {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  return 0;
};

const createMyUpdateRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const requestType = req.body.request_type || 'profile_reverification';
    const requestedData = normalizeJson(req.body.requested_data, null);
    const reason = req.body.reason || null;

    if (!requestedData) {
      return res.status(400).json({ message: 'Requested data is required.' });
    }

    const [members] = await db.query(
      'SELECT id FROM members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const memberId = members[0].id;

    const [pending] = await db.query(
      `SELECT id FROM member_update_requests
       WHERE member_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [memberId]
    );

    if (pending.length > 0) {
      return res.status(409).json({
        message: 'You already have a pending profile update request. Please wait for admin review.'
      });
    }

    const id = uuidv4();
    const docPath = req.file ? `/uploads/${req.file.filename}` : null;
    const docType = req.body.supporting_document_type || null;

    await db.query(
      `INSERT INTO member_update_requests
        (id, member_id, user_id, request_type, requested_data, reason,
         supporting_document_path, supporting_document_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        memberId,
        userId,
        requestType,
        JSON.stringify(requestedData),
        reason,
        docPath,
        docType
      ]
    );

    res.status(201).json({
      message: 'Profile update request submitted successfully.',
      id
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getMyUpdateRequests = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const [rows] = await db.query(
      `SELECT * FROM member_update_requests
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getAllUpdateRequests = async (req, res) => {
  try {
    const status = req.query.status;
    const params = [];
    let where = '';

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where = 'WHERE r.status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT r.*, m.member_id, m.first_name, m.last_name, m.contact_number,
              u.email, reviewer.first_name AS reviewer_first_name,
              reviewer.last_name AS reviewer_last_name
       FROM member_update_requests r
       LEFT JOIN members m ON r.member_id = m.id
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getUpdateRequestById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, m.member_id, m.first_name, m.last_name, m.contact_number,
              u.email
       FROM member_update_requests r
       LEFT JOIN members m ON r.member_id = m.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Update request not found.' });
    }

    const request = rows[0];

    const [[education], [voterInfo], [classifications], [location], [employment]] = await Promise.all([
      db.query('SELECT * FROM member_education WHERE member_id = ?', [request.member_id]),
      db.query('SELECT * FROM member_voter_info WHERE member_id = ?', [request.member_id]),
      db.query('SELECT * FROM member_classifications WHERE member_id = ?', [request.member_id]),
      db.query('SELECT * FROM member_location WHERE member_id = ?', [request.member_id]),
      db.query('SELECT * FROM member_employment WHERE member_id = ?', [request.member_id]),
    ]);

    res.json({
      request,
      current: {
        education: education[0] || null,
        voter_info: voterInfo[0] || null,
        classifications: classifications[0] || null,
        location: location[0] || null,
        employment: employment[0] || null,
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const upsertEducation = async (memberId, education = {}) => {
  const [existing] = await db.query(
    'SELECT id FROM member_education WHERE member_id = ? LIMIT 1',
    [memberId]
  );

  const values = [
    education.educational_status || null,
    education.current_school || null,
    education.course_program || null,
    memberId
  ];

  if (existing.length > 0) {
    await db.query(
      `UPDATE member_education
       SET educational_status = ?, current_school = ?, course_program = ?
       WHERE member_id = ?`,
      values
    );
  } else {
    await db.query(
      `INSERT INTO member_education
       (id, member_id, educational_status, current_school, course_program)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), memberId, values[0], values[1], values[2]]
    );
  }
};

const upsertVoterInfo = async (memberId, voter = {}) => {
  const [existing] = await db.query(
    'SELECT id FROM member_voter_info WHERE member_id = ? LIMIT 1',
    [memberId]
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE member_voter_info
       SET is_registered_voter = ?, is_sk_voter = ?
       WHERE member_id = ?`,
      [toBoolInt(voter.is_registered_voter), toBoolInt(voter.is_sk_voter), memberId]
    );
  } else {
    await db.query(
      `INSERT INTO member_voter_info
       (id, member_id, is_registered_voter, is_sk_voter)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), memberId, toBoolInt(voter.is_registered_voter), toBoolInt(voter.is_sk_voter)]
    );
  }
};

const upsertClassifications = async (memberId, classifications = {}) => {
  const [existing] = await db.query(
    'SELECT id FROM member_classifications WHERE member_id = ? LIMIT 1',
    [memberId]
  );

  if (existing.length > 0) {
    await db.query(
      `UPDATE member_classifications
       SET is_ip = ?, is_pwd = ?, is_neet = ?
       WHERE member_id = ?`,
      [
        toBoolInt(classifications.is_ip),
        toBoolInt(classifications.is_pwd),
        toBoolInt(classifications.is_neet),
        memberId
      ]
    );
  } else {
    await db.query(
      `INSERT INTO member_classifications
       (id, member_id, is_ip, is_pwd, is_neet)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        memberId,
        toBoolInt(classifications.is_ip),
        toBoolInt(classifications.is_pwd),
        toBoolInt(classifications.is_neet)
      ]
    );
  }
};

const upsertLocation = async (memberId, location = {}) => {
  const hasLocation = Object.values(location || {}).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (!hasLocation) return;

  const [existing] = await db.query(
    'SELECT id FROM member_location WHERE member_id = ? LIMIT 1',
    [memberId]
  );

  const data = {
    complete_address: location.complete_address || location.street || null,
    purok: location.purok || null,
    barangay: location.barangay || null,
    city: location.city || location.city_municipality || null,
    province: location.province || null,
  };

  if (existing.length > 0) {
    await db.query(
      `UPDATE member_location
       SET complete_address = ?, purok = ?, barangay = ?, city = ?, province = ?
       WHERE member_id = ?`,
      [data.complete_address, data.purok, data.barangay, data.city, data.province, memberId]
    );
  } else {
    await db.query(
      `INSERT INTO member_location
       (id, member_id, complete_address, purok, barangay, city, province)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), memberId, data.complete_address, data.purok, data.barangay, data.city, data.province]
    );
  }
};

const reviewUpdateRequest = async (req, res) => {
  try {
    const adminId = req.user.id || req.user.user_id;
    const { status, admin_remarks } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected.' });
    }

    const [rows] = await db.query(
      'SELECT * FROM member_update_requests WHERE id = ? LIMIT 1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Update request not found.' });
    }

    const request = rows[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'This request has already been reviewed.' });
    }

    const data = normalizeJson(request.requested_data, {});

    if (status === 'approved') {
      if (data.education) await upsertEducation(request.member_id, data.education);
      if (data.voter_info) await upsertVoterInfo(request.member_id, data.voter_info);
      if (data.classifications) await upsertClassifications(request.member_id, data.classifications);
      if (data.location) await upsertLocation(request.member_id, data.location);
    }

    await db.query(
      `UPDATE member_update_requests
       SET status = ?, admin_remarks = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [status, admin_remarks || null, adminId, req.params.id]
    );

    const title = status === 'approved'
      ? 'Profile Update Approved'
      : 'Profile Update Rejected';
    const message = status === 'approved'
      ? 'Your requested profile changes have been approved and applied.'
      : `Your requested profile changes were rejected.${admin_remarks ? ' Reason: ' + admin_remarks : ''}`;

    await db.query(
      `INSERT INTO notifications (user_id, title, message, notification_type)
       VALUES (?, ?, ?, ?)`,
      [request.user_id, title, message, 'profile_update']
    );

    res.json({ message: `Profile update request ${status}.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  createMyUpdateRequest,
  getMyUpdateRequests,
  getAllUpdateRequests,
  getUpdateRequestById,
  reviewUpdateRequest,
};
