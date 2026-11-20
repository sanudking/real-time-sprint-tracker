require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '1mb' }));

// Ensure Atlas is connected before any API handler runs.
app.use('/api', async (req, res, next) => {
  try { await connectDB(); next(); } catch (err) { next(err); }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/tickets', ticketRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorMiddleware);

if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`API listening on ${port}`));
}
module.exports = app;
