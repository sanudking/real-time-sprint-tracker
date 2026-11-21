const mongoose = require('mongoose');

// Append-only audit trail for a ticket. `detail` is already human readable so
// the client never needs to reconstruct the wording of a change.
const activitySchema = new mongoose.Schema({
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true, maxlength: 40 },
  detail: { type: String, default: '', maxlength: 300 }
}, { timestamps: true });

activitySchema.index({ ticket: 1, createdAt: -1 });
// Activities are operational noise; drop them after 90 days.
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Activity', activitySchema);
