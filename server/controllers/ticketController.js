const Ticket = require('../models/Ticket');
const Workspace = require('../models/Workspace');
const Activity = require('../models/Activity');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../realtime');
const { logActivity, notify } = require('../utils/activity');

// `members.user` may be a raw ObjectId or a populated document depending on
// the query, so always compare ids, never the whole value.
const idOf = (ref) => String(ref?._id || ref);
const memberOf = (ws, userId) => ws?.members.find(m => idOf(m.user) === String(userId));
const POPULATE = [{ path: 'assignedTo', select: 'name email' }, { path: 'createdBy', select: 'name email' }];

/** Normalise a label array: trimmed, lowercased, deduped, max 8 labels of 24 chars. */
function cleanLabels(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  for (const raw of input) {
    const label = String(raw || '').trim().toLowerCase().slice(0, 24);
    if (label) seen.add(label);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

function parseDate(value) {
  if (value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

exports.create = asyncHandler(async (req, res) => {
  const { title, description = '', priority = 'MEDIUM', assignedTo = null, workspace, labels, dueDate, points, status } = req.body;
  const ws = await Workspace.findById(workspace).populate('members.user', 'name email');
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  if (assignedTo && !memberOf(ws, assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });

  const due = dueDate === undefined ? null : parseDate(dueDate);
  if (due === undefined) return res.status(400).json({ message: 'Invalid due date' });

  const ticket = await Ticket.create({
    title, description, priority, assignedTo, workspace, createdBy: req.user._id,
    labels: cleanLabels(labels), dueDate: due, points: Number(points) || 0,
    // Let a ticket be born in a column instead of always landing in TODO.
    ...(status ? { status, completedAt: status === 'DONE' ? new Date() : null } : {})
  });
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, 'ticket:created', { ticket: populated, actorId: String(req.user._id) });

  await logActivity({ ticket: ticket._id, workspace: ws._id, actor: req.user._id, action: 'created', detail: `created “${ticket.title}”` });
  if (assignedTo && String(assignedTo) !== String(req.user._id)) {
    await notify({
      userId: assignedTo, actor: req.user._id, workspace: ws._id, ticket: ticket._id,
      type: 'ASSIGNED', message: `${req.user.name} assigned you “${ticket.title}”`
    });
  }
  res.status(201).json(populated);
});

exports.listByWorkspace = asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.params.workspaceId);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const includeArchived = req.query.archived === 'true';
  const tickets = await Ticket.find({ workspace: ws._id, archived: includeArchived ? true : false })
    .populate(POPULATE).sort({ createdAt: -1 });
  res.json(tickets);
});

