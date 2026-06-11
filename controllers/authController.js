const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ── Helpers ──────────────────────────────────────────────────

// Generate a random 6-digit OTP string
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Password strength check — min 8 chars, at least one letter + one number
const isStrongPassword = (pw) =>
  pw.length >= 8 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);

// ── Register ─────────────────────────────────────────────────
const register = async (req, res) => {
  const { email, password, first_name, last_name, role } = req.body;

  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.query(
      'INSERT INTO users (id, email, first_name, last_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [id, email, first_name, last_name, password_hash, role || 'member']
    );

    res.status(201).json({ message: 'User registered successfully.', id });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Login ─────────────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: 'Email and password are required.' });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    if (users.length === 0) {
      return res
        .status(401)
        .json({ message: 'Invalid email or password.' });
    }

    const user = users[0];

    if (user.status !== 'active') {
      return res
        .status(403)
        .json({ message: 'Account is inactive or suspended.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Get Me ────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, email, first_name, last_name, role, status FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Update Profile ────────────────────────────────────────────
const updateProfile = async (req, res) => {
  const { first_name, last_name } = req.body;

  if (!first_name || !last_name) {
    return res
      .status(400)
      .json({ message: 'First and last name are required.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [first_name, last_name, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ message: 'Profile updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Change Email (authenticated) ─────────────────────────────
const changeEmail = async (req, res) => {
  const userId = req.user.id || req.user.user_id;
  const { email } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id <> ?',
      [cleanEmail, userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email is already in use.' });
    }

    await db.query('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, userId]);

    res.json({ message: 'Email updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Change Password (authenticated — requires current password) ─
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res
      .status(400)
      .json({ message: 'Current and new password are required.' });
  }

  if (!isStrongPassword(new_password)) {
    return res.status(400).json({
      message:
        'New password must be at least 8 characters and contain both letters and numbers.',
    });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(
      current_password,
      users[0].password_hash
    );
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: 'Current password is incorrect.' });
    }

    // Prevent reuse of the same password
    const isSame = await bcrypt.compare(
      new_password,
      users[0].password_hash
    );
    if (isSame) {
      return res.status(400).json({
        message: 'New password cannot be the same as your current password.',
      });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await db.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [password_hash, req.user.id]
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Forgot Password — Step 1: Request OTP ────────────────────
// POST /api/auth/forgot-password  { email }
//
// Security notes:
//   - Always returns the same generic success message whether the
//     email exists or not (prevents email enumeration attacks).
//   - OTP is stored bcrypt-hashed — plaintext never touches the DB.
//   - Any previous unused tokens for this user are invalidated first.
//   - In production, send the OTP via email/SMS instead of returning
//     it in the response. It is returned here because there is no
//     email service configured in this project.
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  // Generic response — don't reveal whether the email exists
  const genericResponse = {
    message:
      'If that email is registered, a 6-digit reset code has been sent.',
  };

  try {
    const [users] = await db.query(
      'SELECT id, email, status FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    // Silently succeed even if email not found (anti-enumeration)
    if (users.length === 0) {
      return res.json(genericResponse);
    }

    const user = users[0];

    if (user.status !== 'active') {
      return res.json(genericResponse);
    }

    // Invalidate all previous unused tokens for this user
    await db.query(
      'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0',
      [user.id]
    );

    // Generate a 6-digit OTP
    const otp = generateOTP();
    const token_hash = await bcrypt.hash(otp, 10);
    const id = uuidv4();

    // Use MySQL DATE_ADD(NOW(), INTERVAL 15 MINUTE) so the expiry is always
    // in MySQL's own timezone — avoids the UTC vs local time mismatch that
    // causes tokens to appear instantly expired on servers in UTC+8 (PH time).
    await db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
      [id, user.id, token_hash]
    );

    // TODO: In production, send `otp` via email/SMS here instead.
    // For development, the OTP is returned in the response so you
    // can test without an email service.
    res.json({
      ...genericResponse,
      // REMOVE the line below in production:
      dev_otp: otp,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Verify OTP — Step 2: Validate code before showing new password form ──
// POST /api/auth/verify-otp  { email, otp }
//
// Does NOT invalidate the token yet — that happens only on reset.
// Returns a short-lived verify_token the client includes in the
// reset-password call so we don't re-validate OTP a second time.
const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  const invalidMsg = 'Invalid or expired reset code. Please request a new one.';

  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    if (users.length === 0) {
      return res.status(400).json({ message: invalidMsg });
    }

    const userId = users[0].id;

    // Fetch the latest unused, non-expired token for this user
    const [tokens] = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE user_id = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (tokens.length === 0) {
      return res.status(400).json({ message: invalidMsg });
    }

    const tokenRow = tokens[0];
    const isMatch = await bcrypt.compare(otp.toString(), tokenRow.token_hash);

    if (!isMatch) {
      return res.status(400).json({ message: invalidMsg });
    }

    // Issue a short-lived verify token so the client can proceed to step 3
    // This is separate from the auth JWT — it only allows password reset.
    const verify_token = jwt.sign(
      { user_id: userId, token_id: tokenRow.id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }    // 10 minutes to fill in the new password
    );

    res.json({
      message: 'OTP verified successfully.',
      verify_token,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Reset Password — Step 3: Set new password ────────────────
// POST /api/auth/reset-password  { verify_token, new_password, confirm_password }
//
// Security notes:
//   - Validates the verify_token issued in step 2.
//   - Re-checks the OTP row is still unused and not expired.
//   - Marks the token as used immediately (single-use guarantee).
//   - Prevents reuse of the same password.
const resetPassword = async (req, res) => {
  const { verify_token, new_password, confirm_password } = req.body;

  if (!verify_token || !new_password || !confirm_password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }

  if (!isStrongPassword(new_password)) {
    return res.status(400).json({
      message:
        'Password must be at least 8 characters and include both letters and numbers.',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(verify_token, process.env.JWT_SECRET);
  } catch {
    return res
      .status(400)
      .json({ message: 'Reset session expired. Please start over.' });
  }

  if (decoded.purpose !== 'password_reset') {
    return res.status(400).json({ message: 'Invalid reset token.' });
  }

  try {
    // Re-verify the OTP row is still valid and unused
    const [tokens] = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE id = ? AND user_id = ? AND used = 0 AND expires_at > NOW()`,
      [decoded.token_id, decoded.user_id]
    );

    if (tokens.length === 0) {
      return res.status(400).json({
        message: 'Reset code has already been used or expired. Please request a new one.',
      });
    }

    // Fetch current password to check for reuse
    const [users] = await db.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [decoded.user_id]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isSame = await bcrypt.compare(
      new_password,
      users[0].password_hash
    );
    if (isSame) {
      return res.status(400).json({
        message: 'New password cannot be the same as your old password.',
      });
    }

    const password_hash = await bcrypt.hash(new_password, 10);

    // Run both updates in parallel
    await Promise.all([
      db.query('UPDATE users SET password_hash = ? WHERE id = ?', [
        password_hash,
        decoded.user_id,
      ]),
      // Mark token as used — prevents replay attacks
      db.query(
        'UPDATE password_reset_tokens SET used = 1 WHERE id = ?',
        [decoded.token_id]
      ),
    ]);

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// ── Debug helper (DEV ONLY — remove before production) ──────
// GET /api/auth/debug-tokens?email=xxx
// Shows the raw token rows for an email so you can verify
// expires_at is being stored correctly relative to NOW().
const debugTokens = async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ message: 'email required' });
  try {
    const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (!users.length) return res.json({ tokens: [], now: new Date() });
    const [tokens] = await db.query(
      `SELECT id, used, expires_at, created_at,
              NOW() AS mysql_now,
              (expires_at > NOW()) AS is_valid
       FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
      [users[0].id]
    );
    res.json({ tokens, mysql_now: tokens[0]?.mysql_now });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = {
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
};