const User = require('../models/User');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const user = await User.create({ name, email, password });
  res.status(201).json({ token: signToken(user._id), user: { id: user._id, name: user.name, email: user.email } });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password || ''))) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ token: signToken(user._id), user: { id: user._id, name: user.name, email: user.email } });
});
