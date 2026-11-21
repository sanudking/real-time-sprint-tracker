// Test-time defaults. Real values are injected by CI or the developer's .env.
require('dotenv').config();

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
// Always bind an ephemeral port: a local dev server usually owns 5000.
process.env.PORT = '0';

/**
 * Force every connection at a disposable database whose name ends in `_test`.
 *
 * This is not cosmetic. A MONGO_URI with no database name resolves to a
 * database literally called `test`, so app code and tests would share it and
 * the suite's clear() would delete real data. If MONGO_TEST_URI is not given
 * we always derive a `_test` name, never reuse the app database.
 */
function testUri(base) {
  if (process.env.MONGO_TEST_URI) {
    if (!/_test(\?|$)/.test(process.env.MONGO_TEST_URI)) {
      throw new Error('MONGO_TEST_URI must point at a database whose name ends in "_test"');
    }
    return process.env.MONGO_TEST_URI;
  }
  if (!base) return 'mongodb://127.0.0.1:27017/sprint_tracker_test';

  const [head, query] = base.split('?');
  const match = head.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(?:\/([^/]*))?$/);
  if (!match) return base;
  const [, origin, db] = match;
  // No database name in the URI -> default would be `test`, which may be live data.
  const name = db && db.trim() ? `${db}_test` : 'sprint_tracker_test';
  return `${origin}/${name}${query ? `?${query}` : ''}`;
}

process.env.MONGO_URI = testUri(process.env.MONGO_URI);
