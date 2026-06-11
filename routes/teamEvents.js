const express = require('express');
const router = express.Router();

const {
  getTeamSettings,
  saveTeamSettings,
  getAdminTeams,
  getTeamDetails,
  approveRejectTeam,
  getMyTeam,
  createTeam,
  updateTeam,
  eligibleMembers,
  inviteMember,
  myInvitations,
  respondInvitation,
  getTeamInvitations,
  cancelInvitation,
  removeTeamMember,
  submitTeam,
  getAdminDashboard,
  exportTeamsCsv,
} = require('../controllers/sportsTeamController');

const { verifyToken, verifyPermission } = require('../middleware/auth');

// Mobile/member routes
router.get('/:eventId/settings', verifyToken, getTeamSettings);
router.get('/:eventId/my-team', verifyToken, getMyTeam);
router.get('/:eventId/eligible-members', verifyToken, eligibleMembers);
router.post('/:eventId/teams', verifyToken, createTeam);
router.put('/teams/:teamId', verifyToken, updateTeam);
router.post('/teams/:teamId/invite', verifyToken, inviteMember);
router.get('/teams/:teamId/invitations', verifyToken, getTeamInvitations);
router.delete('/teams/:teamId/members/:memberId', verifyToken, removeTeamMember);
router.delete('/invitations/:invitationId', verifyToken, cancelInvitation);
router.post('/teams/:teamId/submit', verifyToken, submitTeam);
router.get('/invitations/my', verifyToken, myInvitations);
router.patch('/invitations/:invitationId/respond', verifyToken, respondInvitation);

// Admin routes
router.get('/admin/dashboard', verifyToken, verifyPermission('events.view'), getAdminDashboard);
router.get('/admin/teams', verifyToken, verifyPermission('events.view'), getAdminTeams);
router.get('/admin/export', verifyToken, verifyPermission('events.view'), exportTeamsCsv);
router.get('/admin/teams/:teamId', verifyToken, verifyPermission('events.view'), getTeamDetails);
router.patch('/admin/teams/:teamId/status', verifyToken, verifyPermission('events.edit'), approveRejectTeam);
router.post('/:eventId/settings', verifyToken, verifyPermission('events.edit'), saveTeamSettings);

module.exports = router;
