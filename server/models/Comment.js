const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

commentSchema.index({ ticket: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', commentSchema);
