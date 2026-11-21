const Workspace = require('../models/Workspace');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const realtime = require('../realtime');

exports.create = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Workspace name is required' });
  const workspace = await Workspace.create({ name, owner: req.user._id, members: [{ user: req.user._id, role: 'ADMIN' }] });
  res.status(201).json(await Workspace.findById(workspace._id).populate('members.user', 'name email'));
});

exports.list = asyncHandler(async (req, res) => {
  const workspaces = await Workspace.find({ 'members.user': req.user._id }).populate('members.user', 'name email').sort({ updatedAt: -1 });
  res.json(workspaces);
});

exports.addMember = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'No user found with that email. Ask them to register first.' });
  if (req.workspace.members.some(m => m.user.toString() === user._id.toString())) return res.status(409).json({ message: 'User is already a member' });
  req.workspace.members.push({ user: user._id, role: 'MEMBER' });
  await req.workspace.save();
  const populated = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  realtime.emit(req.workspace._id, 'member:added', { workspace: populated, actorId: String(req.user._id) });
  res.status(200).json(populated);
});

exports.remove = asyncHandler(async (req, res) => {
  await req.workspace.deleteOne();
  res.json({ message: 'Workspace deleted' });
});
