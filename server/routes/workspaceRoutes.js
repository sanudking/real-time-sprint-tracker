const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { requireWorkspaceMember, requireAdmin } = require('../middleware/roleMiddleware');
const c = require('../controllers/workspaceController');
router.use(auth);
router.post('/', c.create);
router.get('/', c.list);
// Static paths must be declared before `/:id`-style routes.
router.get('/my-work', c.myWork);
router.get('/:id/stats', requireWorkspaceMember, c.stats);
router.patch('/:id', requireWorkspaceMember, requireAdmin, c.rename);
router.post('/:id/members', requireWorkspaceMember, requireAdmin, c.addMember);
router.patch('/:id/members/:userId', requireWorkspaceMember, requireAdmin, c.updateMemberRole);
router.delete('/:id/members/:userId', requireWorkspaceMember, requireAdmin, c.removeMember);
router.delete('/:id', requireWorkspaceMember, requireAdmin, c.remove);
module.exports = router;
