import { z } from 'zod';
import {
  AdoptSpeciesSchema,
  CreatePlantSchema,
  CreatePostSchema,
  CreateScheduleSchema,
  DraftPostSchema,
  ErrorCode,
  RegisterDeviceSchema,
  SignupSchema,
  SUGGESTABLE_SPECIES,
  UpdateMeSchema,
  binomial,
  defaultCareProfile,
  diagnosisFixtures,
  fail,
  fixtureNames,
  ok,
  seedComments,
  seedDiagnoses,
  seedFollows,
  seedGrowthLogs,
  seedLikes,
  seedPlants,
  seedPosts,
  seedSchedules,
  seedSession,
  seedSpecies,
  seedUsers,
} from '@flora/shared';
import { getPersistentStorage } from './storage.js';
import { cancelForPlant, scheduleWatering } from '../notifications/local.js';

const STORAGE_KEY = 'flora-mock-v1';
const PERSIST_DEBOUNCE_MS = 500;
const DIAGNOSIS_COMPLETE_AFTER_MS = 3000;
const LOW_CONFIDENCE_THRESHOLD = 0.55;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WATER_EVERY_DAYS = 7;

/** What a base64 "upload" resolves to offline: a bundled photo the app can render. */
const MOCK_UPLOAD_PHOTO = 'assets/demo/plant-1.jpg';

const IdSchema = z.string().min(1);
const LoginSchema = SignupSchema;
const CreateDiagnosisSchema = z.object({
  plantId: z.string().optional(),
  imageUri: z.string().min(1),
  mode: z.enum(['identify', 'health']).optional(),
});
const SpeciesQuerySchema = z.string().trim().min(1);
const TimelineOptionsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
const CommentBodySchema = z.string().trim().min(1);
const GrowthLogSchema = z
  .object({ photoKey: z.string().optional(), note: z.string().optional() })
  .refine((log) => Boolean(log.photoKey) || Boolean(log.note), {
    message: 'a growth log needs a photo or a note',
    path: ['note'],
  });

/** Deep-clone plain JSON data so callers can never mutate the store. */
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/**
 * Keep exactly one pending local notification per plant, anchored at nextDueAt.
 * Fire-and-forget: notification failures must never break the data flow.
 */
async function syncWateringReminder(plant) {
  try {
    if (plant.nextDueAt && new Date(plant.nextDueAt).getTime() > Date.now()) {
      await scheduleWatering({
        plantId: plant.id,
        nickname: plant.nickname,
        at: new Date(plant.nextDueAt),
      });
    } else {
      await cancelForPlant(plant.id);
    }
  } catch {
    // notifications unavailable (permissions, platform, tests) — ignore
  }
}

