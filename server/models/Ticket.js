const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false }
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  status: { type: String, enum: ['TODO','IN_PROGRESS','REVIEW','DONE'], default: 'TODO' },
  priority: { type: String, enum: ['LOW','MEDIUM','HIGH'], default: 'MEDIUM' },
  // Free-form tags ("bug", "ui"). Deduped and capped in the controller.
  labels: { type: [String], default: [] },
  dueDate: { type: Date, default: null },
  // Story points. 0 means "not estimated".
  points: { type: Number, default: 0, min: 0, max: 100 },
  subtasks: { type: [subtaskSchema], default: [] },
  archived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ticketSchema.index({ workspace: 1, archived: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, archived: 1, dueDate: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
