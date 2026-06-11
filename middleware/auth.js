const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  const token =
    (authHeader && authHeader.split(' ')[1]) ||
    req.query.token;

  if (!token) {
    return res.status(401).json({
      message: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      message: 'Invalid or expired token.'
    });
  }
};

const verifyAdmin = (req, res, next) => {
  const adminRoles = [
    'chairperson',
    'secretary',
    'treasurer',
    'sk_kagawad'
  ];

  if (!adminRoles.includes(req.user.role)) {
    return res.status(403).json({
      message: 'Access denied. Admins only.'
    });
  }

  next();
};

const verifyRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Access denied. Required roles: ${roles.join(', ')}.`
    });
  }

  next();
};

const PERMISSIONS = {
  chairperson: [
    'members.view',
    'members.create',
    'members.edit',
    'members.verify',

    'events.view',
    'events.create',
    'events.edit',
    'events.delete',

    'attendance.scan',

    'rewards.view',
    'rewards.create',
    'rewards.edit',
    'rewards.delete',

    'redemptions.view',
    'redemptions.release',

    'transparency.view',
    'transparency.create',
    'transparency.edit',
    'transparency.delete',

    'feedback.view',
    'feedback.update',
    'feedback.delete',

    'users.manage'
  ],

  secretary: [
    'members.view',
    'members.create',
    'members.edit',
    'members.verify',

    'events.view',
    'events.create',
    'events.edit',
    'events.delete',

    'attendance.scan',

    'rewards.view',
    'redemptions.view',

    'transparency.view',
    'transparency.create',
    'transparency.edit',

    'feedback.view',
    'feedback.update',
    'feedback.delete'
  ],

  treasurer: [
    'members.view',

    'events.view',

    'attendance.scan',

    'rewards.view',
    'rewards.create',
    'rewards.edit',
    'rewards.delete',

    'redemptions.view',
    'redemptions.release',

    'transparency.view',
    'transparency.create',
    'transparency.edit',

    'feedback.view'
  ],

  sk_kagawad: [
    'members.view',

    'events.view',

    'attendance.scan',

    'rewards.view',

    'redemptions.view',

    'transparency.view',

    'feedback.view'
  ],

  member: [
    'events.view',
    'rewards.view',
    'redemptions.view',
    'transparency.view',
    'feedback.view'
  ]
};

const verifyPermission = (permission) => (req, res, next) => {
  const role = req.user.role;
  const allowed = PERMISSIONS[role] || [];

  if (!allowed.includes(permission)) {
    return res.status(403).json({
      message: "Access denied. You don't have permission to perform this action."
    });
  }

  next();
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyRole,
  verifyPermission,
  PERMISSIONS
};