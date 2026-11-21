require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const commentRoutes = require('./routes/commentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const errorMiddleware = require('./middleware/errorMiddleware');
const { authLimiter, apiLimiter } = require('./middleware/rateLimit');
const User = require('./models/User');
const Workspace = require('./models/Workspace');
const realtime = require('./realtime');

const app = express();
// Render (and most PaaS) terminate TLS in front of the app, so trust the
// proxy header — otherwise rate limiting sees every request as one client.
app.set('trust proxy', 1);

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

// Both the `cors` package and Socket.IO expect a callback-style origin
// resolver; returning a boolean instead would hang the handshake.
function corsOrigin(origin, callback) {
  callback(null, isAllowedOrigin(origin) ? origin : false);
}

app.use(cors({
  origin: corsOrigin,
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
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorMiddleware);

const httpServer = http.createServer(app);
const io = realtime.init(httpServer, corsOrigin);

// Authenticate every socket with the same JWT used by the REST API.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    await connectDB();
    const user = await User.findById(payload.id).select('_id name email');
    if (!user) return next(new Error('User no longer exists'));
    socket.data.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

/**
 * Presence: who is currently looking at each board. Tracked in memory per
 * workspace, keyed by user id so two tabs from one person count once.
 */
const presence = new Map(); // workspaceId -> Map(userId -> { name, sockets:Set })

function presenceList(workspaceId) {
  const room = presence.get(String(workspaceId));
  if (!room) return [];
  return [...room.entries()].map(([id, v]) => ({ _id: id, name: v.name }));
}

function broadcastPresence(workspaceId) {
  realtime.emit(workspaceId, 'presence:update', {
    workspace: String(workspaceId),
    users: presenceList(workspaceId)
  });
}

function leavePresence(socket, workspaceId) {
  const key = String(workspaceId);
  const room = presence.get(key);
  if (!room) return;
  const entry = room.get(String(socket.data.user._id));
  if (!entry) return;
  entry.sockets.delete(socket.id);
  if (!entry.sockets.size) room.delete(String(socket.data.user._id));
  if (!room.size) presence.delete(key);
  broadcastPresence(key);
}

io.on('connection', (socket) => {
  // Personal room for notifications, independent of any board being open.
  socket.join(realtime.userRoom(socket.data.user._id));

  // Joining a room is authorised server-side; never trust the client's id.
  socket.on('workspace:join', async (workspaceId, ack) => {
    try {
      if (!workspaceId || !/^[a-f\d]{24}$/i.test(String(workspaceId))) {
        return ack?.({ ok: false, message: 'Invalid workspace id' });
      }
      await connectDB();
      const workspace = await Workspace.findById(workspaceId);
      const isMember = workspace?.members.some(
        (m) => m.user.toString() === socket.data.user._id.toString()
      );
      if (!isMember) return ack?.({ ok: false, message: 'Not a workspace member' });

      socket.join(realtime.room(workspaceId));
      socket.data.workspaces = socket.data.workspaces || new Set();
      socket.data.workspaces.add(String(workspaceId));

      const key = String(workspaceId);
      if (!presence.has(key)) presence.set(key, new Map());
      const room = presence.get(key);
      const userId = String(socket.data.user._id);
      if (!room.has(userId)) room.set(userId, { name: socket.data.user.name, sockets: new Set() });
      room.get(userId).sockets.add(socket.id);
      broadcastPresence(key);

      ack?.({ ok: true, users: presenceList(key) });
    } catch (err) {
      ack?.({ ok: false, message: 'Could not join workspace' });
    }
  });

  socket.on('workspace:leave', (workspaceId) => {
    if (!workspaceId) return;
    socket.leave(realtime.room(workspaceId));
    socket.data.workspaces?.delete(String(workspaceId));
    leavePresence(socket, workspaceId);
  });

  socket.on('disconnect', () => {
    for (const workspaceId of socket.data.workspaces || []) leavePresence(socket, workspaceId);
    socket.data.workspaces?.clear();
  });
});

const port = process.env.PORT || 5000;
httpServer.listen(port, '0.0.0.0', () => console.log(`API + realtime listening on ${port}`));

module.exports = app;
module.exports.httpServer = httpServer;
module.exports.io = io;
