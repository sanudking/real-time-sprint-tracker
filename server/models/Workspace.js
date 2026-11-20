const mongoose = require('mongoose');
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['ADMIN', 'MEMBER'], default: 'MEMBER' }
}, { _id: false });
const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: { type: [memberSchema], default: [] }
}, { timestamps: true });
workspaceSchema.index({ 'members.user': 1 });
module.exports = mongoose.model('Workspace', workspaceSchema);
