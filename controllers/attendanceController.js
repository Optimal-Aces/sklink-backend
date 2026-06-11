const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Scan QR and log attendance
const scanAttendance = async (req, res) => {
  const { event_id, member_id } = req.body;

  if (!event_id || !member_id) {
    return res.status(400).json({ message: 'event_id and member_id are required.' });
  }

  try {
    // Check if event exists and is ongoing or published
    const [events] = await db.query(
      'SELECT * FROM events WHERE id = ? AND status IN (?, ?)',
      [event_id, 'published', 'ongoing']
    );
    if (events.length === 0) {
      return res.status(404).json({ message: 'Event not found or not active.' });
    }

    // Check if member exists and is approved
    const [members] = await db.query(
      'SELECT * FROM members WHERE id = ? AND verification_status = ?',
      [member_id, 'approved']
    );
    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found or not verified.' });
    }

    // Check for duplicate attendance
    const [existing] = await db.query(
      'SELECT id FROM attendance_logs WHERE event_id = ? AND member_id = ?',
      [event_id, member_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Duplicate attendance. Member already scanned.' });
    }

    // Log attendance
    const id = uuidv4();
    await db.query(
      `INSERT INTO attendance_logs (id, event_id, member_id, scanned_by, verification_status)
       VALUES (?, ?, ?, ?, 'verified')`,
      [id, event_id, member_id, req.user.id]
    );

    // Award points
    const points = events[0].points_reward;
    if (points > 0) {
      // Add to points ledger
      await db.query(
        `INSERT INTO points_ledger (id, member_id, transaction_type, points, source_type, source_id)
         VALUES (?, ?, 'earned', ?, 'event_attendance', ?)`,
        [uuidv4(), member_id, points, event_id]
      );

      // Update member points balance
      await db.query(
        'UPDATE members SET points_balance = points_balance + ? WHERE id = ?',
        [points, member_id]
      );
    }

    res.status(201).json({
      message: 'Attendance recorded successfully.',
      member: {
        name: `${members[0].first_name} ${members[0].last_name}`,
        member_id: members[0].member_id,
        points_earned: points
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

module.exports = { scanAttendance };