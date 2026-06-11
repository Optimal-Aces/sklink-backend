const express = require('express');
const router = express.Router();
const {
  getAllUsers, getUserById,
  updateUserStatus, updateUserRole, deleteUser
} = require('../controllers/userController');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, verifyRole('chairperson'), getAllUsers);
router.get('/:id', verifyToken, verifyRole('chairperson'), getUserById);
router.patch('/:id/status', verifyToken, verifyRole('chairperson'), updateUserStatus);
router.patch('/:id/role', verifyToken, verifyRole('chairperson'), updateUserRole);
router.delete('/:id', verifyToken, verifyRole('chairperson'), deleteUser);

module.exports = router;