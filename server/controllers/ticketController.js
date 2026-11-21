const Ticket = require('../models/Ticket');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../realtime');

const memberOf = (ws, userId) => ws?.members.find(m => m.user.toString() === String(userId));

exports.create = asyncHandler(async (req, res) => {
  const { title, description = '', priority = 'MEDIUM', assignedTo = null, workspace } = req.body;
  const ws = await Workspace.findById(workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  if (assignedTo && !memberOf(ws, assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });
  const ticket = await Ticket.create({ title, description, priority, assignedTo, workspace, createdBy: req.user._id });
  const populated = await ticket.populate([{ path: 'assignedTo', select: 'name email' }, { path: 'createdBy', select: 'name email' }]);
  realtime.emit(ws._id, 'ticket:created', { ticket: populated, actorId: String(req.user._id) });
  res.status(201).json(populated);
});

exports.listByWorkspace = asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.params.workspaceId);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const tickets = await Ticket.find({ workspace: ws._id }).populate('assignedTo', 'name email').populate('createdBy', 'name email').sort({ createdAt: -1 });
  res.json(tickets);
});

// Full edit: title, description, priority, assignee and status.
exports.update = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });

  const { title, description, priority, assignedTo, status } = req.body;
  if (title !== undefined) {
    const next = String(title).trim();
    if (!next) return res.status(400).json({ message: 'Title is required' });
    ticket.title = next;
  }
  if (description !== undefined) ticket.description = String(description);
  if (priority !== undefined) ticket.priority = priority;
  if (status !== undefined) ticket.status = status;
  if (assignedTo !== undefined) {
    if (assignedTo && !memberOf(ws, assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });
    ticket.assignedTo = assignedTo || null;
  }

  await ticket.save();
  const populated = await ticket.populate([{ path: 'assignedTo', select: 'name email' }, { path: 'createdBy', select: 'name email' }]);
  realtime.emit(ws._id, 'ticket:updated', { ticket: populated, actorId: String(req.user._id) });
  res.json(populated);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!memberOf(ws, req.user._id)) return res.status(403).json({ message: 'Workspace access denied' });
  const updated = await Ticket.findByIdAndUpdate(ticket._id, { status: req.body.status }, { new: true, runValidators: true })
    .populate('assignedTo', 'name email').populate('createdBy', 'name email');
  realtime.emit(ws._id, 'ticket:updated', { ticket: updated, actorId: String(req.user._id) });
  res.json(updated);
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
