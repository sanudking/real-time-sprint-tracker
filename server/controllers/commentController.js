const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../realtime');
const { logActivity, notify, extractMentions } = require('../utils/activity');

// `members.user` may be a populated document here, so compare ids only.
const isMember = (ws, userId) => ws?.members.some((m) => String(m.user?._id || m.user) === String(userId));

exports.listByTicket = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!isMember(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const comments = await Comment.find({ ticket: ticket._id }).populate('author', 'name email').sort({ createdAt: 1 });
  res.json(comments);
});

exports.create = asyncHandler(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ message: 'Comment cannot be empty' });
  const ticket = await Ticket.findById(req.body.ticket);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace).populate('members.user', 'name email');
  if (!isMember(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });

  const comment = await Comment.create({
    body, ticket: ticket._id, workspace: ws._id, author: req.user._id
  });
  const populated = await comment.populate('author', 'name email');
  realtime.emit(ws._id, 'comment:created', {
    comment: populated,
    ticketId: String(ticket._id),
    actorId: String(req.user._id)
  });

  // @mentions win over the generic "new comment" ping so a person gets one
  // notification, not two.
  const mentioned = extractMentions(body, ws).filter(u => String(u._id) !== String(req.user._id));
  const mentionedIds = new Set(mentioned.map(u => String(u._id)));
  for (const user of mentioned) {
    await notify({
      userId: user._id, actor: req.user._id, workspace: ws._id, ticket: ticket._id,
      type: 'MENTION', message: `${req.user.name} mentioned you on “${ticket.title}”`
    });
  }

  const assigneeId = ticket.assignedTo ? String(ticket.assignedTo) : null;
  if (assigneeId && !mentionedIds.has(assigneeId) && assigneeId !== String(req.user._id)) {
    await notify({
      userId: assigneeId, actor: req.user._id, workspace: ws._id, ticket: ticket._id,
      type: 'COMMENT', message: `${req.user.name} commented on “${ticket.title}”`
    });
  }

  await logActivity({
    ticket: ticket._id, workspace: ws._id, actor: req.user._id, action: 'commented',
    detail: `commented: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
  });
  res.status(201).json(populated);
});

exports.remove = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  const ws = await Workspace.findById(comment.workspace);
  const member = ws?.members.find((m) => m.user.toString() === String(req.user._id));
  if (!member) return res.status(403).json({ message: 'Workspace access denied' });

  const isAuthor = comment.author.toString() === String(req.user._id);
  if (!isAuthor && member.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Only the author or a workspace admin can delete this comment' });
  }
  await comment.deleteOne();
  realtime.emit(comment.workspace, 'comment:deleted', {
    id: String(comment._id),
    ticketId: String(comment.ticket),
    actorId: String(req.user._id)
  });
  res.json({ message: 'Comment deleted' });
});