// Full edit: title, description, priority, assignee, status, labels, dueDate, points.
exports.update = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  const member = memberOf(ws, req.user._id);
  if (!member) return res.status(403).json({ message: 'Workspace access denied' });

  const { title, description, priority, assignedTo, status, labels, dueDate, points } = req.body;
  const changes = [];
  const previousAssignee = ticket.assignedTo ? String(ticket.assignedTo) : null;

  if (title !== undefined) {
    const next = String(title).trim();
    if (!next) return res.status(400).json({ message: 'Title is required' });
    if (next !== ticket.title) changes.push('title');
    ticket.title = next;
  }
  if (description !== undefined) {
    if (String(description) !== ticket.description) changes.push('description');
    ticket.description = String(description);
  }
  if (priority !== undefined && priority !== ticket.priority) {
    ticket.priority = priority;
    changes.push(`priority → ${priority}`);
  }
  if (status !== undefined && status !== ticket.status) {
    ticket.status = status;
    ticket.completedAt = status === 'DONE' ? new Date() : null;
    changes.push(`status → ${status.replace('_', ' ')}`);
  }
  if (labels !== undefined) {
    const next = cleanLabels(labels);
    if (next.join(',') !== ticket.labels.join(',')) changes.push('labels');
    ticket.labels = next;
  }
  if (dueDate !== undefined) {
    const parsed = parseDate(dueDate);
    if (parsed === undefined) return res.status(400).json({ message: 'Invalid due date' });
    ticket.dueDate = parsed;
    changes.push(parsed ? `due ${parsed.toISOString().slice(0, 10)}` : 'due date cleared');
  }
  if (points !== undefined) {
    const value = Number(points);
    if (Number.isNaN(value) || value < 0) return res.status(400).json({ message: 'Points must be a positive number' });
    if (value !== ticket.points) changes.push(`points → ${value}`);
    ticket.points = value;
  }
  if (assignedTo !== undefined) {
    if (assignedTo && !memberOf(ws, assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });
    ticket.assignedTo = assignedTo || null;
    changes.push(assignedTo ? 'assignee changed' : 'unassigned');
  }

  await ticket.save();
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, 'ticket:updated', { ticket: populated, actorId: String(req.user._id) });

  if (changes.length) {
    await logActivity({ ticket: ticket._id, workspace: ws._id, actor: req.user._id, action: 'updated', detail: changes.join(' · ') });
  }
  const nextAssignee = ticket.assignedTo ? String(ticket.assignedTo) : null;
  if (nextAssignee && nextAssignee !== previousAssignee && nextAssignee !== String(req.user._id)) {
    await notify({
      userId: nextAssignee, actor: req.user._id, workspace: ws._id, ticket: ticket._id,
      type: 'ASSIGNED', message: `${req.user.name} assigned you “${ticket.title}”`
    });
  }
  res.json(populated);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const from = ticket.status;
  const updated = await Ticket.findByIdAndUpdate(ticket._id, {
    status: req.body.status,
    completedAt: req.body.status === 'DONE' ? new Date() : null
  }, { new: true, runValidators: true }).populate(POPULATE);
  realtime.emit(ws._id, 'ticket:updated', { ticket: updated, actorId: String(req.user._id) });
  if (from !== updated.status) {
    await logActivity({
      ticket: ticket._id, workspace: ws._id, actor: req.user._id, action: 'moved',
      detail: `moved ${from.replace('_', ' ')} → ${updated.status.replace('_', ' ')}`
    });
  }
  res.json(updated);
});

/* ------------------------------- subtasks ------------------------------- */

exports.addSubtask = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: 'Subtask title is required' });
  ticket.subtasks.push({ title: title.slice(0, 200), done: false });
  await ticket.save();
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, 'ticket:updated', { ticket: populated, actorId: String(req.user._id) });
  res.status(201).json(populated);
});

exports.updateSubtask = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const sub = ticket.subtasks.id(req.params.subtaskId);
  if (!sub) return res.status(404).json({ message: 'Subtask not found' });
  if (req.body.done !== undefined) sub.done = Boolean(req.body.done);
  if (req.body.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ message: 'Subtask title is required' });
    sub.title = title.slice(0, 200);
  }
  await ticket.save();
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, 'ticket:updated', { ticket: populated, actorId: String(req.user._id) });
  res.json(populated);
});

exports.removeSubtask = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const sub = ticket.subtasks.id(req.params.subtaskId);
  if (!sub) return res.status(404).json({ message: 'Subtask not found' });
  sub.deleteOne();
  await ticket.save();
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, 'ticket:updated', { ticket: populated, actorId: String(req.user._id) });
  res.json(populated);
});

/* ------------------------------ archive / bulk ------------------------------ */

