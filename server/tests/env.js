// Test-time defaults. Real values are injected by CI or the developer's .env.
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
// Always bind an ephemeral port: a local dev server usually owns 5000.
process.env.PORT = '0';

/**
 * Point every connection at a disposable database. connectDB() in the app reads
 * MONGO_URI directly, so rewriting it here keeps app and tests in sync — two
 * different connection strings would make Mongoose throw.
 */
function testUri(base) {
  if (process.env.MONGO_TEST_URI) return process.env.MONGO_TEST_URI;
  if (!base) return 'mongodb://127.0.0.1:27017/sprint_tracker_test';
  const [head, query] = base.split('?');
  const match = head.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(?:\/([^/]*))?$/);
  if (!match) return base;
  const [, origin, db] = match;
  const name = db && db.trim() ? `${db}_test` : 'sprint_tracker_test';
  return `${origin}/${name}${query ? `?${query}` : ''}`;
}

process.env.MONGO_URI = testUri(process.env.MONGO_URI);
