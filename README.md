# Real-Time Collaborative Sprint Tracker

A Vercel-ready React/Vite/Tailwind + Express/Mongoose sprint board. The app uses JWT auth and 5-second smart polling (no persistent Socket.IO connection, which is unsuitable for Vercel serverless functions).

## Repository
- `client/`: Vite SPA, React Router, Tailwind, Axios, AuthContext.
- `server/`: Express API, Mongoose models, JWT auth, workspace roles, controllers.

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
6. Open http://localhost:5173.

## Deploy to Vercel (recommended: two projects)
Deploy the API and SPA as separate Vercel projects from the same Git repository.

### MongoDB Atlas
1. Create a free/shared cluster and a database user with a strong password.
2. In Network Access, allow Vercel's outbound connections. For a quick prototype you can allow `0.0.0.0/0`; use a tighter network strategy where available for production.
3. Copy the Atlas **Node.js driver** connection string and replace username/password/database name. URL-encode special characters in credentials.
4. Keep the URI private; never put it in `client/.env` or any `VITE_` variable.

### API project
1. Import the repository into Vercel and set the project Root Directory to `server`.
2. Framework preset: Other. Build command can be left empty; output directory can be left empty.
3. Add environment variables: `MONGO_URI`, `JWT_SECRET` (long random secret), `CLIENT_ORIGIN` (the deployed frontend origin, e.g. `https://your-app.vercel.app`), and `NODE_ENV=production`.
4. Deploy. The API is served by `server/server.js`; `server/vercel.json` routes all paths to the Node function.
5. Test `https://YOUR-API.vercel.app/api/health`.

### Frontend project
1. Create a second Vercel project from the same repository; set Root Directory to `client`.
2. Add `VITE_API_URL=https://YOUR-API.vercel.app` (no trailing slash).
3. Deploy. `client/vercel.json` rewrites client-side routes to `index.html`.
4. Update the API project's `CLIENT_ORIGIN` to the exact frontend origin and redeploy.

### Notes
- Vercel environment variables are injected at build/runtime; redeploy after changing them.
- The API enables credential-free bearer-token CORS for the configured frontend origin.
- Polling runs every 5 seconds only while the board document is visible. Mutations update local state optimistically and then reconcile with the API.
- This starter includes basic validation and authorization. Before production, add rate limiting, email verification/password reset, audit logs, pagination, request logging, and automated tests. Consider refresh-token rotation and a managed secrets policy.
