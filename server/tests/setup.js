const mongoose = require('mongoose');

/**
 * Tests run against a real MongoDB instance but in a throwaway database, so
 * they never touch development data. env.js rewrites MONGO_URI to point at
 * `<db>_test`; this module only needs to connect and reset it.
 */
async function connect() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  }
  return mongoose.connection;
}

async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(c => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, clear, disconnect };