/** Re-anchor nextDueAt after a WATER schedule change, then sync the reminder. */
function refreshWateringAnchor(plant, scheduleData) {
  if (scheduleData.type !== 'WATER') return;
  if (scheduleData.intervalDays && plant.lastWateredAt) {
    plant.nextDueAt = new Date(
      new Date(plant.lastWateredAt).getTime() + scheduleData.intervalDays * DAY_MS,
    ).toISOString();
  }
  void syncWateringReminder(plant);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an isolated mock client instance.
 * @param {{ storage?: { getItem: Function, setItem: Function, removeItem: Function } }} [options]
 *   storage — AsyncStorage-compatible store; defaults to the registered persistent
 *   storage (see storage.js). Tests inject createMemoryStorage() for isolation.
 */
export function createMockClient({ storage } = {}) {
  let store = null;
  let readyPromise = null;
  let persistTimer = null;
  let nextFixtureName = null;
  let idCounter = 0;

  const getStorage = () => storage ?? getPersistentStorage();

  const freshStore = () =>
    clone({
      users: seedUsers,
      session: seedSession,
      species: seedSpecies,
      plants: seedPlants,
      schedules: seedSchedules,
      growthLogs: seedGrowthLogs,
      diagnoses: seedDiagnoses,
      posts: seedPosts,
      comments: seedComments,
      likes: seedLikes,
      follows: seedFollows,
    });

  async function hydrate() {
    try {
      const raw = await getStorage().getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users)) {
          store = parsed;
          return;
        }
      }
    } catch {
      // corrupted snapshot — fall through and reseed
    }
    store = freshStore();
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      getStorage()
        .setItem(STORAGE_KEY, JSON.stringify(store))
        .catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Every public method: hydrate once, simulate network latency, then run. */
  async function call(fn) {
    if (!readyPromise) readyPromise = hydrate();
    await readyPromise;
    await delay(300 + Math.random() * 500);
    return fn();
  }

  function makeId(prefix) {
    idCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
  }

  function parseWith(schema, input) {
    const result = schema.safeParse(input);
    if (result.success) return { data: result.data };
    const issue = result.error.issues[0];
    const path = issue.path.join('.');
    return {
      error: fail(ErrorCode.VALIDATION, path ? `${path}: ${issue.message}` : issue.message),
    };
  }

  const publicUser = ({ id, username, displayName, climateZone }) => ({
    id,
    username,
    displayName,
    climateZone,
  });

  function currentUser() {
    if (!store.session) return null;
    return store.users.find((user) => user.id === store.session.userId) ?? null;
  }

  const notLoggedIn = () => fail(ErrorCode.UNAUTHORIZED, 'not logged in');

  const likeCount = (postId) => store.likes.filter((like) => like.postId === postId).length;

  const authorOf = (authorId) =>
    publicUser(
      store.users.find((entry) => entry.id === authorId) ?? {
        id: authorId,
        username: 'unknown',
        displayName: 'Unknown',
        climateZone: null,
      },
    );

  const postView = (post, viewer) => ({
    ...clone(post),
    status: post.status ?? 'PUBLISHED',
    author: authorOf(post.authorId),
    likeCount: likeCount(post.id),
    likedByMe: viewer
      ? store.likes.some((like) => like.postId === post.id && like.userId === viewer.id)
      : false,
    commentCount: store.comments.filter((comment) => comment.postId === post.id).length,
  });

  const commentView = (comment) => ({
    ...clone(comment),
    author: authorOf(comment.authorId),
  });

  /**
   * Posts visible to a viewer: everything published, plus their own pending ones.
   *
   * `viewer` may be null — posts.list answers logged out — and a null viewer
   * owns nothing, so they see only what is published.
   */
  const visiblePosts = (viewer) =>
    store.posts.filter(
      (post) => (post.status ?? 'PUBLISHED') !== 'PENDING_REVIEW' || post.authorId === viewer?.id,
    );

  return {
    auth: {
      /** Create an account and start a session. Validates SignupSchema. */
      signup(input) {
        return call(() => {
          const { data, error } = parseWith(SignupSchema, input);
          if (error) return error;
          if (store.users.some((user) => user.username === data.username)) {
            return fail(ErrorCode.VALIDATION, 'username: already taken');
          }
          const user = {
            id: makeId('u'),
            username: data.username,
            password: data.password,
            displayName: data.username,
            climateZone: 'COASTAL',
          };
          store.users.push(user);
          store.session = { userId: user.id, token: makeId('tok') };
          schedulePersist();
          return ok({ user: publicUser(user) });
        });
      },
      /** Log in an existing user by username + password. */
      login(input) {
        return call(() => {
          const { data, error } = parseWith(LoginSchema, input);
          if (error) return error;
          const user = store.users.find((candidate) => candidate.username === data.username);
          if (!user || user.password !== data.password) {
            return fail(ErrorCode.UNAUTHORIZED, 'invalid username or password');
          }
          store.session = { userId: user.id, token: makeId('tok') };
          schedulePersist();
          return ok({ user: publicUser(user) });
        });
      },
      /** End the current session. */
      logout() {
        return call(() => {
          store.session = null;
          schedulePersist();
          return ok(null);
        });
      },
      /** The current session user, or null when logged out. */
      me() {
        return call(() => {
          const user = currentUser();
          return ok(user ? { user: publicUser(user) } : null);
        });
      },
    },

    me: {
      /** Update the signed-in user's profile. Validates UpdateMeSchema. */
      update(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { data, error } = parseWith(UpdateMeSchema, input);
          if (error) return error;
          Object.assign(user, data);
          schedulePersist();
          return ok({ user: publicUser(user) });
        });
      },
    },

    species: {
      /** Full species catalog. */
      list() {
        return call(() => ok(clone(store.species)));
      },
      /** Case-insensitive substring search across common and scientific names. */
      search(query) {
        return call(() => {
          const { data, error } = parseWith(SpeciesQuerySchema, query);
          if (error) return error;
          const q = data.toLowerCase();
          return ok(
            clone(
              store.species.filter(
                (species) =>
                  species.scientificName.toLowerCase().includes(q) ||
                  species.commonNames.some((name) => name.toLowerCase().includes(q)),
              ),
            ),
          );
        });
      },
      /**
       * Species not in the catalog yet.
       *
       * The live client asks Plant.id; offline there is a short bundled list,
       * because the mock has to keep working in airplane mode and a path that
       * silently returns nothing would look identical to a broken one. Rows
       * carry no id — nothing is real until it is adopted.
       */
      suggest(query) {
        return call(() => {
          const { data, error } = parseWith(SpeciesQuerySchema, query);
          if (error) return error;

          const q = data.toLowerCase();
          const known = new Set(store.species.map((entry) => binomial(entry.scientificName)));

          return ok(
            clone(
              SUGGESTABLE_SPECIES.filter(
                (entry) =>
                  !known.has(binomial(entry.scientificName)) &&
                  (entry.scientificName.toLowerCase().includes(q) ||
                    entry.commonNames.some((name) => name.toLowerCase().includes(q))),
              ),
            ),
          );
        });
      },
      /**
       * Add a species to the catalog so a plant can point at it.
       *
       * Idempotent on the binomial, matching the API: two taps produce one
       * species. The care profile is the neutral default rather than anything
       * model-written — offline there is no model, and the honest answer to
       * "how often does this want water" is the generic weekly one.
       */
      adopt(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();

          const { data, error } = parseWith(AdoptSpeciesSchema, input);
          if (error) return error;

          const key = binomial(data.scientificName);
          if (!key) return fail(ErrorCode.VALIDATION, 'scientificName must name a genus and species');

          const existing = store.species.find(
            (entry) => binomial(entry.scientificName) === key,
          );
          if (existing) return ok(clone(existing));

          const species = {
            id: makeId('sp'),
            scientificName: data.scientificName,
            commonNames: data.commonNames,
            ...defaultCareProfile(),
            source: 'ADOPTED',
            sortOrder: 1000,
          };
          store.species.push(species);
          schedulePersist();
          return ok(clone(species));
        });
      },
      /** One species by id. */
      get(id) {
        return call(() => {
          const { error } = parseWith(IdSchema, id);
          if (error) return error;
          const species = store.species.find((entry) => entry.id === id);
          return species
            ? ok(clone(species))
            : fail(ErrorCode.NOT_FOUND, `species ${id} not found`);
        });
      },
    },

    plants: {
      /** The session user's plants. */
      list() {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          return ok(clone(store.plants.filter((plant) => plant.ownerId === user.id)));
        });
      },
      /** One plant with its schedules and growth logs. */
      get(id) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const plant = store.plants.find((entry) => entry.id === id && entry.ownerId === user.id);
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${id} not found`);
          return ok({
            ...clone(plant),
            schedules: clone(store.schedules.filter((schedule) => schedule.plantId === plant.id)),
            growthLogs: clone(store.growthLogs.filter((log) => log.plantId === plant.id)),
          });
        });
      },
      /** Add a plant. Validates CreatePlantSchema. */
      create(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { data, error } = parseWith(CreatePlantSchema, input);
          if (error) return error;
          const plant = {
            id: makeId('p'),
            ownerId: user.id,
            nickname: data.nickname,
            speciesId: data.speciesId ?? null,
            photoKey: data.photoKey ?? null,
            createdAt: new Date().toISOString(),
            lastWateredAt: null,
            nextDueAt: null,
          };
          store.plants.push(plant);
          schedulePersist();
          return ok(clone(plant));
        });
      },
      /**
       * Record a watering. nextDueAt = now + intervalDays·24h where intervalDays =
       * max(1, round(species.care.waterEveryDays × zoneMultiplier(user.climateZone))).
       */
      markWatered(plantId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, plantId);
          if (error) return error;
          const plant = store.plants.find(
            (entry) => entry.id === plantId && entry.ownerId === user.id,
          );
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
          const species = store.species.find((entry) => entry.id === plant.speciesId);
          const waterEveryDays = species?.care.waterEveryDays ?? DEFAULT_WATER_EVERY_DAYS;
          const multiplier = species?.zoneMultipliers?.[user.climateZone] ?? 1;
          // A custom WATER schedule wins over the species default. The grower is
          // looking at the actual pot, soil and window; the catalog is a guess
          // for the species in the abstract. Without this the stepper on the
          // plant screen silently reverted the moment they watered.
          const custom = store.schedules.find(
            (entry) => entry.plantId === plant.id && entry.type === 'WATER',
          )?.intervalDays;
          const intervalDays = custom ?? Math.max(1, Math.round(waterEveryDays * multiplier));
          const wateredAt = Date.now();
          plant.lastWateredAt = new Date(wateredAt).toISOString();
          plant.nextDueAt = new Date(wateredAt + intervalDays * DAY_MS).toISOString();
          schedulePersist();
          void syncWateringReminder(plant);
          return ok({
            plantId: plant.id,
            wateredAt: plant.lastWateredAt,
            nextDueAt: plant.nextDueAt,
          });
        });
      },
      logs: {
        /** Append a growth log entry (photo and/or note). */
        create(plantId, input) {
          return call(() => {
            const user = currentUser();
            if (!user) return notLoggedIn();
            const idCheck = parseWith(IdSchema, plantId);
            if (idCheck.error) return idCheck.error;
            const { data, error } = parseWith(GrowthLogSchema, input);
            if (error) return error;
            const plant = store.plants.find(
              (entry) => entry.id === plantId && entry.ownerId === user.id,
            );
            if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
            const log = {
              id: makeId('gl'),
              plantId: plant.id,
              photoKey: data.photoKey ?? null,
              note: data.note ?? null,
              createdAt: new Date().toISOString(),
            };
            store.growthLogs.push(log);
            schedulePersist();
            return ok(clone(log));
          });
        },
      },
      /**
       * Cursor-paginated timeline mixing 'log' and completed 'diagnosis' items,
       * newest first. Returns { items, nextCursor }.
       */
      timeline(plantId, options = {}) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const idCheck = parseWith(IdSchema, plantId);
          if (idCheck.error) return idCheck.error;
          const { data, error } = parseWith(TimelineOptionsSchema, options ?? {});
          if (error) return error;
          const plant = store.plants.find(
            (entry) => entry.id === plantId && entry.ownerId === user.id,
          );
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
          const logItems = store.growthLogs
            .filter((log) => log.plantId === plantId)
            .map((log) => ({
              type: 'log',
              id: log.id,
              createdAt: log.createdAt,
              photoKey: log.photoKey,
              note: log.note,
            }));
          const diagnosisItems = store.diagnoses
            .filter((entry) => entry.plantId === plantId && entry.status === 'COMPLETE')
            .map((entry) => ({
              type: 'diagnosis',
              id: entry.id,
              createdAt: new Date(entry.createdAt).toISOString(),
              isHealthy: entry.result.health.isHealthy,
              topIssue: entry.result.health.issues[0]?.name ?? null,
              confidence: entry.result.health.confidence,
              lowConfidence: entry.lowConfidence,
            }));
          const items = [...logItems, ...diagnosisItems].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1,
          );
          const start = data.cursor ? Number(data.cursor) : 0;
          const limit = data.limit ?? 10;
          const page = items.slice(start, start + limit);
          const nextIndex = start + limit;
          return ok({
            items: clone(page),
            nextCursor: nextIndex < items.length ? String(nextIndex) : null,
          });
        });
      },
    },

    schedules: {
      /** Care schedules for one plant. */
      list(plantId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, plantId);
          if (error) return error;
          const plant = store.plants.find(
            (entry) => entry.id === plantId && entry.ownerId === user.id,
          );
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
          return ok(clone(store.schedules.filter((schedule) => schedule.plantId === plantId)));
        });
      },
      /**
       * Add or update a care schedule — upserts per (plant, type) so setting a
       * new interval replaces the old schedule instead of stacking duplicates.
       * Validates CreateScheduleSchema.
       */
      create(plantId, input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const idCheck = parseWith(IdSchema, plantId);
          if (idCheck.error) return idCheck.error;
          const { data, error } = parseWith(CreateScheduleSchema, input);
          if (error) return error;
          const plant = store.plants.find(
            (entry) => entry.id === plantId && entry.ownerId === user.id,
          );
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
          const existing = store.schedules.find(
            (schedule) => schedule.plantId === plant.id && schedule.type === data.type,
          );
          if (existing) {
            if (data.intervalDays !== undefined) existing.intervalDays = data.intervalDays;
            refreshWateringAnchor(plant, data);
            schedulePersist();
            return ok(clone(existing));
          }
          const schedule = {
            id: makeId('sch'),
            plantId: plant.id,
            type: data.type,
            intervalDays: data.intervalDays ?? null,
            createdAt: new Date().toISOString(),
          };
          store.schedules.push(schedule);
          refreshWateringAnchor(plant, data);
          schedulePersist();
          return ok(clone(schedule));
        });
      },
    },

    uploads: {
      /**
       * "Store" a photo and hand back the key it can be referenced by.
       *
       * There is nowhere to put bytes here and, by design, no network to put
       * them over — so the mock keeps the address it was given: a picked photo
       * stays its own device URI, which is exactly what this app renders in
       * mock mode. The live client's keys point at real storage; both answers
       * are a string other calls accept as an image, which is what the contract
       * is about.
       *
       * @param {{base64?: string, uri?: string, contentType?: string}} source
       */
      upload(source = {}) {
        return call(() => {
          const key = source.uri ?? (source.base64 ? MOCK_UPLOAD_PHOTO : null);
          if (!key) return fail(ErrorCode.VALIDATION, 'nothing to upload: pass base64 or uri');
          return ok({ key, url: key });
        });
      },
    },

    diagnoses: {
      /** Start an async diagnosis for a photo; completes ~3s later (see get()). */
      create(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { data, error } = parseWith(CreateDiagnosisSchema, input);
          if (error) return error;
          const fixtureName =
            nextFixtureName ?? fixtureNames[Math.floor(Math.random() * fixtureNames.length)];
          nextFixtureName = null;
          const diagnosis = {
            id: makeId('dg'),
            userId: user.id,
            plantId: data.plantId ?? null,
            imageUri: data.imageUri,
            mode: data.mode ?? null,
            status: 'PENDING',
            fixtureName,
            createdAt: Date.now(),
            result: null,
            lowConfidence: null,
          };
          store.diagnoses.push(diagnosis);
          schedulePersist();
          return ok({ id: diagnosis.id, status: diagnosis.status });
        });
      },
      /**
       * Poll a diagnosis. Flips PENDING → COMPLETE once ~3s have elapsed, attaching
       * the canned RecognitionResult; lowConfidence when confidence < 0.55.
       */
      get(id) {
        return call(() => {
          const { error } = parseWith(IdSchema, id);
          if (error) return error;
          const diagnosis = store.diagnoses.find((entry) => entry.id === id);
          if (!diagnosis) return fail(ErrorCode.NOT_FOUND, `diagnosis ${id} not found`);
          if (
            diagnosis.status === 'PENDING' &&
            Date.now() - diagnosis.createdAt >= DIAGNOSIS_COMPLETE_AFTER_MS
          ) {
            const result = clone(
              diagnosisFixtures[diagnosis.fixtureName] ?? diagnosisFixtures.blurry,
            );
            diagnosis.status = 'COMPLETE';
            diagnosis.result = result;
            diagnosis.lowConfidence = result.health.confidence < LOW_CONFIDENCE_THRESHOLD;
            schedulePersist();
          }
          return ok(
            clone({
              id: diagnosis.id,
              plantId: diagnosis.plantId,
              imageUri: diagnosis.imageUri,
              status: diagnosis.status,
              result: diagnosis.result,
              lowConfidence: diagnosis.lowConfidence,
            }),
          );
        });
      },
      /** Attach a diagnosis to one of the user's plants (shows in its timeline). */
      attach(id, plantId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const idCheck = parseWith(IdSchema, id);
          if (idCheck.error) return idCheck.error;
          const plantCheck = parseWith(IdSchema, plantId);
          if (plantCheck.error) return plantCheck.error;
          const diagnosis = store.diagnoses.find((entry) => entry.id === id);
          if (!diagnosis) return fail(ErrorCode.NOT_FOUND, `diagnosis ${id} not found`);
          const plant = store.plants.find(
            (entry) => entry.id === plantId && entry.ownerId === user.id,
          );
          if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantId} not found`);
          diagnosis.plantId = plant.id;
          schedulePersist();
          return ok({ id: diagnosis.id, plantId: plant.id });
        });
      },
      /**
       * Turn a completed diagnosis into a community HELP post.
       *
       * `body` is what the person actually wants to say — normally a drafted
       * post they have read and edited. Without it, fall back to a plain
       * sentence built from the top issue, so escalating still works when
       * drafting is unavailable.
       * @param {string} id
       * @param {{body?: string}} [input]
       */
      escalate(id, input = {}) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, id);
          if (error) return error;
          const diagnosis = store.diagnoses.find((entry) => entry.id === id);
          if (!diagnosis) return fail(ErrorCode.NOT_FOUND, `diagnosis ${id} not found`);
          if (diagnosis.status !== 'COMPLETE') {
            return fail(ErrorCode.VALIDATION, 'diagnosis is still processing — try again shortly');
          }
          const topIssue = diagnosis.result.health.issues[0]?.name ?? null;
          const confidence = diagnosis.result.health.confidence;
          const post = {
            id: makeId('post'),
            authorId: user.id,
            type: 'HELP',
            body:
              input.body?.trim() ||
              (topIssue
                ? `Need help with my plant — the diagnosis suggests "${topIssue}". Any advice?`
                : 'Need help figuring out what is wrong with my plant. Any advice?'),
            images: [diagnosis.imageUri],
            attachment: { imageUri: diagnosis.imageUri, topIssue, confidence },
            createdAt: new Date().toISOString(),
          };
          store.posts.unshift(post);
          schedulePersist();
          return ok(postView(post, user));
        });
      },
    },

    feed: {
      /**
       * Cursor-paginated community feed, newest first. Other users' posts that
       * are under review are hidden; the author sees their own with the status.
       */
      list(options = {}) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { data, error } = parseWith(TimelineOptionsSchema, options ?? {});
          if (error) return error;
          const visible = visiblePosts(user);
          const start = data.cursor ? Number(data.cursor) : 0;
          const limit = data.limit ?? 10;
          const page = visible.slice(start, start + limit);
          const nextIndex = start + limit;
          return ok({
            items: page.map((post) => postView(post, user)),
            nextCursor: nextIndex < visible.length ? String(nextIndex) : null,
          });
        });
      },
    },

    users: {
      /** A user's public profile plus whether the viewer follows them. */
      get(userId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, userId);
          if (error) return error;
          const target = store.users.find((entry) => entry.id === userId);
          if (!target) return fail(ErrorCode.NOT_FOUND, `user ${userId} not found`);
          return ok({
            user: publicUser(target),
            following: store.follows.some(
              (follow) => follow.followerId === user.id && follow.followeeId === target.id,
            ),
          });
        });
      },
      /** A user's visible posts, newest first. */
      posts(userId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, userId);
          if (error) return error;
          const target = store.users.find((entry) => entry.id === userId);
          if (!target) return fail(ErrorCode.NOT_FOUND, `user ${userId} not found`);
          return ok(
            visiblePosts(user)
              .filter((post) => post.authorId === target.id)
              .map((post) => postView(post, user)),
          );
        });
      },
    },

    posts: {
      /**
       * Community feed, optionally filtered by type ('GENERAL' | 'HELP').
       *
       * Filtered by visibility like every other read. It used to return the
       * whole store, which handed every viewer other people's posts still under
       * review — the one place the mock disagreed with the API about who can
       * see what.
       */
      list(filter = {}) {
        return call(() => {
          const viewer = currentUser();
          const type = filter?.type;
          const posts = visiblePosts(viewer).filter((post) => !type || post.type === type);
          return ok(posts.map((post) => postView(post, viewer)));
        });
      },
      /** One post with its comments. */
      get(id) {
        return call(() => {
          const { error } = parseWith(IdSchema, id);
          if (error) return error;
          const post = store.posts.find((entry) => entry.id === id);
          if (!post) return fail(ErrorCode.NOT_FOUND, `post ${id} not found`);
          return ok({
            ...postView(post, currentUser()),
            comments: store.comments
              .filter((comment) => comment.postId === post.id)
              .map(commentView),
          });
        });
      },
      /** Cursor-paginated comments for a post, oldest first. */
      comments(postId, options = {}) {
        return call(() => {
          const idCheck = parseWith(IdSchema, postId);
          if (idCheck.error) return idCheck.error;
          const { data, error } = parseWith(TimelineOptionsSchema, options ?? {});
          if (error) return error;
          const post = store.posts.find((entry) => entry.id === postId);
          if (!post) return fail(ErrorCode.NOT_FOUND, `post ${postId} not found`);
          const all = store.comments.filter((comment) => comment.postId === postId);
          const start = data.cursor ? Number(data.cursor) : 0;
          const limit = data.limit ?? 10;
          const nextIndex = start + limit;
          return ok({
            items: all.slice(start, start + limit).map(commentView),
            nextCursor: nextIndex < all.length ? String(nextIndex) : null,
          });
        });
      },
      /**
       * Draft a post body offline.
       *
       * The real draft is written by a model on the API; the mock composes a
       * plausible one from the same inputs so the composer's "write it for me"
       * button works in airplane mode, which the demo depends on.
       * @param {{diagnosis?: object|null, plant?: object|null}} input
       */
      draft(input = {}) {
        return call(() => {
          const { data, error } = parseWith(DraftPostSchema, input);
          if (error) return error;

          const topIssue = data.diagnosis?.health?.issues?.[0] ?? null;
          const species = data.diagnosis?.species?.[0];
          const name = data.plant?.nickname ?? species?.commonNames?.[0] ?? 'my plant';

          if (topIssue) {
            return ok({
              body:
                `Something is wrong with ${name} — the app thinks it might be ` +
                `${topIssue.name.toLowerCase()}. I have pulled off the worst leaves so far. ` +
                `Has anyone dealt with this before?`,
            });
          }

          const age = data.plant?.ageDays;
          const howLong =
            typeof age === 'number' && age >= 30 ? ` after ${Math.round(age / 30)} months` : '';
          return ok({
            body: `Look at ${name}${howLong} — finally filling out. Any tips for keeping it going?`,
          });
        });
      },
      /** Publish a post. Validates CreatePostSchema (body and/or images required). */
      create(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { data, error } = parseWith(CreatePostSchema, input);
          if (error) return error;
          const post = {
            id: makeId('post'),
            authorId: user.id,
            type: 'GENERAL',
            body: data.body ?? '',
            images: data.images ?? [],
            attachment: null,
            // demo moderation: images named "flagged" go through review first
            status: (data.images ?? []).some((image) => String(image).includes('flagged'))
              ? 'PENDING_REVIEW'
              : 'PUBLISHED',
            createdAt: new Date().toISOString(),
          };
          store.posts.unshift(post);
          schedulePersist();
          return ok(postView(post, user));
        });
      },
      /** Like a post (idempotent per user). */
      like(id) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const post = store.posts.find((entry) => entry.id === id);
          if (!post) return fail(ErrorCode.NOT_FOUND, `post ${id} not found`);
          if (!store.likes.some((like) => like.postId === id && like.userId === user.id)) {
            store.likes.push({ postId: id, userId: user.id });
            schedulePersist();
          }
          return ok({ likeCount: likeCount(id), likedByMe: true });
        });
      },
      /** Remove a like. */
      unlike(id) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const post = store.posts.find((entry) => entry.id === id);
          if (!post) return fail(ErrorCode.NOT_FOUND, `post ${id} not found`);
          store.likes = store.likes.filter(
            (like) => !(like.postId === id && like.userId === user.id),
          );
          schedulePersist();
          return ok({ likeCount: likeCount(id), likedByMe: false });
        });
      },
      /** Comment on a post. */
      comment(postId, body) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const idCheck = parseWith(IdSchema, postId);
          if (idCheck.error) return idCheck.error;
          const { data, error } = parseWith(CommentBodySchema, body);
          if (error) return error;
          const post = store.posts.find((entry) => entry.id === postId);
          if (!post) return fail(ErrorCode.NOT_FOUND, `post ${postId} not found`);
          const comment = {
            id: makeId('c'),
            postId: post.id,
            authorId: user.id,
            body: data,
            createdAt: new Date().toISOString(),
          };
          store.comments.push(comment);
          schedulePersist();
          return ok(clone(comment));
        });
      },
    },

    social: {
      /** Follow another user. */
      follow(userId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, userId);
          if (error) return error;
          const target = store.users.find((entry) => entry.id === userId);
          if (!target) return fail(ErrorCode.NOT_FOUND, `user ${userId} not found`);
          if (target.id === user.id) return fail(ErrorCode.VALIDATION, 'cannot follow yourself');
          if (
            !store.follows.some(
              (follow) => follow.followerId === user.id && follow.followeeId === target.id,
            )
          ) {
            store.follows.push({ followerId: user.id, followeeId: target.id });
            schedulePersist();
          }
          return ok({ following: true });
        });
      },
      /** Unfollow a user. */
      unfollow(userId) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(IdSchema, userId);
          if (error) return error;
          const target = store.users.find((entry) => entry.id === userId);
          if (!target) return fail(ErrorCode.NOT_FOUND, `user ${userId} not found`);
          store.follows = store.follows.filter(
            (follow) => !(follow.followerId === user.id && follow.followeeId === target.id),
          );
          schedulePersist();
          return ok({ following: false });
        });
      },
    },

    devices: {
      /** Register a push token. Validates RegisterDeviceSchema. */
      register(input) {
        return call(() => {
          const user = currentUser();
          if (!user) return notLoggedIn();
          const { error } = parseWith(RegisterDeviceSchema, input);
          if (error) return error;
          return ok({ registered: true });
        });
      },
    },

    /**
     * Mock-only: force the next diagnoses.create() to use a specific canned fixture.
     * @param {'healthy-basil'|'diseased-tomato'|'blurry'} name
     */
    setNextDiagnosisFixture(name) {
      if (!fixtureNames.includes(name)) {
        throw new Error(
          `unknown diagnosis fixture "${name}" — expected one of: ${fixtureNames.join(', ')}`,
        );
      }
      nextFixtureName = name;
    },

    /**
     * Mock-only: adopt a diagnosis that was produced elsewhere.
     *
     * Bridges the live-scan mode (EXPO_PUBLIC_LIVE_SCAN=1), where the scan runs
     * against the real API but plants and posts are still mock-backed. Without
     * this, "Save to plant" and "Ask the community" would not find a server-side
     * diagnosis in the mock store and would fail with NOT_FOUND.
     *
     * Existing ids are replaced rather than duplicated, so re-polling a
     * completed diagnosis is idempotent.
     *
     * @param {{id: string, plantId?: string|null, imageUri?: string|null, mode?: string|null, result: object, lowConfidence?: boolean|null}} diagnosis
     */
    importDiagnosis(diagnosis) {
      return call(() => {
        const user = currentUser();
        if (!user) return notLoggedIn();
        if (!diagnosis?.id || !diagnosis?.result) {
          return fail(ErrorCode.VALIDATION, 'importDiagnosis needs an id and a result');
        }

        const row = {
          id: diagnosis.id,
          userId: user.id,
          plantId: diagnosis.plantId ?? null,
          imageUri: diagnosis.imageUri ?? null,
          mode: diagnosis.mode ?? null,
          status: 'COMPLETE',
          fixtureName: null,
          createdAt: Date.now(),
          result: clone(diagnosis.result),
          lowConfidence: diagnosis.lowConfidence ?? null,
        };

        const index = store.diagnoses.findIndex((entry) => entry.id === row.id);
        if (index >= 0) store.diagnoses[index] = row;
        else store.diagnoses.push(row);

        schedulePersist();
        return ok({ id: row.id });
      });
    },

    /** Mock-only: wipe the persisted snapshot and restore the seed data. */
    async reset() {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await getStorage().removeItem(STORAGE_KEY);
      store = freshStore();
      readyPromise = Promise.resolve();
      return ok(null);
    },
  };
}

/** Default shared instance used by the app (persists via the registered storage). */
export const mockClient = createMockClient();
