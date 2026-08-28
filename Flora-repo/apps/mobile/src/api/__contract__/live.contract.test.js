import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { liveClient } from '../liveClient.js';
import { setToken } from '../session.js';
import { runClientContract } from './client.contract.test.js';

/**
 * The shared client contract, run against the real API over HTTP.
 *
 * This is the acceptance gate for "the app is wired to the backend": the same
 * suite that defines the mock's behaviour has to pass unchanged against
 * Postgres, Express and the live client. Anywhere the two disagree, one of them
 * is wrong.
 *
 * The server is started by test/live-setup.cjs (see jest.live.config.cjs).
 */

const API_DIR = path.resolve(__dirname, '../../../../api');

const IMAGE = Buffer.from('a fake jpeg for the contract suite').toString('base64');

/**
 * Restore the seed dataset.
 *
 * A child process rather than an HTTP endpoint: a "wipe everything" route on
 * the API would be a genuine hazard to ship, however carefully it were gated,
 * and running the seed script directly needs no such thing. It costs about a
 * second per test, which the suite can afford.
 */
function reseed() {
  execFileSync(process.execPath, ['prisma/seed.js'], {
    cwd: API_DIR,
    env: process.env,
    stdio: 'ignore',
  });
}

/**
 * The live client, with the two adjustments the contract needs.
 *
 * 1. The suite calls `diagnoses.create({ imageUri })` with no bytes, because
 *    the mock recognises a photo it never has to look at. A real scanner needs
 *    the image, so supply one here. Harness detail, not client behaviour — the
 *    app always captures bytes before it calls this.
 * 2. `plants.timeline`/`feed.list` and friends already match; nothing else is
 *    wrapped, so everything the suite exercises is the shipping code path.
 */
function makeClient() {
  return {
    ...liveClient,
    diagnoses: {
      ...liveClient.diagnoses,
      create: (input = {}) => liveClient.diagnoses.create({ imageBase64: IMAGE, ...input }),
    },
  };
}

describe('liveClient', () => {
  beforeEach(async () => {
    // Every contract test assumes the seed dataset and an active flora_demo
    // session — the mock gets that from a fresh in-memory store per client, and
    // a shared database has to be put back by hand.
    reseed();
    setToken(null);
    const login = await liveClient.auth.login({
      username: 'flora_demo',
      password: 'password123',
    });
    expect(login.ok).toBe(true);
  });

  runClientContract(makeClient);

  /**
   * Three of the contract's diagnosis tests early-return for any client without
   * `setNextDiagnosisFixture`, because they assert on a specific canned result
   * the live provider has no way to choose. That silently leaves attach and
   * escalate — both real endpoints — unexercised here, so they are covered
   * directly.
   */
  describe('live-only diagnosis flows', () => {
    /** Run a scan through to COMPLETE, the way the result screen does. */
    async function completedDiagnosis() {
      const client = makeClient();
      const created = await client.diagnoses.create({ mode: 'health' });
      expect(created.ok).toBe(true);
      expect(created.data.status).toBe('PENDING');

      // The stub is set to answer in 1.5s (see test/live-setup.cjs).
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const polled = await client.diagnoses.get(created.data.id);
        if (polled.data.status !== 'PENDING') return { client, diagnosis: polled.data };
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error('diagnosis never settled');
    }

    it('attaches a diagnosis to a plant, and it shows in that plant timeline', async () => {
      const { client, diagnosis } = await completedDiagnosis();
      expect(diagnosis.status).toBe('COMPLETE');

      const attached = await client.diagnoses.attach(diagnosis.id, 'p3');
      expect(attached.ok).toBe(true);
      expect(attached.data.plantId).toBe('p3');

      const timeline = await client.plants.timeline('p3');
      expect(timeline.data.items.some((item) => item.id === diagnosis.id)).toBe(true);
    });

    it('refuses to attach a diagnosis to someone else’s plant', async () => {
      const { client, diagnosis } = await completedDiagnosis();

      await client.auth.login({ username: 'rana_gardens', password: 'password123' });
      const attached = await client.diagnoses.attach(diagnosis.id, 'p3');

      // p3 belongs to flora_demo. Another user must not be able to tell that
      // apart from a plant that does not exist.
      expect(attached.ok).toBe(false);
      expect(attached.error.code).toBe('NOT_FOUND');
    });

    it('escalates a completed diagnosis into a HELP post', async () => {
      const { client, diagnosis } = await completedDiagnosis();

      const post = await client.diagnoses.escalate(diagnosis.id);
      expect(post.ok).toBe(true);
      expect(post.data.type).toBe('HELP');
      expect(post.data.author.username).toBe('flora_demo');
      // healthy-basil is the stub's fixture: no issues, so the post asks the
      // open question rather than naming one.
      expect(post.data.attachment).toMatchObject({ topIssue: null, confidence: 0.91 });
      // The photo the scan was run on, at an address anyone can open — this is
      // the whole point of the upload path. The row holds the key; the URL is
      // built at read time, which is why it names the server the API is on.
      expect(post.data.attachment.imageUri).toMatch(
        /^http:\/\/[^/]+\/uploads\/\d{4}\/[0-9a-f-]{36}\.jpg$/,
      );
      expect(post.data.images).toEqual([post.data.attachment.imageUri]);

      // And it really is fetchable: a HELP post whose picture 404s is no better
      // than the file:// path this replaced.
      const image = await fetch(post.data.attachment.imageUri);
      expect(image.status).toBe(200);
      expect(image.headers.get('content-type')).toContain('image/jpeg');

      const help = await client.posts.list({ type: 'HELP' });
      expect(help.data.some((entry) => entry.id === post.data.id)).toBe(true);
    });

    it('refuses to escalate a scan that is still running', async () => {
      const client = makeClient();
      const created = await client.diagnoses.create({});

      const tooEarly = await client.diagnoses.escalate(created.data.id);
      expect(tooEarly.ok).toBe(false);
      expect(tooEarly.error.code).toBe('VALIDATION');
    });

    it('requires a session to attach or escalate', async () => {
      const { client, diagnosis } = await completedDiagnosis();
      await client.auth.logout();

      expect((await client.diagnoses.attach(diagnosis.id, 'p3')).error.code).toBe('UNAUTHORIZED');
      expect((await client.diagnoses.escalate(diagnosis.id)).error.code).toBe('UNAUTHORIZED');
    });
  });
});
