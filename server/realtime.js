const { Server } = require('socket.io');

let io = null;

const room = (workspaceId) => `ws:${workspaceId}`;
const userRoom = (userId) => `user:${userId}`;

function init(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    // Keep the default transports: WebSocket first, HTTP long-polling as fallback
    // for restrictive networks.
    transports: ['websocket', 'polling']
  });
  return io;
}

/**
 * Broadcast an event to everyone currently viewing a workspace board.
 * Silently no-ops when realtime is not initialised (e.g. unit tests).
 */
function emit(workspaceId, event, payload) {
  if (!io || !workspaceId) return;
  io.to(room(workspaceId)).emit(event, payload);
}

/** Deliver an event to a single user across every device they have open. */
function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit(event, payload);
}

module.exports = { init, emit, emitToUser, room, userRoom, getIO: () => io };
