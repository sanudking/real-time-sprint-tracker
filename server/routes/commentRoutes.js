const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const c = require('../controllers/commentController');
router.use(auth);
router.get('/ticket/:ticketId', c.listByTicket);
router.post('/', c.create);
router.delete('/:id', c.remove);
module.exports = router;
