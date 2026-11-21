const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const c = require('../controllers/notificationController');
router.use(auth);
router.get('/', c.list);
router.post('/read', c.markRead);
router.patch('/:id/read', c.markOneRead);
router.delete('/:id', c.remove);
module.exports = router;
