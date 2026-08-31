import { ErrorCode, LOW_CONFIDENCE_THRESHOLD, fail, ok } from '@flora/shared';
import { RecognitionProviderError } from '../../recognition/index.js';
import { shouldAdvise } from '../../llm/careAdvice.js';
import { identityImage, noopAttach } from '../../lib/media.js';
import { diagnosisView } from '../../lib/views.js';
import { resolveSpeciesId as defaultResolveSpeciesId } from '../species/catalog.js';
import {
  CreateDiagnosisSchema,
  EscalateDiagnosisSchema,
  IdSchema,
  base64ByteLength,
  parseWith,
} from './validators.js';

/**
 * Milliseconds from a row's createdAt, whether the store hands back a Date
 * (Prisma) or an epoch number (the in-memory store used by unit tests).
 * @param {Date|number} value
 */
const millis = (value) => (value instanceof Date ? value.getTime() : value);

/**
 * Create the diagnoses service.
 *
 * The job model is inline-with-polling: `create` writes a PENDING row, starts
 * the provider call without awaiting it, and returns immediately; the client
 * polls `get` until the row flips. That is the same contract a queue would
 * expose, which is what makes the later move to SQS + Lambda a swap of this
 * function's middle rather than a client change.
 *
 * `posts` and `findOwnedPlant` are injected rather than reached for: escalate
 * writes a Post and attach checks plant ownership, and neither belongs in a
 * diagnosis store. Both are optional so the unit tests, which only exercise the
 * job lifecycle, can leave them out.
 *
 * `storage` is what makes a scan's photo survive the device that took it: the
 * key it returns is stored on the row, and it is what an escalated HELP post
 * shows other people. Optional, because the unit tests exercise the job
 * lifecycle and a scan still works without it — it just keeps no photo.
 *
 * @param {{
 *   store: {insert: Function, find: Function, update: Function},
 *   recognize: (input: object) => Promise<object>,
 *   advise?: (result: object, context: object) => Promise<object>,
 *   posts?: {createHelpPost: Function},
 *   findOwnedPlant?: (ownerId: string, plantId: string) => Promise<object|null>,
 *   resolveSpeciesId?: (name: string) => (string|null),
 *   storage?: {putBytes: Function, read: Function},
 *   mapImage?: (value: string|null) => (string|null),
 *   attachImages?: (...values: any[]) => Promise<void>,
 *   maxImageBytes: number,
 *   timeoutMs: number,
 *   logger?: Pick<Console, 'error'>,
 *   now?: () => number,
 * }} deps
 */
