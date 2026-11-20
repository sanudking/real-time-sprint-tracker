require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');

const app = express();

// CLIENT_ORIGIN may hold a comma-separated list and may use `*` wildcards
// (e.g. https://*-sanudkings-projects.vercel.app) so preview deployments work.
const defaultOrigins = [
  'http://localhost:5173',
  'https://sprint-tracker-client.vercel.app',
  'https://sprint-tracker-client-sanudkings-projects.vercel.app',
  'https://sprint-tracker-client-*-sanudkings-projects.vercel.app',
  'https://sprint-tracker-client-git-*-sanudking.vercel.app'
];
const originPatterns = (process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',')
  : defaultOrigins
).map((o) => o.trim()).filter(Boolean).map((pattern) => {
  if (!pattern.includes('*')) return pattern;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
});

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin, curl, and server-to-server requests
  return originPatterns.some((p) => (typeof p === 'string' ? p === origin : p.test(origin)));
}

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin) ? origin : false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