exports.archive = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  const member = memberOf(ws, req.user._id);
  if (!member) return res.status(403).json({ message: 'Workspace access denied' });
  const archiving = req.body.archived !== false;
  if (archiving && member.role !== 'ADMIN' && ticket.createdBy.toString() !== String(req.user._id)) {
    return res.status(403).json({ message: 'Only the creator or a workspace admin can archive this ticket' });
  }
  ticket.archived = archiving;
  ticket.archivedAt = archiving ? new Date() : null;
  await ticket.save();
  const populated = await ticket.populate(POPULATE);
  realtime.emit(ws._id, archiving ? 'ticket:deleted' : 'ticket:created', {
    id: String(ticket._id), ticket: populated, workspace: String(ws._id), actorId: String(req.user._id)
  });
  await logActivity({
    ticket: ticket._id, workspace: ws._id, actor: req.user._id,
    action: archiving ? 'archived' : 'restored', detail: archiving ? 'archived this ticket' : 'restored this ticket'
  });
  res.json(populated);
});

exports.bulk = asyncHandler(async (req, res) => {
  const { ids, status, priority, assignedTo, archive } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'No tickets selected' });
  if (ids.length > 100) return res.status(400).json({ message: 'Select at most 100 tickets' });

  const tickets = await Ticket.find({ _id: { $in: ids } });
  const workspaceIds = new Set(tickets.map(t => String(t.workspace)));
  if (workspaceIds.size !== 1) return res.status(400).json({ message: 'All tickets must belong to one workspace' });
  const ws = await Workspace.findById(tickets[0]?.workspace);
  const member = memberOf(ws, req.user._id);
  if (!member) return res.status(403).json({ message: 'Workspace access denied' });
  if (assignedTo && !memberOf(ws, assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });

  const patch = {};
  if (status !== undefined) {
    patch.status = status;
    patch.completedAt = status === 'DONE' ? new Date() : null;
  }
  if (priority !== undefined) patch.priority = priority;
  if (assignedTo !== undefined) patch.assignedTo = assignedTo || null;
  if (archive !== undefined) {
    patch.archived = Boolean(archive);
    patch.archivedAt = archive ? new Date() : null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ message: 'Nothing to change' });

  await Ticket.updateMany({ _id: { $in: tickets.map(t => t._id) } }, patch);
  const updated = await Ticket.find({ _id: { $in: tickets.map(t => t._id) } }).populate(POPULATE);

  realtime.emit(ws._id, 'ticket:bulk', { tickets: updated, actorId: String(req.user._id) });
  await logActivity({
    ticket: tickets[0]._id, workspace: ws._id, actor: req.user._id, action: 'bulk',
    detail: `bulk-updated ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`
  });
  res.json(updated);
});

/* --------------------------------- export --------------------------------- */

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

exports.exportCsv = asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.params.workspaceId);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const tickets = await Ticket.find({ workspace: ws._id }).populate(POPULATE).sort({ createdAt: -1 });

  const header = ['id', 'title', 'status', 'priority', 'labels', 'points', 'assignee', 'dueDate', 'archived', 'createdAt'];
  const rows = tickets.map(t => [
    t._id, t.title, t.status, t.priority, t.labels.join('|'), t.points,
    t.assignedTo?.name || '', t.dueDate ? t.dueDate.toISOString().slice(0, 10) : '',
    t.archived ? 'yes' : 'no', t.createdAt.toISOString()
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');

  const safeName = String(ws.name).replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName || 'board'}-tickets.csv"`);
  res.send(csv);
});

/* -------------------------------- activity -------------------------------- */

exports.listActivity = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const activity = await Activity.find({ ticket: ticket._id }).populate('actor', 'name email').sort({ createdAt: -1 }).limit(100);
  res.json(activity);
});

exports.remove = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  const member = memberOf(ws, req.user._id);
  if (!member) return res.status(403).json({ message: 'Workspace access denied' });

  const isCreator = ticket.createdBy.toString() === String(req.user._id);
  if (!isCreator && member.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Only the creator or a workspace admin can delete this ticket' });
  }

  await ticket.deleteOne();
  realtime.emit(ws._id, 'ticket:deleted', { id: String(ticket._id), workspace: String(ws._id), actorId: String(req.user._id) });
  res.json({ message: 'Ticket deleted' });
});
