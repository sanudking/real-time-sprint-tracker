const Ticket = require('../models/Ticket');
const Workspace = require('../models/Workspace');
const asyncHandler = require('../utils/asyncHandler');

exports.create = asyncHandler(async (req, res) => {
  const { title, description = '', priority = 'MEDIUM', assignedTo = null, workspace } = req.body;
  const ws = await Workspace.findById(workspace);
  if (!ws || !ws.members.some(m => m.user.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Workspace access denied' });
  if (assignedTo && !ws.members.some(m => m.user.toString() === assignedTo)) return res.status(400).json({ message: 'Assignee must be a workspace member' });
  const ticket = await Ticket.create({ title, description, priority, assignedTo, workspace, createdBy: req.user._id });
  res.status(201).json(await ticket.populate([{ path: 'assignedTo', select: 'name email' }, { path: 'createdBy', select: 'name email' }]));
});

exports.listByWorkspace = asyncHandler(async (req, res) => {
  const ws = await Workspace.findById(req.params.workspaceId);
  if (!ws || !ws.members.some(m => m.user.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Workspace access denied' });
  const tickets = await Ticket.find({ workspace: ws._id }).populate('assignedTo', 'name email').populate('createdBy', 'name email').sort({ createdAt: -1 });
  res.json(tickets);
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!ws || !ws.members.some(m => m.user.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Workspace access denied' });
  const updated = await Ticket.findByIdAndUpdate(ticket._id, { status: req.body.status }, { new: true, runValidators: true })
    .populate('assignedTo', 'name email').populate('createdBy', 'name email');
  res.json(updated);
});

exports.remove = asyncHandler(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
  const ws = await Workspace.findById(ticket.workspace);
  if (!ws || !ws.members.some(m => m.user.toString() === req.user._id.toString())) return res.status(403).json({ message: 'Workspace access denied' });
  await ticket.deleteOne();
  res.json({ message: 'Ticket deleted' });
});
