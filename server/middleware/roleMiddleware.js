const Workspace = require('../models/Workspace');

async function requireWorkspaceMember(req, res, next) {
  try {
    const id = req.params.id || req.params.workspaceId || req.body.workspace;
    if (!id) return res.status(400).json({ message: 'Workspace id is required' });
    const workspace = await Workspace.findById(id);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    const member = workspace.members.find(m => m.user.toString() === req.user._id.toString());
    if (!member) return res.status(403).json({ message: 'Not a workspace member' });
    req.workspace = workspace;
    req.workspaceRole = member.role;
    next();
  } catch (err) { next(err); }
}
function requireAdmin(req, res, next) {
  if (req.workspaceRole !== 'ADMIN') return res.status(403).json({ message: 'Admin permission required' });
  next();
}
module.exports = { requireWorkspaceMember, requireAdmin };
