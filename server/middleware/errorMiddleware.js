module.exports = function errorMiddleware(err, req, res, next) {
  console.error(err);
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid resource id' });
  if (err.code === 11000) return res.status(409).json({ message: 'A record with this value already exists' });
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(', ') });
  }
  const status = err.statusCode || 500;
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
};
