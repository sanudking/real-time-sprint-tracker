const Notification = require('../models/Notification');
const asyncHandler = require('../utils/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const notifications = await Notification.find({ user: req.user._id })
    .populate('actor', 'name email')
    .populate('ticket', 'title workspace')
    .sort({ createdAt: -1 })
    .limit(limit);
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ notifications, unread });
});

exports.markRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  res.json({ unread: 0 });
});

exports.markOneRead = asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true });
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  res.json({ unread });
});

exports.remove = asyncHandler(async (req, res) => {
  await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ message: 'Notification dismissed' });
});
