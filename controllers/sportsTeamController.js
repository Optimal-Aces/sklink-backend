const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const getUserId = (req) => req.user.id || req.user.user_id;

const getMyMember = async (userId) => {
  const [rows] = await db.query(
    `SELECT m.*, u.email
     FROM members m
     LEFT JOIN users u ON m.user_id = u.id
     WHERE m.user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

const getSettings = async (eventId) => {
  const [rows] = await db.query(
    `SELECT ets.*, e.title AS event_title, e.event_date
     FROM event_team_settings ets
     LEFT JOIN events e ON e.id = ets.event_id
     WHERE ets.event_id = ?
     LIMIT 1`,
    [eventId]
  );
  return rows[0] || null;
};

const isDeadlineClosed = (settings) => {
  if (!settings || !settings.registration_deadline) return true;
  return new Date(settings.registration_deadline).getTime() < Date.now();
};

const ensureEligibleMember = (member, settings) => {
  if (!member) return 'Member not found.';
  if (member.verification_status !== 'approved') return 'Only verified members are eligible.';

  const sex = (member.sex || '').toLowerCase();
  const category = (settings.category || 'mixed').toLowerCase();

  if (category === 'men' && sex !== 'male') return 'This event is for men only.';
  if (category === 'women' && sex !== 'female') return 'This event is for women only.';

  const age = Number(member.age || 0);
  if (settings.min_age !== null && age < Number(settings.min_age)) return `Minimum age is ${settings.min_age}.`;
  if (settings.max_age !== null && age > Number(settings.max_age)) return `Maximum age is ${settings.max_age}.`;

  return null;
};

const hasBlockingMembership = async (eventId, memberId) => {
  const [rows] = await db.query(
    `SELECT etm.*, et.team_name
     FROM event_team_members etm
     LEFT JOIN event_teams et ON et.id = etm.team_id
     WHERE etm.event_id = ?
       AND etm.member_id = ?
       AND etm.status IN ('pending','accepted')
     LIMIT 1`,
    [eventId, memberId]
  );
  return rows[0] || null;
};

const createNotification = async ({ userId, title, message, type, referenceId, referenceType }) => {
  const id = uuidv4();
  await db.query(
    `INSERT INTO notifications
      (id, user_id, title, message, notification_type, reference_id, reference_type, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, title, message, type || 'system', referenceId || null, referenceType || null]
  );
  return id;
};

