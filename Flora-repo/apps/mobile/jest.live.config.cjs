/**
 * Live contract suite — the mobile client against a real API and a real database.
 *
 * Separate from the default jest project because it needs Postgres running.
 * `pnpm -F mobile test` stays a pure unit run that works with nothing installed
 * but node; `pnpm -F mobile test:live` is the integration gate, and CI runs both.
 *
 * Keeps the jest-expo preset even though nothing renders: the client reaches
 * expo-constants through http.js, and the preset is what makes that resolve.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/api/__contract__/live.contract.test.js'],
  globalSetup: '<rootDir>/test/live-setup.cjs',
  globalTeardown: '<rootDir>/test/live-teardown.cjs',
  // Serial: every test reseeds the same database, so two at once would fight.
  maxWorkers: 1,
  // Generous — each test reseeds (scrypt is deliberately slow) and one waits
  // out the stub recognizer's simulated latency.
  testTimeout: 120000,
};
