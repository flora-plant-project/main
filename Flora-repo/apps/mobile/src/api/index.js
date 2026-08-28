import { liveClient } from './liveClient.js';
import { mockClient } from './mockClient.js';

/**
 * Flora data client — the ONLY gateway mobile screens may use (screens never
 * call fetch directly). Selected by EXPO_PUBLIC_API_MODE: 'mock' (default) or 'live'.
 *
 * Every method is async and resolves to an ApiResponse envelope from @flora/shared:
 * `{ ok: true, data }` on success, `{ ok: false, error: { code, message } }` on failure
 * (codes come from ErrorCode: VALIDATION, UNAUTHORIZED, NOT_FOUND, RATE_LIMITED,
 * PROVIDER_ERROR, INTERNAL).
 *
 * Interface:
 *
 *   auth.signup({ username, password })            → { user }        SignupSchema; starts a session
 *   auth.login({ username, password })             → { user }
 *   auth.logout()                                  → null
 *   auth.me()                                      → { user } | null
 *
 *   me.update({ climateZone })                     → { user }        UpdateMeSchema
 *
 *   species.list()                                 → SpeciesDto[]
 *   species.search(query)                          → SpeciesDto[]    common/scientific substring match
 *   species.get(id)                                → SpeciesDto
 *
 *   plants.list()                                  → Plant[]         session user's plants
 *   plants.get(id)                                 → Plant + { schedules, growthLogs }
 *   plants.create(input)                           → Plant           CreatePlantSchema
 *   plants.markWatered(id)                         → { plantId, wateredAt, nextDueAt }
 *                                                     nextDueAt = now + the plant's WATER
 *                                                     schedule intervalDays when it has one,
 *                                                     otherwise max(1, round(
 *                                                     species.waterEveryDays × zoneMultiplier(user.climateZone))) days
 *   plants.logs.create(plantId, { photoKey?, note? }) → GrowthLog
 *   plants.timeline(plantId, { cursor?, limit? })  → { items, nextCursor }
 *                                                     'log' and completed 'diagnosis' items, newest first
 *
 *   schedules.list(plantId)                        → Schedule[]
 *   schedules.create(plantId, input)               → Schedule        CreateScheduleSchema
 *
 *   uploads.upload({ base64?, uri?, contentType? }) → { key, url }
 *                                                     live: signs an upload, PUTs the bytes to storage;
 *                                                     mock: keeps the device URI it was handed.
 *                                                     A key is accepted anywhere an image is.
 *
 *   diagnoses.create({ plantId?, imageUri, imageBase64?, mode? })
 *                                                  → { id, status: 'PENDING' }  mode: 'identify' | 'health'
 *                                                     live: uploads the photo, posts its key (falls back
 *                                                     to inline bytes if the upload fails);
 *                                                     mock: keeps imageUri and ignores imageBase64.
 *   diagnoses.get(id)                              → Diagnosis       flips to COMPLETE after ~3s (mock);
 *                                                     lowConfidence: true when confidence < 0.55
 *   diagnoses.attach(id, plantId)                  → { id, plantId }  links a diagnosis to a plant
 *   diagnoses.escalate(id, { body? })              → Post            HELP post embedding
 *                                                     { imageUri, topIssue, confidence };
 *                                                     `body` is the reviewed draft, falling
 *                                                     back to plain wording when absent
 *
 *   feed.list({ cursor?, limit? })                 → { items, nextCursor }  author + likedByMe enriched;
 *                                                     others' PENDING_REVIEW posts hidden
 *   users.get(userId)                              → { user, following }
 *   users.posts(userId)                            → Post[]          that user's visible posts
 *
 *   posts.draft({ diagnosis?, plant? })             → { body }  LLM-written post body;
 *                                                     needs a diagnosis, a plant, or both.
 *                                                     Creates nothing — prefills the composer.
 *   posts.list({ type? })                          → Post[]
 *   posts.get(id)                                  → Post + { comments }
 *   posts.create(input)                            → Post            CreatePostSchema; status
 *                                                     PENDING_REVIEW when moderation flags an image.
 *                                                     live: uploads any file:// image first
 *   posts.comments(postId, { cursor?, limit? })    → { items, nextCursor }
 *   posts.like(id) / posts.unlike(id)              → { likeCount, likedByMe }
 *   posts.comment(postId, body)                    → Comment
 *
 *   social.follow(userId) / social.unfollow(userId) → { following }
 *
 *   devices.register(input)                        → { registered: true }  RegisterDeviceSchema
 *
 * Extra properties:
 *   sendsImageBytes  true when diagnoses.create needs imageBase64 (live scanning)
 *
 * Mock-only helpers (absent on the live client):
 *   setNextDiagnosisFixture('healthy-basil' | 'diseased-tomato' | 'blurry'), reset(),
 *   importDiagnosis(diagnosis)
 *
 * In live mode the session is a bearer token held by session.js. Call
 * restoreToken() once at startup, before the first request, so a signed-in user
 * survives a restart.
 */

const isLiveMode = process.env.EXPO_PUBLIC_API_MODE === 'live';

/**
 * Live-scan mode: run the real Plant.id scanner while the rest of the app stays
 * on the offline mock.
 *
 * No longer a workaround for a half-built API — the live client implements the
 * whole interface now. It survives because 'mock' has to stay fully offline for
 * the mentor demo (docs/demo-script.md flips airplane mode on stage) while the
 * scan is the one thing worth showing against the real provider.
 *
 * Scoped deliberately: only create/get and posts.draft go to the server.
 * attach/escalate stay mock-backed — the API implements them now, but in this
 * mode the plants and posts they touch live in the mock store, not the
 * database. posts.draft can cross over because it reads nothing and creates
 * nothing: every input travels in the request body.
 */
const useLiveScan = !isLiveMode && process.env.EXPO_PUBLIC_LIVE_SCAN === '1';

/**
 * Wrap the mock so scans run against the API and their results are adopted back
 * into the mock store, keeping "Save to plant" and "Ask the community" working.
 * @param {typeof mockClient} base
 */
function withLiveScan(base) {
  return {
    ...base,
    sendsImageBytes: true,
    posts: { ...base.posts, draft: liveClient.posts.draft },
    diagnoses: {
      ...base.diagnoses,
      create: liveClient.diagnoses.create,
      async get(id) {
        const response = await liveClient.diagnoses.get(id);
        if (response.ok && response.data.status === 'COMPLETE') {
          // Mirror into the mock store so the downstream actions can find it.
          // Fire-and-forget: a failed mirror must not break the result screen.
          base.importDiagnosis?.(response.data).catch(() => {});
        }
        return response;
      },
    },
  };
}

const base = isLiveMode ? liveClient : mockClient;

export const client = useLiveScan ? withLiveScan(base) : { ...base, sendsImageBytes: isLiveMode };

export { restoreToken } from './session.js';
