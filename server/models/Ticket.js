const mongoose = require('mongoose');
const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  status: { type: String, enum: ['TODO','IN_PROGRESS','REVIEW','DONE'], default: 'TODO' },
  priority: { type: String, enum: ['LOW','MEDIUM','HIGH'], default: 'MEDIUM' },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
module.exports = mongoose.model('Ticket', ticketSchema);
