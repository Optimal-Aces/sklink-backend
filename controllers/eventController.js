const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { notifyNewEvent } = require('../utils/notificationHelper');

const parseBool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

const addTeamSettingsToEvents = async (events) => {
  if (!events.length) return events;
  const ids = events.map((e) => e.id);
  const [settings] = await db.query(
    `SELECT * FROM event_team_settings WHERE event_id IN (?)`,
    [ids]
  );
  const map = new Map(settings.map((s) => [s.event_id, s]));
  return events.map((e) => ({
    ...e,
    is_team_event: map.has(e.id) ? 1 : 0,
    team_settings: map.get(e.id) || null,
  }));
};

const upsertTeamSettings = async (eventId, body) => {
  if (!parseBool(body.is_team_event)) return;

  const deadline = body.registration_deadline;
  if (!deadline) throw new Error('Registration deadline is required for sports/team events.');

  const payload = {
    sport_type: body.sport_type || 'Basketball',
    category: body.category || 'mixed',
    min_age: Number(body.min_age || 15),
    max_age: Number(body.max_age || 30),
    min_members: Number(body.min_members || 5),
    max_members: Number(body.max_members || 12),
    max_teams: Number(body.max_teams || 8),
    registration_deadline: deadline,
    requires_admin_approval: parseBool(body.requires_admin_approval) ? 1 : 0,
  };

  const [existing] = await db.query('SELECT id FROM event_team_settings WHERE event_id = ? LIMIT 1', [eventId]);
  if (existing.length > 0) {
    await db.query(
      `UPDATE event_team_settings SET
       sport_type=?, category=?, min_age=?, max_age=?, min_members=?, max_members=?, max_teams=?, registration_deadline=?, requires_admin_approval=?
       WHERE event_id=?`,
      [payload.sport_type, payload.category, payload.min_age, payload.max_age, payload.min_members, payload.max_members, payload.max_teams, payload.registration_deadline, payload.requires_admin_approval, eventId]
    );
  } else {
    await db.query(
      `INSERT INTO event_team_settings
       (id, event_id, sport_type, category, min_age, max_age, min_members, max_members, max_teams, registration_deadline, requires_admin_approval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), eventId, payload.sport_type, payload.category, payload.min_age, payload.max_age, payload.min_members, payload.max_members, payload.max_teams, payload.registration_deadline, payload.requires_admin_approval]
    );
  }
};

const removeTeamSettingsIfNeeded = async (eventId, body) => {
  if (body.is_team_event !== undefined && !parseBool(body.is_team_event)) {
    await db.query('DELETE FROM event_team_settings WHERE event_id = ?', [eventId]);
  }
};

// Get all events
const getAllEvents = async (req, res) => {
  try {
    const [events] = await db.query(
      `SELECT e.*, u.first_name, u.last_name 
       FROM events e
       LEFT JOIN users u ON e.created_by = u.id
       ORDER BY e.event_date DESC`
    );
    res.json(await addTeamSettingsToEvents(events));
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get single event
const getEventById = async (req, res) => {
  try {
    const [events] = await db.query(
      `SELECT e.*, u.first_name, u.last_name 
       FROM events e
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (events.length === 0) return res.status(404).json({ message: 'Event not found.' });
    const withSettings = await addTeamSettingsToEvents(events);
    res.json(withSettings[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Create event
const createEvent = async (req, res) => {
  const { title, description, location, event_date, points_reward } = req.body;
  const isTeamEvent = parseBool(req.body.is_team_event);
  const eventStatus = req.body.status || 'published';

  if (!title || !event_date) {
    return res.status(400).json({ message: 'Title and event date are required.' });
  }

  try {
    const id = uuidv4();
    await db.query(
      `INSERT INTO events (id, title, description, location, event_date, points_reward, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description || null, location || null, event_date, points_reward || 0, eventStatus, req.user.id]
    );

    await upsertTeamSettings(id, req.body);

    if (eventStatus === 'published') {
      await notifyNewEvent({
        eventId: id,
        title,
        eventDate: event_date,
        location,
        isTeamEvent,
      });
    }

    res.status(201).json({ message: 'Event created successfully.', id });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Update event
const updateEvent = async (req, res) => {
  const { title, description, location, event_date, points_reward, status } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE events SET
        title = ?, description = ?, location = ?,
        event_date = ?, points_reward = ?, status = ?
       WHERE id = ?`,
      [title, description, location, event_date, points_reward, status, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Event not found.' });

    await removeTeamSettingsIfNeeded(req.params.id, req.body);
    await upsertTeamSettings(req.params.id, req.body);

    res.json({ message: 'Event updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Delete event
const deleteEvent = async (req, res) => {
  try {
    await db.query('DELETE FROM event_team_settings WHERE event_id = ?', [req.params.id]);
    await db.query('DELETE FROM event_team_members WHERE event_id = ?', [req.params.id]);
    await db.query('DELETE FROM team_invitations WHERE event_id = ?', [req.params.id]);
    await db.query('DELETE FROM event_teams WHERE event_id = ?', [req.params.id]);
    const [result] = await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Event not found.' });
    res.json({ message: 'Event deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Publish event
const publishEvent = async (req, res) => {
  try {
    const [events] = await db.query('SELECT * FROM events WHERE id = ? LIMIT 1', [req.params.id]);
    if (events.length === 0) return res.status(404).json({ message: 'Event not found.' });

    const event = events[0];
    const wasPublished = event.status === 'published';

    const [result] = await db.query('UPDATE events SET status = ? WHERE id = ?', ['published', req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Event not found.' });

    if (!wasPublished) {
      const [settings] = await db.query('SELECT id FROM event_team_settings WHERE event_id = ? LIMIT 1', [req.params.id]);
      await notifyNewEvent({
        eventId: event.id,
        title: event.title,
        eventDate: event.event_date,
        location: event.location,
        isTeamEvent: settings.length > 0,
      });
    }

    res.json({ message: 'Event published successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

// Get event attendance
const getEventAttendance = async (req, res) => {
  try {
    const [logs] = await db.query(
      `SELECT a.*, m.first_name, m.last_name, m.member_id
       FROM attendance_logs a
       LEFT JOIN members m ON a.member_id = m.id
       WHERE a.event_id = ?
       ORDER BY a.scan_timestamp DESC`,
      [req.params.id]
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  getEventAttendance
};
