const express = require('express');
const router = express.Router();
const db = require('../config/db');

const {
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
} = require('../controllers/memberController');

const { verifyToken, verifyPermission } = require('../middleware/auth');

// Member self-profile route for mobile app
router.get('/me/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const [rows] = await db.query(
      'SELECT * FROM members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch member profile.',
      error: error.message,
    });
  }
});

// Mobile: member fetches their own full profile
router.get('/me/full', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const [members] = await db.query(
      'SELECT m.*, u.email FROM members m LEFT JOIN users u ON m.user_id = u.id WHERE m.user_id = ? LIMIT 1',
      [userId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const memberId = members[0].id;

    const [[location], [education], [employment], [voterInfo], [classifications], [needsProfile], [documents]] =
      await Promise.all([
        db.query('SELECT * FROM member_location WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_education WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_employment WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_voter_info WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_classifications WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_needs_profile WHERE member_id = ?', [memberId]),
        db.query('SELECT * FROM member_documents WHERE member_id = ?', [memberId]),
      ]);

    res.json({
      member: members[0],
      location: location[0] || null,
      education: education[0] || null,
      employment: employment[0] || null,
      voter_info: voterInfo[0] || null,
      classifications: classifications[0] || null,
      needs_profile: needsProfile[0] || null,
      documents: documents || [],
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Mobile: upload own profile picture
router.post('/me/profile-photo', verifyToken, async (req, res) => {
  try {
    const upload = req.app.locals.upload.single('profile_photo');

    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Upload failed.' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded.' });
      }

      const userId = req.user.id || req.user.user_id;
      const photoPath = `/uploads/${req.file.filename}`;

      const [result] = await db.query(
        `UPDATE members SET profile_photo = ? WHERE user_id = ?`,
        [photoPath, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Member profile not found.' });
      }

      res.json({ message: 'Profile photo updated successfully.', profile_photo: photoPath });
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
});

// Mobile: direct-edit safe profile fields
router.patch('/me/editable-profile', verifyToken, updateEditableProfile);

// Mobile: request official profile update/re-verification
router.post('/me/update-request', verifyToken, async (req, res) => {
  const upload = req.app.locals.upload.single('supporting_document');

  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed.' });
    }

    return createUpdateRequest(req, res);
  });
});

// Mobile: request history
router.get('/me/update-requests', verifyToken, getMyUpdateRequests);

// Admin: update request management
router.get('/update-requests', verifyToken, verifyPermission('members.view'), getAllUpdateRequests);
router.patch('/update-requests/:id/review', verifyToken, verifyPermission('members.verify'), reviewUpdateRequest);

// General routes
router.get('/', verifyToken, verifyPermission('members.view'), getAllMembers);
router.get('/:id/full', verifyToken, verifyPermission('members.view'), getMemberFull);

router.get('/:id/points', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM points_ledger WHERE member_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch points history.' });
  }
});

router.get('/:id', verifyToken, verifyPermission('members.view'), getMemberById);

// Mobile member registration profile creation
router.post('/register-profile', verifyToken, createMember);

// Admin member creation
router.post('/', verifyToken, verifyPermission('members.create'), createMember);

router.put('/:id', verifyToken, verifyPermission('members.edit'), updateMember);
router.patch('/:id/verify', verifyToken, verifyPermission('members.verify'), verifyMember);

// Registration sub-routes
router.post('/:id/location', verifyToken, saveMemberLocation);
router.post('/:id/education', verifyToken, saveMemberEducation);
router.post('/:id/employment', verifyToken, saveMemberEmployment);
router.post('/:id/voter', verifyToken, saveMemberVoterInfo);
router.post('/:id/classifications', verifyToken, saveMemberClassifications);
router.post('/:id/needs', verifyToken, saveMemberNeeds);

module.exports = router;
