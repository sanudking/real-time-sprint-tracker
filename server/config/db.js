const mongoose = require('mongoose');

let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

function getUri() {
  const raw = String(process.env.MONGO_URI || '').trim();
  if (!raw) throw new Error('MONGO_URI is not configured');
  if (!/^mongodb(\+srv)?:\/\//i.test(raw)) {
    throw new Error(
      'MONGO_URI must start with "mongodb://" or "mongodb+srv://". ' +
      'Paste only the connection string — do not include the "MONGO_URI=" prefix, ' +
      'quotes, or surrounding whitespace.'
    );
  }
  return raw;
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  const uri = getUri();
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000
    }).then((m) => m).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
module.exports = connectDB;
