const mongoose = require('mongoose');

/**
 * Tests run against a real MongoDB instance but in a throwaway database.
 *
 * SAFETY: `clear()` deletes every document in every collection. It refuses to
 * run unless the connected database name ends in `_test`. This exists because
 * a MONGO_URI without a database name silently resolves to a database called
 * `test`, and an unguarded clear() once wiped real data.
 */
function assertTestDatabase() {
  const name = mongoose.connection?.db?.databaseName || '';
  if (!/_test$/.test(name)) {
    throw new Error(
      `Refusing to clear database "${name}": tests may only run against a database ` +
      'whose name ends in "_test". Set MONGO_TEST_URI or add a database name to MONGO_URI.'
    );
  }
}

async function connect() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  }
  assertTestDatabase();
  return mongoose.connection;
}

async function clear() {
  assertTestDatabase();
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, clear, disconnect, assertTestDatabase };
