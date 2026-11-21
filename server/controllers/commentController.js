const Comment = require('../models/Comment');
const Ticket = require('../models/Ticket');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../realtime');

const isMember = (ws, userId) => ws?.members.some((m) => m.user.toString() === String(userId));

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
  const ws = await Workspace.findById(ticket.workspace);
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
