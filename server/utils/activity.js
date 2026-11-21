const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const realtime = require('../realtime');

/**
 * Record a ticket change. Never let audit logging break the request: a failed
 * write here must not roll back a successful ticket edit.
 */
async function logActivity({ ticket, workspace, actor, action, detail = '' }) {
  try {
    const entry = await Activity.create({ ticket, workspace, actor, action, detail });
    const populated = await entry.populate('actor', 'name email');
    realtime.emit(workspace, 'activity:created', {
      activity: populated,
      ticketId: String(ticket),
      actorId: String(actor)
    });
    return populated;
  } catch (err) {
    console.error('activity log failed', err.message);
    return null;
  }
}

/**
 * Create a notification and push it to that user's personal socket room.
 * `actorId` is included so the recipient's own client can dedupe.
 */
async function notify({ userId, actor, workspace = null, ticket = null, type, message }) {
  try {
    const doc = await Notification.create({ user: userId, actor, workspace, ticket, type, message });
    const populated = await doc.populate('actor', 'name email');
    realtime.emitToUser(userId, 'notification:created', { notification: populated });
    return populated;
  } catch (err) {
    console.error('notification failed', err.message);
    return null;
  }
}

/** Pull @name handles out of a body and map them to workspace members. */
function extractMentions(text, workspace) {
  const handles = new Set();
  const re = /@([a-zA-Z0-9._-]{2,40})/g;
  let match;
  while ((match = re.exec(String(text || ''))) !== null) handles.add(match[1].toLowerCase());
  if (!handles.size) return [];

  return (workspace?.members || [])
    .map((m) => m.user)
    .filter((u) => u && typeof u === 'object' && u.name)
    .filter((u) => handles.has(String(u.name).toLowerCase().replace(/\s+/g, '.'))
      || handles.has(String(u.name).toLowerCase().replace(/\s+/g, ''))
      || handles.has(String(u.email || '').split('@')[0].toLowerCase()));
}

module.exports = { logActivity, notify, extractMentions };
