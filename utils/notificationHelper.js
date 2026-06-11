const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const normalizeType = (type) => type || 'system';

/**
 * Sends a notification to every verified/approved member user.
 * It prevents duplicate notifications for the same user + reference + type.
 */
const notifyVerifiedMembers = async ({
  title,
  message,
  notificationType = 'system',
  referenceId = null,
  referenceType = null,
}) => {
  if (!title || !message) return { inserted: 0 };

  const type = normalizeType(notificationType);

  const [members] = await db.query(
    `SELECT DISTINCT m.user_id
     FROM members m
     WHERE m.user_id IS NOT NULL
       AND LOWER(COALESCE(m.verification_status, '')) IN ('approved', 'verified')`
  );

  if (!members.length) return { inserted: 0 };

  let inserted = 0;

  for (const member of members) {
    const userId = member.user_id;

    if (referenceId && referenceType) {
      const [existing] = await db.query(
        `SELECT id
         FROM notifications
         WHERE user_id = ?
           AND notification_type = ?
           AND reference_id = ?
           AND reference_type = ?
         LIMIT 1`,
        [userId, type, referenceId, referenceType]
      );

      if (existing.length > 0) continue;
    }

    await db.query(
      `INSERT INTO notifications
       (id, user_id, title, message, notification_type, reference_id, reference_type, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [uuidv4(), userId, title, message, type, referenceId, referenceType]
    );

    inserted += 1;
  }

  return { inserted };
};

const notifyNewEvent = async ({ eventId, title, eventDate, location, isTeamEvent }) => {
  const dateText = eventDate ? `Date: ${eventDate}` : 'Date: TBA';
  const locationText = location ? `Location: ${location}` : 'Location: TBA';

  if (isTeamEvent) {
    return notifyVerifiedMembers({
      title: '🏀 Team Registration Open',
      message: `${title} has been posted. ${dateText}. ${locationText}. Tap to view details and create your team.`,
      notificationType: 'sports_event',
      referenceId: eventId,
      referenceType: 'event',
    });
  }

  return notifyVerifiedMembers({
    title: '📅 New Event',
    message: `${title} has been posted. ${dateText}. ${locationText}. Tap to view details.`,
    notificationType: 'event',
    referenceId: eventId,
    referenceType: 'event',
  });
};

const notifyNewAnnouncement = async ({ announcementId, title }) => {
  return notifyVerifiedMembers({
    title: '📢 New Announcement',
    message: `${title} has been posted. Tap to read more.`,
    notificationType: 'announcement',
    referenceId: announcementId,
    referenceType: 'announcement',
  });
};

const notifyNewTransparencyPost = async ({ postId, title, category }) => {
  return notifyVerifiedMembers({
    title: '💰 Transparency Update',
    message: `${title}${category ? ` (${category})` : ''} has been posted. Tap to view details.`,
    notificationType: 'transparency',
    referenceId: postId,
    referenceType: 'transparency_post',
  });
};

const notifyNewReward = async ({ rewardId, name }) => {
  return notifyVerifiedMembers({
    title: '🎁 New Reward Available',
    message: `${name} is now available for redemption.`,
    notificationType: 'reward',
    referenceId: rewardId,
    referenceType: 'reward',
  });
};

module.exports = {
  notifyVerifiedMembers,
  notifyNewEvent,
  notifyNewAnnouncement,
  notifyNewTransparencyPost,
  notifyNewReward,
};
