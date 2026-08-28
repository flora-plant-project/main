/**
 * Jest globalSetup for the live contract suite.
 *
 * Brings up a real API against a real Postgres, because that is the only way
 * the shared client contract proves anything about the live client: a mocked
 * server would just be a second mock.
 *
 * Expects Postgres to already be running (`docker compose up -d db`) and
 * DATABASE_URL to point at it.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const API_DIR = path.resolve(__dirname, '../../api');

/** A port unlikely to collide with a dev server on 4000. */
const PORT = Number(process.env.FLORA_LIVE_TEST_PORT ?? 4010);

const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Give up rather than hang a CI job forever. */
const BOOT_TIMEOUT_MS = 60_000;

/**
 * Poll /health until the server answers.
 * @param {import('node:child_process').ChildProcess} child
 */
async function waitForHealth(child) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited with code ${child.exitCode} before becoming healthy`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`API did not become healthy within ${BOOT_TIMEOUT_MS}ms`);
}

module.exports = async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the live contract suite. Start Postgres with ' +
        '`docker compose up -d db` and load .env (pnpm -F mobile test:live does this).',
    );
  }

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      // No key: the fixture-backed stub answers, so the suite never touches
      // Plant.id and never needs a credential.
      PLANT_ID_API_KEY: '',
      // Long enough that a client can observe PENDING before polling again.
      // Reading a fixture off disk is instant, and the contract asserts the
      // async lifecycle, not just the final result.
      FLORA_STUB_DELAY_MS: '1500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Surface API crashes in the jest output — a silent child makes a failing
  // suite look like a client bug.
  child.stdout.on('data', (chunk) => process.stdout.write(`[api] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[api] ${chunk}`));

  await waitForHealth(child);

  globalThis.__FLORA_API__ = child;
  process.env.EXPO_PUBLIC_API_URL = BASE_URL;
};
