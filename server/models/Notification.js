const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  type: { type: String, enum: ['ASSIGNED', 'MENTION', 'COMMENT'], required: true },
  message: { type: String, required: true, maxlength: 300 },
  read: { type: Boolean, default: false, index: true }
}, { timestamps: true });

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
