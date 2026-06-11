const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Get all members
const getAllMembers = async (req, res) => {
  try {
    const [members] = await db.query(
      `SELECT m.*, u.email, u.status as account_status 
       FROM members m
       LEFT JOIN users u ON m.user_id = u.id
       ORDER BY m.created_at DESC`
    );
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get single member
const getMemberById = async (req, res) => {
  try {
    const [members] = await db.query(
      `SELECT m.*, u.email, u.status as account_status 
       FROM members m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.id = ?`,
      [req.params.id]
    );
    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }
    res.json(members[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get full member profile (all related tables)
const getMemberFull = async (req, res) => {
  const memberId = req.params.id;
  try {
    const [[members], [location], [education], [employment], [voterInfo], [classifications], [needsProfile], [documents]] = await Promise.all([
      db.query('SELECT m.*, u.email FROM members m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ?', [memberId]),
      db.query('SELECT * FROM member_location WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_education WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_employment WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_voter_info WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_classifications WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_needs_profile WHERE member_id = ?', [memberId]),
      db.query('SELECT * FROM member_documents WHERE member_id = ?', [memberId]),
    ]);

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    res.json({
      member: members[0],
      location: location[0] || null,
      education: education[0] || null,
      employment: employment[0] || null,
      voter_info: voterInfo[0] || null,
      classifications: classifications[0] || null,
      needs_profile: needsProfile[0] || null,
      documents: documents || []
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Create member
const createMember = async (req, res) => {
  const {
    user_id, first_name, last_name, birthdate,
    age, sex, civil_status, contact_number
  } = req.body;

  if (!user_id || !first_name || !last_name || !birthdate || !age || !sex) {
    return res.status(400).json({ message: 'Required fields are missing.' });
  }

  try {
    const id = uuidv4();
    const member_id = 'KK-' + String(Date.now()).slice(-5);

    await db.query(
      `INSERT INTO members 
        (id, user_id, member_id, first_name, last_name, birthdate, age, sex, civil_status, contact_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user_id, member_id, first_name, last_name, birthdate, age, sex, civil_status || 'single', contact_number || null]
    );

    res.status(201).json({ message: 'Member created successfully.', id, member_id });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Update member
const updateMember = async (req, res) => {
  const {
    first_name, last_name, birthdate,
    age, sex, civil_status, contact_number
  } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE members SET
        first_name = ?, last_name = ?, birthdate = ?,
        age = ?, sex = ?, civil_status = ?, contact_number = ?
       WHERE id = ?`,
      [first_name, last_name, birthdate, age, sex, civil_status, contact_number, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    res.json({ message: 'Member updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Verify member (approve or reject)
const verifyMember = async (req, res) => {
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      message: 'Status must be approved or rejected.'
    });
  }

  try {

    // Update member verification status
    const [result] = await db.query(
      'UPDATE members SET verification_status = ? WHERE id = ?',
      [status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Member not found.'
      });
    }

    // Fetch member info
    const [members] = await db.query(
      `SELECT user_id, first_name, last_name
       FROM members
       WHERE id = ?`,
      [req.params.id]
    );

    // Create notification
    if (members.length > 0) {

      const member = members[0];

      let title = '';
      let message = '';

      if (status === 'approved') {

        title = 'KK Registration Approved';

        message =
          `Congratulations ${member.first_name}! ` +
          `Your KK registration has been approved. ` +
          `Your Digital KK ID is now active.`;

      } else {

        title = 'KK Registration Rejected';

        message =
          `Sorry ${member.first_name}, ` +
          `your KK registration has been rejected. ` +
          `Please contact the SK office for assistance.`;
      }

      await db.query(
        `INSERT INTO notifications
          (
            user_id,
            title,
            message,
            notification_type
          )
         VALUES (?, ?, ?, ?)`,
        [
          member.user_id,
          title,
          message,
          'system'
        ]
      );
    }

    res.json({
      message: `Member ${status} successfully.`
    });

  } catch (error) {

    res.status(500).json({
      message: 'Server error.',
      error: error.message
    });
  }
};

// Save member location
const saveMemberLocation = async (req, res) => {
  const { region, complete_address, purok, barangay, city, province } = req.body;
  const memberId = req.params.id;

  try {
    // Check if location already exists
    const [existing] = await db.query(
      'SELECT id FROM member_location WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_location SET
          complete_address=?, purok=?, barangay=?, city=?, province=?
         WHERE member_id=?`,
        [region, complete_address, purok, barangay, city, province, memberId]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_location
          (id, member_id, complete_address, purok, barangay, city, province)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, memberId, region, complete_address, purok, barangay, city, province]
      );
    }
    res.json({ message: 'Location saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Save member education
const saveMemberEducation = async (req, res) => {
  const { educational_status, current_school, course_program } = req.body;
  const memberId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM member_education WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_education SET
          educational_status=?, current_school=?, course_program=?
         WHERE member_id=?`,
        [educational_status, current_school, course_program, memberId]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_education
          (id, member_id, educational_status, current_school, course_program)
         VALUES (?, ?, ?, ?, ?)`,
        [id, memberId, educational_status, current_school, course_program]
      );
    }
    res.json({ message: 'Education saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Save member employment
const saveMemberEmployment = async (req, res) => {
  const { employment_status, occupation } = req.body;
  const memberId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM member_employment WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_employment SET
          employment_status=?, occupation=?
         WHERE member_id=?`,
        [employment_status, occupation, memberId]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_employment
          (id, member_id, employment_status, occupation)
         VALUES (?, ?, ?, ?)`,
        [id, memberId, employment_status, occupation]
      );
    }
    res.json({ message: 'Employment saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Save voter info
const saveMemberVoterInfo = async (req, res) => {
  const { is_registered_voter, is_sk_voter } = req.body;
  const memberId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM member_voter_info WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_voter_info SET
          is_registered_voter=?, is_sk_voter=?
         WHERE member_id=?`,
        [is_registered_voter ? 1 : 0, is_sk_voter ? 1 : 0, memberId]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_voter_info
          (id, member_id, is_registered_voter, is_sk_voter)
         VALUES (?, ?, ?, ?)`,
        [id, memberId,
          is_registered_voter ? 1 : 0,
          is_sk_voter ? 1 : 0]
      );
    }
    res.json({ message: 'Voter info saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Save classifications
const saveMemberClassifications = async (req, res) => {
  const { is_ip, is_pwd, is_neet } = req.body;
  const memberId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM member_classifications WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_classifications SET
          is_ip=?, is_pwd=?, is_neet=?
         WHERE member_id=?`,
        [is_ip ? 1 : 0, is_pwd ? 1 : 0, is_neet ? 1 : 0, memberId]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_classifications
          (id, member_id, is_ip, is_pwd, is_neet)
         VALUES (?, ?, ?, ?, ?)`,
        [id, memberId,
          is_ip ? 1 : 0,
          is_pwd ? 1 : 0,
          is_neet ? 1 : 0]
      );
    }
    res.json({ message: 'Classifications saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Save needs profile
const saveMemberNeeds = async (req, res) => {
  const { skills, talents, interests, assistance_needed } = req.body;
  const memberId = req.params.id;

  try {
    const [existing] = await db.query(
      'SELECT id FROM member_needs_profile WHERE member_id = ?', [memberId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE member_needs_profile SET
          skills=?, talents=?, interests=?, assistance_needed=?
         WHERE member_id=?`,
        [
          JSON.stringify(skills || []),
          JSON.stringify(talents || []),
          JSON.stringify(interests || []),
          JSON.stringify(assistance_needed || []),
          memberId
        ]
      );
    } else {
      const id = uuidv4();
      await db.query(
        `INSERT INTO member_needs_profile
          (id, member_id, skills, talents, interests, assistance_needed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id, memberId,
          JSON.stringify(skills || []),
          JSON.stringify(talents || []),
          JSON.stringify(interests || []),
          JSON.stringify(assistance_needed || [])
        ]
      );
    }
    res.json({ message: 'Needs profile saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};


const updateEditableProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const {
      email,
      contact_number,
      employment_status,
      occupation,
      skills,
      talents,
      interests,
      emergency_contact_name,
      emergency_contact_number
    } = req.body;

    const [members] = await db.query(
      `SELECT id, contact_number, emergency_contact_name, emergency_contact_number
       FROM members
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const member = members[0];
    const memberId = member.id;

    await db.query(
      `UPDATE members
       SET contact_number = ?,
           emergency_contact_name = ?,
           emergency_contact_number = ?
       WHERE id = ?`,
      [
        contact_number ?? member.contact_number,
        emergency_contact_name ?? member.emergency_contact_name,
        emergency_contact_number ?? member.emergency_contact_number,
        memberId
      ]
    );

    if (email !== undefined && String(email).trim() !== '') {
      await db.query('UPDATE users SET email = ? WHERE id = ?', [String(email).trim(), userId]);
    }

    const [employment] = await db.query(
      'SELECT id, employment_status, occupation FROM member_employment WHERE member_id = ?',
      [memberId]
    );

    if (employment.length > 0) {
      await db.query(
        `UPDATE member_employment
         SET employment_status = ?, occupation = ?
         WHERE member_id = ?`,
        [
          employment_status ?? employment[0].employment_status,
          occupation ?? employment[0].occupation,
          memberId
        ]
      );
    } else {
      await db.query(
        `INSERT INTO member_employment (id, member_id, employment_status, occupation)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), memberId, employment_status || 'student', occupation || '']
      );
    }

    const [needs] = await db.query(
      'SELECT id, skills, talents, interests, assistance_needed FROM member_needs_profile WHERE member_id = ?',
      [memberId]
    );

    if (needs.length > 0) {
      await db.query(
        `UPDATE member_needs_profile
         SET skills = ?, talents = ?, interests = ?
         WHERE member_id = ?`,
        [
          skills !== undefined ? JSON.stringify(skills) : needs[0].skills,
          talents !== undefined ? JSON.stringify(talents) : needs[0].talents,
          interests !== undefined ? JSON.stringify(interests) : needs[0].interests,
          memberId
        ]
      );
    } else {
      await db.query(
        `INSERT INTO member_needs_profile (id, member_id, skills, talents, interests, assistance_needed)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          memberId,
          JSON.stringify(skills || []),
          JSON.stringify(talents || []),
          JSON.stringify(interests || []),
          JSON.stringify([])
        ]
      );
    }

    res.json({ message: 'Profile updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const parseRequestedData = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
};

const createUpdateRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const requestType = req.body.request_type || 'full_profile_reverification';
    const requestedData = parseRequestedData(req.body.requested_data);
    const reason = req.body.reason || null;
    const supportingDocument = req.file ? `/uploads/${req.file.filename}` : null;

    const [members] = await db.query(
      'SELECT id FROM members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO member_update_requests
       (id, member_id, user_id, request_type, requested_data, reason, supporting_document, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        id,
        members[0].id,
        userId,
        requestType,
        JSON.stringify(requestedData),
        reason,
        supportingDocument
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
    const [rows] = await db.query(
      `SELECT r.*, m.member_id, m.first_name, m.last_name, u.email
       FROM member_update_requests r
       LEFT JOIN members m ON r.member_id = m.id
       LEFT JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const upsertByMember = async (table, memberId, data, insertColumns, updateSet, insertValues) => {
  const [existing] = await db.query(`SELECT id FROM ${table} WHERE member_id = ? LIMIT 1`, [memberId]);
  if (existing.length > 0) {
    await db.query(`UPDATE ${table} SET ${updateSet} WHERE member_id = ?`, [...insertValues, memberId]);
  } else {
    await db.query(
      `INSERT INTO ${table} (id, member_id, ${insertColumns}) VALUES (?, ?, ${insertValues.map(() => '?').join(', ')})`,
      [uuidv4(), memberId, ...insertValues]
    );
  }
};

const applyApprovedRequest = async (request) => {
  const data = parseRequestedData(request.requested_data);
  const memberId = request.member_id;

  if (data.personal_information) {
    const p = data.personal_information;
    const updates = [];
    const values = [];

    if (p.first_name) { updates.push('first_name = ?'); values.push(p.first_name); }
    if (p.last_name) { updates.push('last_name = ?'); values.push(p.last_name); }
    if (p.birthdate) { updates.push('birthdate = ?'); values.push(p.birthdate); }
    if (p.sex) { updates.push('sex = ?'); values.push(p.sex); }
    if (p.civil_status) { updates.push('civil_status = ?'); values.push(p.civil_status); }

    if (p.birthdate) {
      updates.push('age = TIMESTAMPDIFF(YEAR, ?, CURDATE())');
      values.push(p.birthdate);
    }

    if (updates.length > 0) {
      values.push(memberId);
      await db.query(`UPDATE members SET ${updates.join(', ')} WHERE id = ?`, values);
    }
  }

  if (data.address) {
    const a = data.address;
    const region = a.region || '';
    const completeAddress = a.complete_address || '';
    const purok = a.purok || '';
    const barangay = a.barangay || '';
    const city = a.city_municipality || a.city || '';
    const province = a.province || '';

    const [existing] = await db.query('SELECT id FROM member_location WHERE member_id = ? LIMIT 1', [memberId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE member_location
         SET region = ?, complete_address = ?, purok = ?, barangay = ?, city = ?, province = ?
         WHERE member_id = ?`,
        [region, completeAddress, purok, barangay, city, province, memberId]
      );
    } else {
      await db.query(
        `INSERT INTO member_location (id, member_id, region, complete_address, purok, barangay, city, province)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), memberId, region, completeAddress, purok, barangay, city, province]
      );
    }
  }

  if (data.education) {
    const e = data.education;
    const [existing] = await db.query('SELECT id FROM member_education WHERE member_id = ? LIMIT 1', [memberId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE member_education
         SET educational_status = ?, current_school = ?, course_program = ?
         WHERE member_id = ?`,
        [e.educational_status || '', e.current_school || '', e.course_program || '', memberId]
      );
    } else {
      await db.query(
        `INSERT INTO member_education (id, member_id, educational_status, current_school, course_program)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), memberId, e.educational_status || '', e.current_school || '', e.course_program || '']
      );
    }
  }

  if (data.voter_info) {
    const v = data.voter_info;
    const registered = v.is_registered_voter ? 1 : 0;
    const sk = v.is_sk_voter ? 1 : 0;
    const [existing] = await db.query('SELECT id FROM member_voter_info WHERE member_id = ? LIMIT 1', [memberId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE member_voter_info SET is_registered_voter = ?, is_sk_voter = ? WHERE member_id = ?`,
        [registered, sk, memberId]
      );
    } else {
      await db.query(
        `INSERT INTO member_voter_info (id, member_id, is_registered_voter, is_sk_voter)
         VALUES (?, ?, ?, ?)`,
        [uuidv4(), memberId, registered, sk]
      );
    }
  }

  if (data.classifications) {
    const c = data.classifications;
    const ip = c.is_ip ? 1 : 0;
    const pwd = c.is_pwd ? 1 : 0;
    const neet = c.is_neet ? 1 : 0;
    const [existing] = await db.query('SELECT id FROM member_classifications WHERE member_id = ? LIMIT 1', [memberId]);
    if (existing.length > 0) {
      await db.query(
        `UPDATE member_classifications SET is_ip = ?, is_pwd = ?, is_neet = ? WHERE member_id = ?`,
        [ip, pwd, neet, memberId]
      );
    } else {
      await db.query(
        `INSERT INTO member_classifications (id, member_id, is_ip, is_pwd, is_neet)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), memberId, ip, pwd, neet]
      );
    }
  }
};

const reviewUpdateRequest = async (req, res) => {
  try {
    const adminId = req.user.id || req.user.user_id;
    const { status, admin_remarks } = req.body;
    const requestId = req.params.id;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected.' });
    }

    const [requests] = await db.query(
      'SELECT * FROM member_update_requests WHERE id = ? LIMIT 1',
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Update request not found.' });
    }

    const request = requests[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'This request has already been reviewed.' });
    }

    if (status === 'approved') {
      await applyApprovedRequest(request);
    }

    await db.query(
      `UPDATE member_update_requests
       SET status = ?, admin_remarks = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [status, admin_remarks || null, adminId, requestId]
    );

    await db.query(
      `INSERT INTO notifications (id, user_id, title, message, notification_type)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        request.user_id,
        status === 'approved' ? 'Profile Update Approved' : 'Profile Update Rejected',
        status === 'approved'
          ? 'Your profile update request has been approved and applied to your profile.'
          : 'Your profile update request has been rejected. Please check the admin remarks.',
        'system'
      ]
    );

    res.json({ message: `Profile update request ${status} successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  getAllMembers,
  getMemberById,
  getMemberFull,
  createMember,
  updateMember,
  verifyMember,
  saveMemberLocation,
  saveMemberEducation,
  saveMemberEmployment,
  saveMemberVoterInfo,
  saveMemberClassifications,
  saveMemberNeeds,
  updateEditableProfile,
  createUpdateRequest,
  getMyUpdateRequests,
  getAllUpdateRequests,
  reviewUpdateRequest
};