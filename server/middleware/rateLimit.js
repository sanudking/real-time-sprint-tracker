const rateLimit = require('express-rate-limit');

// Integration tests register dozens of users from one IP; the limiter would
// (correctly) throttle them. Skip it there, keep it everywhere else.
const skip = () => process.env.NODE_ENV === 'test';

// Credential endpoints are the most attractive brute-force target in this app.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { message: 'Too many attempts. Please try again in a few minutes.' }
});

// Cheap blanket protection for the rest of the API.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { message: 'Too many requests. Slow down.' }
});

module.exports = { authLimiter, apiLimiter };
