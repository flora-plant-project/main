const DAY_MS = 24 * 60 * 60 * 1000;

/** A few bytes with a JPEG header — enough for an upload to be a real one. */
const TINY_IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');

/**
 * Shared behavioural contract for any Flora client (mock today, live later).
 *
 * @param {() => object} makeClient fresh, isolated client per call
 * @param {object} [options]
 * @param {(promise: Promise<any>) => Promise<any>} [options.settle]
 *   wraps every client call; the mock suite advances fake timers past the
 *   simulated latency here. Defaults to identity for real-time clients.
 * @param {(ms: number) => Promise<void>} [options.wait]
 *   waits wall-clock time (fake-timer advance in the mock suite).
 */
export function runClientContract(
  makeClient,
  { settle = (promise) => promise, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  describe('Flora client contract', () => {
    it('wraps reads in the ApiResponse envelope', async () => {
      const client = makeClient();
      const res = await settle(client.species.list());
      expect(res.ok).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('exposes the seeded catalog and demo content', async () => {
      const client = makeClient();
      const species = await settle(client.species.list());
      expect(species.data).toHaveLength(10);
      const plants = await settle(client.plants.list());
      expect(plants.data).toHaveLength(6);
      const posts = await settle(client.posts.list());
      expect(posts.data).toHaveLength(12);
      expect(posts.data.filter((post) => post.type === 'HELP')).toHaveLength(1);
    });

    it('searches species by common or scientific name', async () => {
      const client = makeClient();
      const byCommon = await settle(client.species.search('basil'));
      expect(byCommon.ok).toBe(true);
      expect(byCommon.data.some((species) => species.id === 'sp1')).toBe(true);
      const byArabic = await settle(client.species.search('زيتون'));
      expect(byArabic.data.some((species) => species.id === 'sp4')).toBe(true);
      const blank = await settle(client.species.search('   '));
      expect(blank.error.code).toBe('VALIDATION');
    });

    it('creates a plant and rejects an invalid one with VALIDATION', async () => {
      const client = makeClient();
      const created = await settle(client.plants.create({ nickname: 'Testy', speciesId: 'sp1' }));
      expect(created.ok).toBe(true);
      expect(created.data.id).toBeTruthy();
      const invalid = await settle(client.plants.create({}));
      expect(invalid.ok).toBe(false);
      expect(invalid.error.code).toBe('VALIDATION');
    });

    it('markWatered schedules the next watering from species interval × zone multiplier', async () => {
      const client = makeClient();
      // p1 is basil (waterEveryDays 2) owned by a COASTAL user (multiplier 1) → 2 days
      const res = await settle(client.plants.markWatered('p1'));
      expect(res.ok).toBe(true);
      expect(Date.parse(res.data.nextDueAt) - Date.parse(res.data.wateredAt)).toBe(2 * DAY_MS);
      expect(Math.abs(Date.parse(res.data.wateredAt) - Date.now())).toBeLessThan(2000);
      const missing = await settle(client.plants.markWatered('nope'));
      expect(missing.ok).toBe(false);
      expect(missing.error.code).toBe('NOT_FOUND');
    });

    it('applies the climate zone multiplier of the logged-in user', async () => {
      const client = makeClient();
      await settle(client.auth.login({ username: 'ziad_bekaa', password: 'password123' }));
      // aloe (21 days) × BEKAA 0.8 = 16.8 → rounded to 17 days
      const created = await settle(client.plants.create({ nickname: 'Aloe B', speciesId: 'sp8' }));
      const res = await settle(client.plants.markWatered(created.data.id));
      expect(Date.parse(res.data.nextDueAt) - Date.parse(res.data.wateredAt)).toBe(17 * DAY_MS);
    });

    it('waters on the custom schedule once one is set', async () => {
      const client = makeClient();
      // p1 is basil: species default is 2 days for a COASTAL user.
      const before = await settle(client.plants.markWatered('p1'));
      expect(Date.parse(before.data.nextDueAt) - Date.parse(before.data.wateredAt)).toBe(2 * DAY_MS);

      await settle(client.schedules.create('p1', { type: 'WATER', intervalDays: 5 }));

      // The grower is looking at the actual pot; their interval wins from here.
      const after = await settle(client.plants.markWatered('p1'));
      expect(Date.parse(after.data.nextDueAt) - Date.parse(after.data.wateredAt)).toBe(5 * DAY_MS);
    });

    it('keeps using the species interval for a schedule with no custom days', async () => {
      const client = makeClient();
      // autoSchedule on the add-plant flow creates a WATER schedule with no
      // intervalDays — that must not be read as "0" or override anything.
      await settle(client.schedules.create('p1', { type: 'WATER' }));
      const res = await settle(client.plants.markWatered('p1'));
      expect(Date.parse(res.data.nextDueAt) - Date.parse(res.data.wateredAt)).toBe(2 * DAY_MS);
    });

    it('returns a mixed, paginated plant timeline', async () => {
      const client = makeClient();
      const page1 = await settle(client.plants.timeline('p1', { limit: 1 }));
      expect(page1.ok).toBe(true);
      expect(page1.data.items).toHaveLength(1);
      expect(page1.data.nextCursor).toBeTruthy();
      const page2 = await settle(
        client.plants.timeline('p1', { cursor: page1.data.nextCursor, limit: 5 }),
      );
      expect(page2.data.items.length).toBeGreaterThan(0);
      expect(page2.data.nextCursor).toBeNull();
      const mixed = await settle(client.plants.timeline('p2'));
      expect(mixed.data.items.some((item) => item.type === 'log')).toBe(true);
      expect(mixed.data.items.some((item) => item.type === 'diagnosis')).toBe(true);
    });

    it('appends growth logs via plants.logs.create', async () => {
      const client = makeClient();
      const created = await settle(client.plants.logs.create('p1', { note: 'New leaf' }));
      expect(created.ok).toBe(true);
      const timeline = await settle(client.plants.timeline('p1', { limit: 1 }));
      expect(timeline.data.items[0].id).toBe(created.data.id);
      const invalid = await settle(client.plants.logs.create('p1', {}));
      expect(invalid.error.code).toBe('VALIDATION');
    });

    it('validates schedule input', async () => {
      const client = makeClient();
      const valid = await settle(
        client.schedules.create('p1', { type: 'FERTILIZE', intervalDays: 14 }),
      );
      expect(valid.ok).toBe(true);
      const badType = await settle(client.schedules.create('p1', { type: 'PRUNE' }));
      expect(badType.error.code).toBe('VALIDATION');
      const badInterval = await settle(
        client.schedules.create('p1', { type: 'WATER', intervalDays: 0 }),
      );
      expect(badInterval.error.code).toBe('VALIDATION');
    });

    it('runs the async diagnosis flow: PENDING, then COMPLETE after ~3s', async () => {
      const client = makeClient();
      client.setNextDiagnosisFixture?.('diseased-tomato');
      const created = await settle(
        client.diagnoses.create({ plantId: 'p2', imageUri: 'assets/demo/plant-2.jpg' }),
      );
      expect(created.ok).toBe(true);
      expect(created.data.status).toBe('PENDING');
      const early = await settle(client.diagnoses.get(created.data.id));
      expect(early.data.status).toBe('PENDING');
      await wait(3100);
      const done = await settle(client.diagnoses.get(created.data.id));
      expect(done.data.status).toBe('COMPLETE');
      expect(done.data.lowConfidence).toBe(false);
      if (client.setNextDiagnosisFixture) {
        expect(done.data.result.species[0].scientificName).toBe('Solanum lycopersicum');
        expect(done.data.result.health.isHealthy).toBe(false);
        expect(done.data.result.health.issues[0].name).toBe('Early blight');
      }
    });

    it('flags low-confidence diagnoses (confidence < 0.55)', async () => {
      const client = makeClient();
      if (!client.setNextDiagnosisFixture) return;
      client.setNextDiagnosisFixture('blurry');
      const created = await settle(
        client.diagnoses.create({ imageUri: 'assets/demo/plant-3.jpg' }),
      );
      await wait(3100);
      const done = await settle(client.diagnoses.get(created.data.id));
      expect(done.data.status).toBe('COMPLETE');
      expect(done.data.lowConfidence).toBe(true);
    });

    it('attaches a diagnosis to a plant so it appears in its timeline', async () => {
      const client = makeClient();
      if (!client.setNextDiagnosisFixture) return;
      client.setNextDiagnosisFixture('healthy-basil');
      const created = await settle(client.diagnoses.create({ imageUri: 'x.jpg', mode: 'health' }));
      await wait(3100);
      await settle(client.diagnoses.get(created.data.id));
      const attached = await settle(client.diagnoses.attach(created.data.id, 'p3'));
      expect(attached.ok).toBe(true);
      expect(attached.data.plantId).toBe('p3');
      const timeline = await settle(client.plants.timeline('p3'));
      expect(timeline.data.items.some((item) => item.id === created.data.id)).toBe(true);
    });

    it('escalates a completed diagnosis into a HELP post', async () => {
      const client = makeClient();
      if (!client.setNextDiagnosisFixture) return;
      client.setNextDiagnosisFixture('diseased-tomato');
      const created = await settle(
        client.diagnoses.create({ imageUri: 'assets/demo/plant-2.jpg' }),
      );
      const tooEarly = await settle(client.diagnoses.escalate(created.data.id));
      expect(tooEarly.error.code).toBe('VALIDATION');
      await wait(3100);
      await settle(client.diagnoses.get(created.data.id));
      const post = await settle(
        client.diagnoses.escalate(created.data.id, { body: 'Reviewed draft about my tomato.' }),
      );
      expect(post.ok).toBe(true);
      expect(post.data.type).toBe('HELP');
      // The reviewed text is what gets posted, not the canned fallback.
      expect(post.data.body).toBe('Reviewed draft about my tomato.');
      expect(post.data.attachment).toMatchObject({
        imageUri: 'assets/demo/plant-2.jpg',
        topIssue: 'Early blight',
        confidence: 0.84,
      });
      // Without a reviewed body it still works, using the plain fallback.
      const plain = await settle(client.diagnoses.escalate(created.data.id));
      expect(plain.data.body).toMatch(/Need help with my plant/);

      const helpFeed = await settle(client.posts.list({ type: 'HELP' }));
      expect(helpFeed.data.some((entry) => entry.id === post.data.id)).toBe(true);
    });

    it('serves a paginated feed that hides pending posts from other users', async () => {
      const client = makeClient();
      const page1 = await settle(client.feed.list({ limit: 5 }));
      expect(page1.ok).toBe(true);
      expect(page1.data.items).toHaveLength(5);
      expect(page1.data.items[0].author.username).toBeTruthy();
      const page2 = await settle(client.feed.list({ cursor: page1.data.nextCursor, limit: 50 }));
      expect(page2.data.nextCursor).toBeNull();

      const flagged = await settle(
        client.posts.create({ body: 'demo', images: ['assets/demo/flagged.jpg'] }),
      );
      expect(flagged.data.status).toBe('PENDING_REVIEW');
      const mine = await settle(client.feed.list({ limit: 1 }));
      expect(mine.data.items[0].id).toBe(flagged.data.id);

      await settle(client.auth.login({ username: 'rana_gardens', password: 'password123' }));
      const theirs = await settle(client.feed.list({ limit: 50 }));
      expect(theirs.data.items.some((post) => post.id === flagged.data.id)).toBe(false);

      // Same rule, every read. posts.list used to skip it in the mock and hand
      // out other people's posts under review; nothing asserted it, so nothing
      // caught it.
      const theirList = await settle(client.posts.list());
      expect(theirList.data.some((post) => post.id === flagged.data.id)).toBe(false);

      const theirProfile = await settle(client.users.posts(flagged.data.authorId));
      expect(theirProfile.data.some((post) => post.id === flagged.data.id)).toBe(false);
    });

    it('paginates post comments', async () => {
      const client = makeClient();
      const page = await settle(client.posts.comments('post2', { limit: 1 }));
      expect(page.data.items).toHaveLength(1);
      expect(page.data.items[0].author.username).toBeTruthy();
      expect(page.data.nextCursor).toBeTruthy();
      const rest = await settle(
        client.posts.comments('post2', { cursor: page.data.nextCursor, limit: 10 }),
      );
      expect(rest.data.nextCursor).toBeNull();
    });

    it('exposes user profiles with follow state and their posts', async () => {
      const client = makeClient();
      const before = await settle(client.users.get('u2'));
      expect(before.data.user.username).toBe('rana_gardens');
      expect(before.data.following).toBe(true);
      await settle(client.social.unfollow('u2'));
      const after = await settle(client.users.get('u2'));
      expect(after.data.following).toBe(false);
      const posts = await settle(client.users.posts('u2'));
      expect(posts.data.length).toBeGreaterThan(0);
      expect(posts.data.every((post) => post.author.id === 'u2')).toBe(true);
    });

    it('creates posts and enforces body-or-images', async () => {
      const client = makeClient();
      const bodyOnly = await settle(client.posts.create({ body: 'Hello from the contract suite' }));
      expect(bodyOnly.ok).toBe(true);
      const empty = await settle(client.posts.create({}));
      expect(empty.error.code).toBe('VALIDATION');
      const whitespace = await settle(client.posts.create({ body: '   ' }));
      expect(whitespace.error.code).toBe('VALIDATION');
    });

    it('drafts a post body without creating anything', async () => {
      const client = makeClient();
      const before = await settle(client.posts.list());

      const draft = await settle(
        client.posts.draft({ plant: { nickname: 'Minty', ageDays: 92 } }),
      );
      expect(draft.ok).toBe(true);
      expect(typeof draft.data.body).toBe('string');
      expect(draft.data.body.length).toBeGreaterThan(0);

      // Drafting must never publish — the text goes to the composer, and the
      // person decides whether it becomes a post.
      const after = await settle(client.posts.list());
      expect(after.data).toHaveLength(before.data.length);
    });

    it('rejects a draft with nothing to write about', async () => {
      const client = makeClient();
      const empty = await settle(client.posts.draft({}));
      expect(empty.error.code).toBe('VALIDATION');
    });

    it('uploads a photo and takes its key wherever an image belongs', async () => {
      const client = makeClient();
      const uploaded = await settle(client.uploads.upload({ base64: TINY_IMAGE }));
      expect(uploaded.ok).toBe(true);
      // The key is opaque — a storage path live, a device URI in the mock — but
      // both clients must accept their own key back as an image.
      expect(typeof uploaded.data.key).toBe('string');
      expect(uploaded.data.url).toBeTruthy();

      const post = await settle(
        client.posts.create({ body: 'my basil', images: [uploaded.data.key] }),
      );
      expect(post.ok).toBe(true);
      expect(post.data.images).toHaveLength(1);
      expect(post.data.images[0]).toBeTruthy();

      const nothing = await settle(client.uploads.upload({}));
      expect(nothing.error.code).toBe('VALIDATION');
    });

    it('likes and comments on posts', async () => {
      const client = makeClient();
      // post4 has no seed likes, so the session user's like must increment the count
      const before = await settle(client.posts.get('post4'));
      const liked = await settle(client.posts.like('post4'));
      expect(liked.data.likeCount).toBe(before.data.likeCount + 1);
      const again = await settle(client.posts.like('post4'));
      expect(again.data.likeCount).toBe(liked.data.likeCount);
      const unliked = await settle(client.posts.unlike('post4'));
      expect(unliked.data.likeCount).toBe(before.data.likeCount);
      const comment = await settle(client.posts.comment('post4', 'Lovely plant!'));
      expect(comment.ok).toBe(true);
      const after = await settle(client.posts.get('post4'));
      expect(after.data.comments.some((entry) => entry.id === comment.data.id)).toBe(true);
      const blank = await settle(client.posts.comment('post4', '   '));
      expect(blank.error.code).toBe('VALIDATION');
    });

    it('follows and unfollows users', async () => {
      const client = makeClient();
      const follow = await settle(client.social.follow('u3'));
      expect(follow.data).toEqual({ following: true });
      const unfollow = await settle(client.social.unfollow('u3'));
      expect(unfollow.data).toEqual({ following: false });
      const missing = await settle(client.social.follow('ghost'));
      expect(missing.error.code).toBe('NOT_FOUND');
    });

    it('updates the profile climate zone via me.update', async () => {
      const client = makeClient();
      const updated = await settle(client.me.update({ climateZone: 'BEKAA' }));
      expect(updated.ok).toBe(true);
      expect(updated.data.user.climateZone).toBe('BEKAA');
      const invalid = await settle(client.me.update({ climateZone: 'DESERT' }));
      expect(invalid.error.code).toBe('VALIDATION');
    });

    it('validates device registration', async () => {
      const client = makeClient();
      const bad = await settle(client.devices.register({ pushToken: 'tok', platform: 'web' }));
      expect(bad.error.code).toBe('VALIDATION');
      const good = await settle(
        client.devices.register({ pushToken: 'ExponentPushToken[abc]', platform: 'android' }),
      );
      expect(good.data).toEqual({ registered: true });
    });

    it('handles the full auth lifecycle', async () => {
      const client = makeClient();
      const bad = await settle(
        client.auth.signup({ username: 'Bad Name', password: 'longenough1' }),
      );
      expect(bad.error.code).toBe('VALIDATION');
      const signup = await settle(
        client.auth.signup({ username: 'new_user_1', password: 'supersecret' }),
      );
      expect(signup.ok).toBe(true);
      const me = await settle(client.auth.me());
      expect(me.data.user.username).toBe('new_user_1');
      await settle(client.auth.logout());
      const anon = await settle(client.auth.me());
      expect(anon.data).toBeNull();
      const unauth = await settle(client.plants.list());
      expect(unauth.error.code).toBe('UNAUTHORIZED');
      const wrong = await settle(
        client.auth.login({ username: 'flora_demo', password: 'wrongpass' }),
      );
      expect(wrong.error.code).toBe('UNAUTHORIZED');
      const login = await settle(
        client.auth.login({ username: 'flora_demo', password: 'password123' }),
      );
      expect(login.ok).toBe(true);
      expect(login.data.user.id).toBe('u1');
    });
  });
}

describe('contract module', () => {
  it('exports a runner for client implementations', () => {
    expect(typeof runClientContract).toBe('function');
  });
});
