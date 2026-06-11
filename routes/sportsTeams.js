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
  cancelInvitation,
  removeTeamMember,
  submitTeam,
  exportTeamsCsv,
} = require('../controllers/sportsTeamController');

const { verifyToken, verifyPermission } = require('../middleware/auth');

// Admin routes
router.get('/admin/teams', verifyToken, verifyPermission('events.view'), getAdminTeams);
router.get('/admin/teams/export', verifyToken, verifyPermission('events.view'), exportTeamsCsv);
router.get('/admin/teams/:teamId', verifyToken, verifyPermission('events.view'), getTeamDetails);
router.patch('/admin/teams/:teamId/status', verifyToken, verifyPermission('events.edit'), approveRejectTeam);

// Sports/team settings per event
router.get('/:eventId/settings', verifyToken, getTeamSettings);
router.get(
  '/admin/export',
  verifyToken,
  verifyPermission('events.view'),
  exportTeams
);
router.post('/:eventId/settings', verifyToken, verifyPermission('events.edit'), saveTeamSettings);
router.put('/:eventId/settings', verifyToken, verifyPermission('events.edit'), saveTeamSettings);

// Member/captain routes
router.get('/:eventId/my-team', verifyToken, getMyTeam);
router.post('/:eventId/teams', verifyToken, createTeam);
router.get('/:eventId/eligible-members', verifyToken, eligibleMembers);

router.put('/teams/:teamId', verifyToken, updateTeam);
router.post('/teams/:teamId/invite', verifyToken, inviteMember);
router.post('/teams/:teamId/submit', verifyToken, submitTeam);
router.delete('/teams/:teamId/invitations/:memberId', verifyToken, cancelInvitation);
router.delete('/teams/:teamId/members/:memberId', verifyToken, removeTeamMember);

router.get('/invitations/my', verifyToken, myInvitations);
router.patch('/invitations/:invitationId/respond', verifyToken, respondInvitation);

module.exports = router;
