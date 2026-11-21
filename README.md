# Real-Time Collaborative Sprint Tracker

A React/Vite/Tailwind board with an Express/Mongoose API and **Socket.IO realtime updates**. JWT auth, per-workspace rooms, optimistic UI.

```
Browser (Vercel) ──HTTPS──▶ Express + Socket.IO (Render) ──▶ MongoDB Atlas
        └────────────WSS──────────────┘
```

## Repository
- `client/`: Vite SPA, React Router, Tailwind, Axios, AuthContext, RealtimeContext.
- `server/`: Express API, Mongoose models, JWT auth, workspace roles, Socket.IO gateway.

## How realtime works
- The socket authenticates with the same JWT as the REST API (`socket.handshake.auth.token`).
- A client joins a room only after the server re-checks workspace membership — never trust the client's id.
- Controllers emit `ticket:created`, `ticket:updated`, `ticket:deleted` and `member:added` to that room.
- The board loads once over REST, then applies socket deltas. Events carry `actorId` so the originator skips its own echo (it already applied the change optimistically).
- On reconnect the board refetches once, because sockets do not replay missed messages.

## Local development
1. Install Node.js 20+ and create a MongoDB Atlas cluster.
2. Copy `server/.env.example` to `server/.env`, fill `MONGO_URI` and `JWT_SECRET`.
3. Copy `client/.env.example` to `client/.env`; set `VITE_API_URL=http://localhost:5000`.
4. In one terminal:
   ```bash
   cd server && npm install && npm run dev
   ```
5. In another:
   ```bash
   cd client && npm install && npm run dev
   ```
6. Open http://localhost:5173 in two browsers and move a ticket — it should flip in both instantly.

## Deployment

The API cannot live on Vercel: serverless functions are request/response and cannot hold a
WebSocket open. The API therefore runs as a long-lived Node process on Render; the SPA stays on Vercel.

### MongoDB Atlas
1. Create a free/shared cluster and a database user with a strong password.
2. In Network Access allow `0.0.0.0/0` (Render's IPs are dynamic) or use a tighter strategy where available.
3. Copy the Atlas **Node.js driver** connection string and URL-encode special characters in credentials.
4. Keep the URI private; never put it in `client/.env` or any `VITE_` variable.

### API on Render (free)
1. Create a Render Blueprint from this repository — `render.yaml` provisions the service automatically.
2. Set the secret env vars it prompts for: `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN`
   (comma-separated, `*` wildcards allowed, e.g. `https://your-app.vercel.app,https://your-app-*-your-team.vercel.app`).
3. Deploy and verify `https://YOUR-API.onrender.com/api/health`.

### Frontend on Vercel
1. Import the repository, set Root Directory to `client`.
2. Add `VITE_API_URL=https://YOUR-API.onrender.com` (no trailing slash). `VITE_SOCKET_URL` is optional and defaults to it.
3. Deploy. `client/vercel.json` rewrites client-side routes to `index.html`.
4. Update the Render service's `CLIENT_ORIGIN` to the exact frontend origin.

### Keepalive
Render's free plan spins a service down after ~15 minutes without inbound traffic, which drops
every socket. `.github/workflows/keepalive.yml` pings `/api/health` every 10 minutes; set the
repository variable `API_HEALTH_URL` to `https://YOUR-API.onrender.com/api/health`. 730 h/month of
uptime fits inside Render's 750 free instance hours.

## Notes
- Environment variables are read at boot; restart/redeploy after changing them.
- Rooms are in-memory, so this assumes a single instance. Add `@socket.io/redis-adapter` before scaling horizontally.
- This starter includes basic validation and authorization. Before production, add rate limiting, email verification/password reset, audit logs, pagination, request logging, and automated tests. Consider refresh-token rotation and a managed secrets policy.
