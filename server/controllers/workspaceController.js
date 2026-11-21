const Workspace = require('../models/Workspace');
const Ticket = require('../models/Ticket');
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

/** Board insights: per-column counts, overdue/due-soon, points and per-assignee load. */
exports.stats = asyncHandler(async (req, res) => {
  const ws = req.workspace;
  const tickets = await Ticket.find({ workspace: ws._id, archived: false }).populate('assignedTo', 'name email');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const in7Days = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const byStatus = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 };
  const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  const byAssignee = {};
  let pointsTotal = 0;
  let pointsDone = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    pointsTotal += t.points || 0;
    if (t.status === 'DONE') pointsDone += t.points || 0;

    const key = t.assignedTo?._id ? String(t.assignedTo._id) : 'unassigned';
    if (!byAssignee[key]) {
      byAssignee[key] = {
        name: t.assignedTo?.name || 'Unassigned',
        total: 0, done: 0, points: 0
      };
    }
    byAssignee[key].total += 1;
    byAssignee[key].points += t.points || 0;
    if (t.status === 'DONE') byAssignee[key].done += 1;

    if (t.dueDate && t.status !== 'DONE') {
      const due = new Date(t.dueDate);
      if (due < startOfToday) overdue += 1;
      else if (due <= in7Days) dueSoon += 1;
    }
  }

  const total = tickets.length;
  res.json({
    total,
    byStatus,
    byPriority,
    byAssignee: Object.values(byAssignee).sort((a, b) => b.total - a.total),
    points: { total: pointsTotal, done: pointsDone },
    completion: total ? Math.round((byStatus.DONE / total) * 100) : 0,
    overdue,
    dueSoon
  });
});

/** Every open ticket assigned to me, across all my workspaces. */
exports.myWork = asyncHandler(async (req, res) => {
  const workspaces = await Workspace.find({ 'members.user': req.user._id }).select('_id name');
  const workspaceIds = workspaces.map(w => w._id);
  const tickets = await Ticket.find({
    workspace: { $in: workspaceIds },
    assignedTo: req.user._id,
    archived: false
  })
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name email')
    .populate('workspace', 'name')
    .sort({ dueDate: 1, priority: -1, createdAt: -1 })
    .limit(200);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  res.json({
    tickets,
    counts: {
      total: tickets.length,
      open: tickets.filter(t => t.status !== 'DONE').length,
      overdue: tickets.filter(t => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < startOfToday).length
    }
  });
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

exports.removeMember = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const target = req.workspace.members.find(m => m.user.toString() === String(userId));
  if (!target) return res.status(404).json({ message: 'That user is not a member' });
  if (req.workspace.owner.toString() === String(userId)) {
    return res.status(400).json({ message: 'The workspace owner cannot be removed' });
  }
  req.workspace.members = req.workspace.members.filter(m => m.user.toString() !== String(userId));
  await req.workspace.save();
  const populated = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  realtime.emit(req.workspace._id, 'member:removed', { workspace: populated, userId: String(userId), actorId: String(req.user._id) });
  res.status(200).json(populated);
});

exports.updateMemberRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const role = String(req.body.role || '').toUpperCase();
  if (!['ADMIN', 'MEMBER'].includes(role)) return res.status(400).json({ message: 'Role must be ADMIN or MEMBER' });
  if (req.workspace.owner.toString() === String(userId) && role !== 'ADMIN') {
    return res.status(400).json({ message: 'The workspace owner must stay an admin' });
  }
  const target = req.workspace.members.find(m => m.user.toString() === String(userId));
  if (!target) return res.status(404).json({ message: 'That user is not a member' });
  target.role = role;
  await req.workspace.save();
  const populated = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  realtime.emit(req.workspace._id, 'member:updated', { workspace: populated, userId: String(userId), actorId: String(req.user._id) });
  res.status(200).json(populated);
});

exports.rename = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ message: 'Workspace name is required' });
  req.workspace.name = name.slice(0, 100);
  await req.workspace.save();
  const populated = await Workspace.findById(req.workspace._id).populate('members.user', 'name email');
  realtime.emit(req.workspace._id, 'workspace:updated', { workspace: populated, actorId: String(req.user._id) });
  res.json(populated);
});

exports.remove = asyncHandler(async (req, res) => {
  await Ticket.deleteMany({ workspace: req.workspace._id });
  await req.workspace.deleteOne();
  res.json({ message: 'Workspace deleted' });
});