const getTeamSettings = async (req, res) => {
  try {
    const settings = await getSettings(req.params.eventId);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const saveTeamSettings = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const {
      sport_type,
      category,
      min_age,
      max_age,
      min_members,
      max_members,
      max_teams,
      registration_deadline,
      requires_admin_approval,
    } = req.body;

    if (!registration_deadline) {
      return res.status(400).json({ message: 'Registration deadline is required.' });
    }

    const [events] = await db.query('SELECT id FROM events WHERE id = ? LIMIT 1', [eventId]);
    if (events.length === 0) return res.status(404).json({ message: 'Event not found.' });

    const [existing] = await db.query('SELECT id FROM event_team_settings WHERE event_id = ? LIMIT 1', [eventId]);

    if (existing.length > 0) {
      await db.query(
        `UPDATE event_team_settings SET
          sport_type = ?, category = ?, min_age = ?, max_age = ?,
          min_members = ?, max_members = ?, max_teams = ?,
          registration_deadline = ?, requires_admin_approval = ?
         WHERE event_id = ?`,
        [
          sport_type || 'Basketball',
          category || 'mixed',
          Number(min_age || 15),
          Number(max_age || 30),
          Number(min_members || 5),
          Number(max_members || 12),
          Number(max_teams || 8),
          registration_deadline,
          requires_admin_approval ? 1 : 0,
          eventId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO event_team_settings
          (id, event_id, sport_type, category, min_age, max_age, min_members, max_members, max_teams, registration_deadline, requires_admin_approval)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), eventId,
          sport_type || 'Basketball',
          category || 'mixed',
          Number(min_age || 15),
          Number(max_age || 30),
          Number(min_members || 5),
          Number(max_members || 12),
          Number(max_teams || 8),
          registration_deadline,
          requires_admin_approval ? 1 : 0,
        ]
      );
    }

    res.json({ message: 'Sports/team settings saved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getAdminTeams = async (req, res) => {
  try {
    const eventId = req.query.event_id || null;
    const params = [];
    let where = '';
    if (eventId) {
      where = 'WHERE et.event_id = ?';
      params.push(eventId);
    }
    const [rows] = await db.query(
      `SELECT et.*, e.title AS event_name,
              cm.member_id AS captain_kk_id,
              CONCAT(cm.first_name, ' ', cm.last_name) AS captain_name,
              COUNT(CASE WHEN etm.status = 'accepted' THEN 1 END) AS accepted_count,
              COUNT(CASE WHEN etm.status = 'pending' THEN 1 END) AS pending_count
       FROM event_teams et
       LEFT JOIN events e ON e.id = et.event_id
       LEFT JOIN members cm ON cm.id = et.captain_member_id
       LEFT JOIN event_team_members etm ON etm.team_id = et.id
       ${where}
       GROUP BY et.id
       ORDER BY e.event_date DESC, et.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getTeamDetails = async (req, res) => {
  try {
    const [teams] = await db.query(
      `SELECT et.*, e.title AS event_name,
              cm.member_id AS captain_kk_id,
              CONCAT(cm.first_name, ' ', cm.last_name) AS captain_name
       FROM event_teams et
       LEFT JOIN events e ON e.id = et.event_id
       LEFT JOIN members cm ON cm.id = et.captain_member_id
       WHERE et.id = ?
       LIMIT 1`,
      [req.params.teamId]
    );
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });

    const [members] = await db.query(
      `SELECT etm.*, m.member_id AS kk_id, m.first_name, m.last_name, m.contact_number, m.sex, m.age,
              ml.purok
       FROM event_team_members etm
       LEFT JOIN members m ON m.id = etm.member_id
       LEFT JOIN member_location ml ON ml.member_id = m.id
       WHERE etm.team_id = ?
       ORDER BY etm.role DESC, m.last_name ASC`,
      [req.params.teamId]
    );

    res.json({ team: teams[0], members });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const approveRejectTeam = async (req, res) => {
  try {
    const { status, admin_remarks } = req.body;
    if (!['approved', 'rejected', 'locked'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved, rejected, or locked.' });
    }

    const [result] = await db.query(
      `UPDATE event_teams
       SET status = ?, admin_remarks = ?, approved_by = ?, approved_at = NOW()
       WHERE id = ?`,
      [status, admin_remarks || null, getUserId(req), req.params.teamId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Team not found.' });
    res.json({ message: `Team ${status} successfully.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getMyTeam = async (req, res) => {
  try {
    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [teams] = await db.query(
      `SELECT et.*
       FROM event_teams et
       WHERE et.event_id = ? AND et.captain_member_id = ?
       LIMIT 1`,
      [req.params.eventId, member.id]
    );

    if (teams.length === 0) {
      const [joined] = await db.query(
        `SELECT et.*, etm.role AS my_role, etm.status AS my_status
         FROM event_team_members etm
         LEFT JOIN event_teams et ON et.id = etm.team_id
         WHERE etm.event_id = ? AND etm.member_id = ? AND etm.status IN ('pending','accepted')
         LIMIT 1`,
        [req.params.eventId, member.id]
      );
      return res.json({ team: joined[0] || null, members: [] });
    }

    const teamId = teams[0].id;
    const [members] = await db.query(
      `SELECT etm.*, m.member_id AS kk_id, m.first_name, m.last_name, m.contact_number, m.age, m.sex
       FROM event_team_members etm
       LEFT JOIN members m ON m.id = etm.member_id
       WHERE etm.team_id = ?
       ORDER BY etm.role DESC, m.last_name ASC`,
      [teamId]
    );

    res.json({ team: teams[0], members });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const { team_name } = req.body;
    if (!team_name || !team_name.trim()) return res.status(400).json({ message: 'Team name is required.' });

    const settings = await getSettings(eventId);
    if (!settings) return res.status(400).json({ message: 'This event is not configured as a sports/team event.' });
    if (isDeadlineClosed(settings)) return res.status(400).json({ message: 'Team registration deadline has passed.' });

    const member = await getMyMember(getUserId(req));
    const eligibilityError = ensureEligibleMember(member, settings);
    if (eligibilityError) return res.status(400).json({ message: eligibilityError });

    const blocking = await hasBlockingMembership(eventId, member.id);
    if (blocking) return res.status(409).json({ message: 'You already have a team or invitation for this event.' });

    const [teamCount] = await db.query('SELECT COUNT(*) AS total FROM event_teams WHERE event_id = ?', [eventId]);
    if (teamCount[0].total >= Number(settings.max_teams)) {
      return res.status(400).json({ message: 'Maximum number of teams has been reached.' });
    }

    const teamId = uuidv4();
    await db.query(
      `INSERT INTO event_teams (id, event_id, captain_member_id, team_name, status)
       VALUES (?, ?, ?, ?, 'draft')`,
      [teamId, eventId, member.id, team_name.trim()]
    );
    await db.query(
      `INSERT INTO event_team_members (id, event_id, team_id, member_id, role, status, invited_by_member_id, accepted_at)
       VALUES (?, ?, ?, ?, 'captain', 'accepted', ?, NOW())`,
      [uuidv4(), eventId, teamId, member.id, member.id]
    );

    res.status(201).json({ message: 'Team created successfully.', team_id: teamId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'You already created a team for this event.' });
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const updateTeam = async (req, res) => {
  try {
    const { team_name } = req.body;
    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [teams] = await db.query('SELECT * FROM event_teams WHERE id = ? LIMIT 1', [req.params.teamId]);
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });
    const team = teams[0];
    if (team.captain_member_id !== member.id) return res.status(403).json({ message: 'Only the team captain can edit this team.' });

    const settings = await getSettings(team.event_id);
    if (isDeadlineClosed(settings)) return res.status(400).json({ message: 'Registration deadline has passed. Team can no longer be edited.' });
    if (['submitted', 'locked', 'rejected'].includes(team.status)) return res.status(400).json({ message: 'Submitted/locked/rejected teams cannot be edited.' });

    await db.query('UPDATE event_teams SET team_name = ? WHERE id = ?', [team_name || team.team_name, team.id]);
    res.json({ message: 'Team updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const eligibleMembers = async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const settings = await getSettings(eventId);
    if (!settings) return res.status(400).json({ message: 'This event is not configured as a sports/team event.' });

    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [rows] = await db.query(
      `SELECT m.id, m.member_id, m.first_name, m.last_name, m.age, m.sex, m.contact_number,
              ml.purok,
              CASE
                WHEN EXISTS (SELECT 1 FROM event_team_members etm WHERE etm.event_id = ? AND etm.member_id = m.id AND etm.status = 'accepted') THEN 'already_joined'
                WHEN EXISTS (SELECT 1 FROM event_team_members etm WHERE etm.event_id = ? AND etm.member_id = m.id AND etm.status = 'pending') THEN 'pending_invitation'
                ELSE 'available'
              END AS availability_status
       FROM members m
       LEFT JOIN member_location ml ON ml.member_id = m.id
       WHERE m.verification_status = 'approved'
         AND m.id <> ?
         AND (? = 'mixed' OR (? = 'men' AND m.sex = 'male') OR (? = 'women' AND m.sex = 'female'))
         AND m.age BETWEEN ? AND ?
       ORDER BY m.last_name ASC, m.first_name ASC`,
      [eventId, eventId, member.id, settings.category, settings.category, settings.category, settings.min_age, settings.max_age]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const inviteMember = async (req, res) => {
  try {
    const { invited_member_id } = req.body;
    if (!invited_member_id) return res.status(400).json({ message: 'Invited member is required.' });

    const captain = await getMyMember(getUserId(req));
    if (!captain) return res.status(404).json({ message: 'Captain member profile not found.' });

    const [teams] = await db.query(
      `SELECT et.*, e.title AS event_title
       FROM event_teams et
       LEFT JOIN events e ON e.id = et.event_id
       WHERE et.id = ? LIMIT 1`,
      [req.params.teamId]
    );
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });
    const team = teams[0];
    if (team.captain_member_id !== captain.id) return res.status(403).json({ message: 'Only the team captain can invite members.' });

    const settings = await getSettings(team.event_id);
    if (isDeadlineClosed(settings)) return res.status(400).json({ message: 'Registration deadline has passed. Invitations are closed.' });
    if (['submitted', 'locked', 'rejected'].includes(team.status)) return res.status(400).json({ message: 'Submitted/locked/rejected teams cannot send new invitations.' });

    const [acceptedCount] = await db.query(
      `SELECT COUNT(*) AS total FROM event_team_members WHERE team_id = ? AND status IN ('pending','accepted')`,
      [team.id]
    );
    if (acceptedCount[0].total >= Number(settings.max_members)) {
      return res.status(400).json({ message: 'Team already reached the maximum members.' });
    }

    const [invitees] = await db.query('SELECT * FROM members WHERE id = ? LIMIT 1', [invited_member_id]);
    const invitee = invitees[0];
    const eligibilityError = ensureEligibleMember(invitee, settings);
    if (eligibilityError) return res.status(400).json({ message: eligibilityError });

    const blocking = await hasBlockingMembership(team.event_id, invited_member_id);
    if (blocking) return res.status(409).json({ message: 'This member already has a pending invitation or accepted team.' });

    const invitationId = uuidv4();
    await db.query(
      `INSERT INTO team_invitations (id, event_id, team_id, captain_member_id, invited_member_id, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [invitationId, team.event_id, team.id, captain.id, invited_member_id]
    );

    await db.query(
      `INSERT INTO event_team_members (id, event_id, team_id, member_id, role, status, invited_by_member_id)
       VALUES (?, ?, ?, ?, 'member', 'pending', ?)`,
      [uuidv4(), team.event_id, team.id, invited_member_id, captain.id]
    );

    const captainName = `${captain.first_name} ${captain.last_name}`;
    const notificationId = await createNotification({
      userId: invitee.user_id,
      title: 'Team Invitation',
      message: `${captainName} invited you to join ${team.team_name} for ${team.event_title}.`,
      type: 'team_invitation',
      referenceId: invitationId,
      referenceType: 'team_invitation',
    });
    await db.query('UPDATE team_invitations SET notification_id = ? WHERE id = ?', [notificationId, invitationId]);

    res.status(201).json({ message: 'Invitation sent successfully.', invitation_id: invitationId });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const myInvitations = async (req, res) => {
  try {
    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [rows] = await db.query(
      `SELECT ti.*, et.team_name, e.title AS event_name, e.event_date,
              CONCAT(cm.first_name, ' ', cm.last_name) AS captain_name,
              cm.member_id AS captain_kk_id
       FROM team_invitations ti
       LEFT JOIN event_teams et ON et.id = ti.team_id
       LEFT JOIN events e ON e.id = ti.event_id
       LEFT JOIN members cm ON cm.id = ti.captain_member_id
       WHERE ti.invited_member_id = ?
       ORDER BY ti.created_at DESC`,
      [member.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const respondInvitation = async (req, res) => {
  try {
    const { action } = req.body;
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ message: 'Action must be accept or decline.' });

    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [rows] = await db.query('SELECT * FROM team_invitations WHERE id = ? AND invited_member_id = ? LIMIT 1', [req.params.invitationId, member.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Invitation not found.' });
    const invitation = rows[0];
    if (invitation.status !== 'pending') return res.status(400).json({ message: 'Invitation is no longer pending.' });

    const settings = await getSettings(invitation.event_id);
    if (isDeadlineClosed(settings)) {
      await db.query('UPDATE team_invitations SET status = "expired", responded_at = NOW() WHERE id = ?', [invitation.id]);
      await db.query('UPDATE event_team_members SET status = "expired" WHERE event_id = ? AND team_id = ? AND member_id = ?', [invitation.event_id, invitation.team_id, member.id]);
      return res.status(400).json({ message: 'Invitation expired because registration deadline has passed.' });
    }

    if (action === 'accept') {
      const blocking = await hasBlockingMembership(invitation.event_id, member.id);
      if (blocking && blocking.team_id !== invitation.team_id) {
        return res.status(409).json({ message: 'You already have another pending or accepted team for this event.' });
      }
      await db.query('UPDATE team_invitations SET status = "accepted", responded_at = NOW() WHERE id = ?', [invitation.id]);
      await db.query('UPDATE event_team_members SET status = "accepted", accepted_at = NOW() WHERE event_id = ? AND team_id = ? AND member_id = ?', [invitation.event_id, invitation.team_id, member.id]);
      return res.json({ message: 'Invitation accepted successfully.' });
    }

    await db.query('UPDATE team_invitations SET status = "declined", responded_at = NOW() WHERE id = ?', [invitation.id]);
    await db.query('UPDATE event_team_members SET status = "declined" WHERE event_id = ? AND team_id = ? AND member_id = ?', [invitation.event_id, invitation.team_id, member.id]);
    res.json({ message: 'Invitation declined.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const submitTeam = async (req, res) => {
  try {
    const member = await getMyMember(getUserId(req));
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const [teams] = await db.query('SELECT * FROM event_teams WHERE id = ? LIMIT 1', [req.params.teamId]);
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });
    const team = teams[0];
    if (team.captain_member_id !== member.id) return res.status(403).json({ message: 'Only the team captain can submit this team.' });

    const settings = await getSettings(team.event_id);
    if (isDeadlineClosed(settings)) return res.status(400).json({ message: 'Registration deadline has passed.' });

    const [countRows] = await db.query('SELECT COUNT(*) AS total FROM event_team_members WHERE team_id = ? AND status = "accepted"', [team.id]);
    if (countRows[0].total < Number(settings.min_members)) {
      return res.status(400).json({ message: `Team needs at least ${settings.min_members} accepted members before submission.` });
    }

    const nextStatus = settings.requires_admin_approval ? 'submitted' : 'approved';
    await db.query('UPDATE event_teams SET status = ?, submitted_at = NOW() WHERE id = ?', [nextStatus, team.id]);
    res.json({ message: settings.requires_admin_approval ? 'Team submitted for admin approval.' : 'Team approved successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};


const getTeamInvitations = async (req, res) => {
  try {
    const captain = await getMyMember(getUserId(req));
    if (!captain) return res.status(404).json({ message: 'Captain member profile not found.' });

    const [teams] = await db.query('SELECT * FROM event_teams WHERE id = ? LIMIT 1', [req.params.teamId]);
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });
    const team = teams[0];

    if (team.captain_member_id !== captain.id) {
      return res.status(403).json({ message: 'Only the team captain can view team invitations.' });
    }

    const [rows] = await db.query(
      `SELECT ti.*, m.member_id AS kk_id, m.first_name, m.last_name, m.contact_number, m.age, m.sex,
              ml.purok
       FROM team_invitations ti
       LEFT JOIN members m ON m.id = ti.invited_member_id
       LEFT JOIN member_location ml ON ml.member_id = m.id
       WHERE ti.team_id = ?
       ORDER BY ti.created_at DESC`,
      [team.id]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const cancelInvitation = async (req, res) => {
  try {
    const captain = await getMyMember(getUserId(req));
    if (!captain) return res.status(404).json({ message: 'Captain member profile not found.' });

    const [rows] = await db.query(
      `SELECT ti.*, et.captain_member_id, et.status AS team_status
       FROM team_invitations ti
       LEFT JOIN event_teams et ON et.id = ti.team_id
       WHERE ti.id = ?
       LIMIT 1`,
      [req.params.invitationId]
    );

    if (rows.length === 0) return res.status(404).json({ message: 'Invitation not found.' });
    const invitation = rows[0];

    if (invitation.captain_member_id !== captain.id) {
      return res.status(403).json({ message: 'Only the team captain can cancel this invitation.' });
    }

    const settings = await getSettings(invitation.event_id);
    if (isDeadlineClosed(settings)) {
      return res.status(400).json({ message: 'Registration deadline has passed. Invitations can no longer be cancelled.' });
    }

    if (['submitted', 'locked', 'rejected'].includes(invitation.team_status)) {
      return res.status(400).json({ message: 'This team status no longer allows invitation cancellation.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending invitations can be cancelled.' });
    }

    await db.query('UPDATE team_invitations SET status = "cancelled", responded_at = NOW() WHERE id = ?', [invitation.id]);
    await db.query(
      `UPDATE event_team_members
       SET status = 'cancelled'
       WHERE event_id = ? AND team_id = ? AND member_id = ? AND status = 'pending'`,
      [invitation.event_id, invitation.team_id, invitation.invited_member_id]
    );

    res.json({ message: 'Invitation cancelled successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const removeTeamMember = async (req, res) => {
  try {
    const captain = await getMyMember(getUserId(req));
    if (!captain) return res.status(404).json({ message: 'Captain member profile not found.' });

    const [teams] = await db.query('SELECT * FROM event_teams WHERE id = ? LIMIT 1', [req.params.teamId]);
    if (teams.length === 0) return res.status(404).json({ message: 'Team not found.' });
    const team = teams[0];

    if (team.captain_member_id !== captain.id) {
      return res.status(403).json({ message: 'Only the team captain can remove members.' });
    }

    const settings = await getSettings(team.event_id);
    if (isDeadlineClosed(settings)) {
      return res.status(400).json({ message: 'Registration deadline has passed. Team roster can no longer be edited.' });
    }

    if (['submitted', 'locked', 'rejected'].includes(team.status)) {
      return res.status(400).json({ message: 'This team status no longer allows roster editing.' });
    }

    const memberId = req.params.memberId;
    if (memberId === captain.id) {
      return res.status(400).json({ message: 'Captain cannot remove himself.' });
    }

    const [members] = await db.query(
      `SELECT * FROM event_team_members
       WHERE team_id = ? AND member_id = ? AND role <> 'captain' AND status IN ('pending','accepted')
       LIMIT 1`,
      [team.id, memberId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found in this team or already inactive.' });
    }

    await db.query(
      `UPDATE event_team_members
       SET status = 'removed'
       WHERE team_id = ? AND member_id = ? AND role <> 'captain'`,
      [team.id, memberId]
    );

    await db.query(
      `UPDATE team_invitations
       SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
           responded_at = CASE WHEN status = 'pending' THEN NOW() ELSE responded_at END
       WHERE team_id = ? AND invited_member_id = ?`,
      [team.id, memberId]
    );

    res.json({ message: 'Member removed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getAdminDashboard = async (req, res) => {
  try {
    const eventId = req.query.event_id || null;
    const params = [];
    let where = '';

    if (eventId) {
      where = 'WHERE et.event_id = ?';
      params.push(eventId);
    }

    const [rows] = await db.query(
      `SELECT
          COUNT(*) AS total_teams,
          SUM(CASE WHEN et.status = 'draft' THEN 1 ELSE 0 END) AS draft_teams,
          SUM(CASE WHEN et.status = 'submitted' THEN 1 ELSE 0 END) AS submitted_teams,
          SUM(CASE WHEN et.status = 'approved' THEN 1 ELSE 0 END) AS approved_teams,
          SUM(CASE WHEN et.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_teams,
          SUM(CASE WHEN et.status = 'locked' THEN 1 ELSE 0 END) AS locked_teams,
          COUNT(CASE WHEN etm.status = 'accepted' THEN 1 END) AS accepted_members,
          COUNT(CASE WHEN etm.status = 'pending' THEN 1 END) AS pending_members
       FROM event_teams et
       LEFT JOIN event_team_members etm ON etm.team_id = et.id
       ${where}`,
      params
    );

    res.json(rows[0] || {});
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const exportTeamsCsv = async (req, res) => {
  try {
    const eventId = req.query.event_id;
    const fields = (req.query.fields || 'event_name,team_name,team_status,captain_name,captain_kk_id,captain_contact,member_name,member_kk_id,contact_number,purok,invitation_status,date_accepted,date_submitted,date_approved')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    if (!eventId) return res.status(400).send('event_id is required');

    const allowed = {
      event_name: 'Event Name',
      team_name: 'Team Name',
      team_status: 'Team Status',
      captain_name: 'Captain Name',
      captain_kk_id: 'Captain KK ID',
      captain_contact: 'Captain Contact Number',
      member_name: 'Member Name',
      member_kk_id: 'Member KK ID',
      contact_number: 'Contact Number',
      purok: 'Purok',
      invitation_status: 'Invitation Status',
      date_accepted: 'Date Accepted',
      date_submitted: 'Date Submitted',
      date_approved: 'Date Approved'
    };

    const selected = fields.filter((f) => allowed[f]);
    if (selected.length === 0) return res.status(400).send('No valid export fields selected');

    const [rows] = await db.query(
      `SELECT e.title AS event_name,
              et.team_name,
              et.status AS team_status,
              CONCAT(cm.first_name, ' ', cm.last_name) AS captain_name,
              cm.member_id AS captain_kk_id,
              cm.contact_number AS captain_contact,
              CONCAT(m.first_name, ' ', m.last_name) AS member_name,
              m.member_id AS member_kk_id,
              m.contact_number,
              ml.purok,
              etm.status AS invitation_status,
              etm.accepted_at AS date_accepted,
              et.submitted_at AS date_submitted,
              et.approved_at AS date_approved
       FROM event_team_members etm
       LEFT JOIN event_teams et ON et.id = etm.team_id
       LEFT JOIN events e ON e.id = et.event_id
       LEFT JOIN members cm ON cm.id = et.captain_member_id
       LEFT JOIN members m ON m.id = etm.member_id
       LEFT JOIN member_location ml ON ml.member_id = m.id
       WHERE et.event_id = ?
         AND etm.status IN ('pending','accepted')
       ORDER BY et.team_name ASC, etm.role DESC, m.last_name ASC`,
      [eventId]
    );

    const escapeCsv = (value) => {
      const v = value === null || value === undefined ? '' : String(value);
      return `"${v.replace(/"/g, '""')}"`;
    };

    const csv = [selected.map((f) => allowed[f]).join(',')]
      .concat(rows.map((row) => selected.map((f) => escapeCsv(row[f])).join(',')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="team-registration-report.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).send(error.message);
  }
};

module.exports = {
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
};
