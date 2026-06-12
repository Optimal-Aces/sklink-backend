const db = require('../config/db');

const getMyPointsHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const [members] = await db.query(
      'SELECT id, points_balance FROM members WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const member = members[0];

    const [history] = await db.query(
      `
      SELECT
        pl.id,
        pl.member_id,
        pl.transaction_type,
        pl.points,
        pl.source_type,
        pl.source_id,
        pl.created_at,
        CASE
          WHEN pl.source_type = 'event_attendance' THEN COALESCE(e.title, 'Event Attendance')
          WHEN pl.source_type = 'reward_redemption' THEN COALESCE(r.name, 'Reward Redemption')
          WHEN pl.source_type = 'manual_adjustment' THEN 'Manual Adjustment'
          ELSE 'Points Transaction'
        END AS source_title
      FROM points_ledger pl
      LEFT JOIN events e
        ON pl.source_type = 'event_attendance'
       AND pl.source_id = e.id
      LEFT JOIN rewards r
        ON pl.source_type = 'reward_redemption'
       AND pl.source_id = r.id
      WHERE pl.member_id = ?
      ORDER BY pl.created_at DESC
      LIMIT 100
      `,
      [member.id]
    );

    res.json({
      points_balance: member.points_balance || 0,
      history,
    });
  } catch (error) {
    console.error('GET MY POINTS HISTORY ERROR:', error);
    res.status(500).json({
      message: 'Failed to load points history.',
      error: error.message,
    });
  }
};

module.exports = {
  getMyPointsHistory,
};
