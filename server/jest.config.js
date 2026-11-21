module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/env.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/setup.js', '<rootDir>/tests/env.js'],
  forceExit: true
};