export function createDiagnosisService({
  store,
  recognize,
  advise,
  posts,
  findOwnedPlant = async () => null,
  resolveSpeciesId = defaultResolveSpeciesId,
  storage,
  mapImage = identityImage,
  attachImages = noopAttach,
  maxImageBytes,
  timeoutMs,
  logger = console,
  now = Date.now,
}) {
  /**
   * In-flight recognition promises, keyed by diagnosis id. Only used so tests
   * (and a future graceful shutdown) can await work that `create` intentionally
   * did not await.
   * @type {Map<string, Promise<void>>}
   */
  const inflight = new Map();

  /**
   * Attach a care plan to a recognition result.
   *
   * Advice is an enhancement, never a gate: any failure here returns the result
   * untouched with `advice: null`, and the mobile screen falls back to the
   * provider's own treatmentHints. A diagnosis must never fail because the
   * model was slow, refused, or is not configured.
   *
   * @param {import('@flora/shared/src/types.js').RecognitionResult} result
   * @param {{climateZone?: string}} context
   */
  async function withAdvice(result, context) {
    if (!advise || !shouldAdvise(result)) return result;
    try {
      return { ...result, advice: await advise(result, context) };
    } catch (error) {
      logger.error('[diagnoses] care advice failed, continuing without it:', error);
      return result;
    }
  }

  /**
   * Run recognition and write the outcome back. Never rejects — a diagnosis
   * that fails is a FAILED row, not an unhandled rejection that takes down the
   * process.
   * @param {string} id
   * @param {{imageBase64: string, mode: string, climateZone?: string}} input
   */
  async function run(id, { imageBase64, mode, climateZone }) {
    try {
      const recognized = await recognize({ imageBase64, mode, resolveSpeciesId });
      const result = await withAdvice(recognized, { climateZone });
      // Awaited: the Prisma store returns a promise, and a floating write here
      // would race the client's next poll.
      await store.update(id, {
        status: 'COMPLETE',
        result,
        lowConfidence: result.health.confidence < LOW_CONFIDENCE_THRESHOLD,
        completedAt: new Date(now()),
      });
    } catch (error) {
      const isProviderError = error instanceof RecognitionProviderError;
      logger.error(`[diagnoses] ${id} failed:`, error);
      await store.update(id, {
        status: 'FAILED',
        error: {
          code: isProviderError ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL,
          message: isProviderError ? error.message : 'Recognition failed',
        },
        completedAt: new Date(now()),
      });
    } finally {
      inflight.delete(id);
    }
  }

  /**
   * Turn whichever half of the payload arrived into the pair the rest of the
   * flow needs: bytes to recognise, and a key to remember the photo by.
   *
   * `imageKey` means the bytes are already in storage and are read back here.
   * `imageBase64` means they came through the request body, and they are
   * written to storage on the way past — a scan taken by an older client still
   * ends up with a photo other people can open.
   *
   * A failed write is logged and swallowed. Losing the photo costs an escalated
   * post its picture; failing the scan over it would cost the user the answer
   * they actually asked for.
   *
   * @param {{imageBase64?: string, imageKey?: string}} data
   * @returns {Promise<{key: string|null, imageBase64: string, error?: undefined}
   *   | {error: import('@flora/shared/src/types.js').ApiResponse<never>}>}
   */
  async function resolveImage(data) {
    if (data.imageKey) {
      if (!storage) {
        return { error: fail(ErrorCode.VALIDATION, 'this server has no upload storage') };
      }
      try {
        const { body } = await storage.read(data.imageKey);
        if (body.length > maxImageBytes) return { error: tooLarge(body.length) };
        return { key: data.imageKey, imageBase64: body.toString('base64') };
      } catch (readError) {
        logger.error(`[diagnoses] could not read ${data.imageKey}:`, readError);
        return {
          error: fail(ErrorCode.NOT_FOUND, `no uploaded image at ${data.imageKey}`),
        };
      }
    }

    const bytes = base64ByteLength(data.imageBase64);
    if (bytes > maxImageBytes) return { error: tooLarge(bytes) };

    let key = null;
    if (storage) {
      try {
        key = await storage.putBytes(Buffer.from(data.imageBase64, 'base64'));
      } catch (writeError) {
        logger.error('[diagnoses] could not store the scanned image:', writeError);
      }
    }
    return { key, imageBase64: data.imageBase64 };
  }

  /** @param {number} bytes */
  const tooLarge = (bytes) =>
    fail(
      ErrorCode.VALIDATION,
      `Image is ${Math.round(bytes / 1024)}KB; the limit is ${Math.round(maxImageBytes / 1024)}KB`,
    );

  return {
    /**
     * Start a diagnosis. Returns as soon as the row exists — the provider call
     * is still running.
     *
     * @param {{id: string}|null} user
     * @param {unknown} input
     */
    async create(user, input) {
      const { data, error } = parseWith(CreateDiagnosisSchema, input);
      if (error) return error;

      const image = await resolveImage(data);
      if (image.error) return image.error;

      const row = await store.insert({
        userId: user?.id ?? null,
        plantId: data.plantId ?? null,
        // The storage key, not a URL and not a device path — whoever reads this
        // row decides how to address it (see lib/media.js). Null only when this
        // deployment has no storage at all.
        imageKey: image.key,
        mode: data.mode,
        status: 'PENDING',
        result: null,
        lowConfidence: null,
        error: null,
        createdAt: new Date(now()),
        completedAt: null,
      });

      // The row exists now, so the photo has earned its keep.
      await attachImages(image.key);

      inflight.set(
        row.id,
        run(row.id, {
          // From resolveImage, not the payload: an imageKey scan has no inline
          // bytes, and these are the ones actually read out of storage.
          imageBase64: image.imageBase64,
          mode: data.mode,
          climateZone: data.climateZone,
        }),
      );

      return ok({ id: row.id, status: row.status });
    },

    /**
     * Poll a diagnosis.
     *
     * Sweeps on read: a PENDING row older than the provider timeout has no
     * worker coming back for it (the process restarted, or the call is wedged),
     * so report FAILED rather than let the client poll for its full 90s budget.
     * @param {unknown} id
     */
    async get(id) {
      const check = parseWith(IdSchema, id);
      if (check.error) return check.error;

      const row = await store.find(check.data);
      if (!row) return fail(ErrorCode.NOT_FOUND, `diagnosis ${check.data} not found`);

      if (row.status === 'PENDING' && now() - millis(row.createdAt) > timeoutMs) {
        const swept = await store.update(row.id, {
          status: 'FAILED',
          error: { code: ErrorCode.PROVIDER_ERROR, message: 'Recognition timed out' },
          completedAt: new Date(now()),
        });
        return ok(diagnosisView(swept ?? row, mapImage));
      }

      return ok(diagnosisView(row, mapImage));
    },

    /**
     * Link a diagnosis to one of the user's plants, so it shows in that plant's
     * timeline.
     *
     * @param {{id: string}} user
     * @param {unknown} id
     * @param {unknown} plantId
     */
    async attach(user, id, plantId) {
      const idCheck = parseWith(IdSchema, id);
      if (idCheck.error) return idCheck.error;

      const plantCheck = parseWith(IdSchema, plantId);
      if (plantCheck.error) return plantCheck.error;

      const row = await store.find(idCheck.data);
      if (!row) return fail(ErrorCode.NOT_FOUND, `diagnosis ${idCheck.data} not found`);

      const plant = await findOwnedPlant(user.id, plantCheck.data);
      if (!plant) return fail(ErrorCode.NOT_FOUND, `plant ${plantCheck.data} not found`);

      const updated = await store.update(row.id, { plantId: plant.id });
      return ok({ id: updated.id, plantId: plant.id });
    },

    /**
     * Turn a completed diagnosis into a community HELP post — the "ask the
     * community" path from the result screen when the answer is unconvincing.
     *
     * `input.body` is the post the person actually reviewed, normally a drafted
     * one they edited. It is what gets published: machine- or hand-written, the
     * words under their name are the ones they read. Without it the post falls
     * back to plain wording built from the top issue, so escalating still works
     * when drafting is unavailable.
     *
     * @param {{id: string}} user
     * @param {unknown} id
     * @param {{body?: string}} [input]
     */
    async escalate(user, id, input = {}) {
      const check = parseWith(IdSchema, id);
      if (check.error) return check.error;

      const parsed = parseWith(EscalateDiagnosisSchema, input ?? {});
      if (parsed.error) return parsed.error;

      const row = await store.find(check.data);
      if (!row) return fail(ErrorCode.NOT_FOUND, `diagnosis ${check.data} not found`);

      // Escalating a PENDING row would post an empty question; say so plainly
      // rather than publishing a placeholder.
      if (row.status !== 'COMPLETE') {
        return fail(ErrorCode.VALIDATION, 'diagnosis is still processing — try again shortly');
      }

      return posts.createHelpPost(
        user,
        {
          imageUri: row.imageKey ?? null,
          topIssue: row.result?.health?.issues?.[0]?.name ?? null,
          confidence: row.result?.health?.confidence ?? null,
        },
        parsed.data.body,
      );
    },

    /**
     * Await the in-flight recognition for a diagnosis, if any.
     * Test affordance — production code polls instead.
     * @param {string} id
     */
    async settled(id) {
      await inflight.get(id);
    },
  };
}
