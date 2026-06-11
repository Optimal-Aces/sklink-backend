const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  changeEmail,
  forgotPassword,
  verifyOtp,
  resetPassword,
  debugTokens,
} = require('../controllers/authController');

const { verifyToken, verifyRole } = require('../middleware/auth');

// ── Public ────────────────────────────────────────────────────
router.post('/register', register);
router.post('/register-admin', verifyToken, verifyRole('chairperson'), register);
router.post('/login', login);

// Forgot password flow (all public — no token required)
router.post('/forgot-password', forgotPassword);   // Step 1: request OTP
router.post('/verify-otp',      verifyOtp);        // Step 2: validate OTP → get verify_token
router.post('/reset-password',  resetPassword);    // Step 3: set new password

// DEV ONLY — remove before production
router.get('/debug-tokens', debugTokens);

// ── Protected ─────────────────────────────────────────────────
router.get('/me',              verifyToken, getMe);
router.put('/update-profile',  verifyToken, updateProfile);
router.put('/change-password', verifyToken, changePassword);
router.patch('/change-email', verifyToken, changeEmail);

module.exports = router;