import { z } from 'zod';
import { IssueCodes } from './issues.js';
import { UploadContentTypes, isUploadKey } from './media.js';

/** Payload for POST /auth/signup. */
export const SignupSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'lowercase letters, digits and underscores only'),
  password: z.string().min(8),
});

/** Payload for POST /plants. */
export const CreatePlantSchema = z.object({
  nickname: z.string().min(1),
  speciesId: z.string().optional(),
  photoKey: z.string().optional(),
});

/** Payload for POST /plants/:id/schedules. */
export const CreateScheduleSchema = z.object({
  type: z.enum(['WATER', 'FERTILIZE', 'SEASONAL']),
  intervalDays: z.number().int().min(1).optional(),
});

/** Payload for POST /posts — requires a text body, at least one image, or both. */
export const CreatePostSchema = z
  .object({
    body: z.string().optional(),
    images: z.array(z.string()).optional(),
  })
  .refine((post) => Boolean(post.body?.trim()) || (post.images?.length ?? 0) > 0, {
    message: 'A post needs a body or at least one image',
    path: ['body'],
  });

/** Payload for POST /devices — registers a push-notification token. */
export const RegisterDeviceSchema = z.object({
  pushToken: z.string().min(1),
  platform: z.enum(['android', 'ios']),
});

/** Lebanese climate zones used to tune care schedules. */
export const ClimateZones = Object.freeze(['COASTAL', 'MOUNTAIN', 'BEKAA', 'SOUTH']);

/** Payload for PATCH /me — profile updates from the mobile app. */
export const UpdateMeSchema = z.object({
  climateZone: z.enum(ClimateZones),
});

/** How a photo should be read: name the plant, or judge its health. */
export const DiagnosisModes = Object.freeze(['identify', 'health']);

/** Terminal and in-flight states of an async diagnosis job. */
export const DiagnosisStatuses = Object.freeze(['PENDING', 'COMPLETE', 'FAILED']);

/** A diagnosis whose confidence falls below this is flagged for a second opinion. */
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

const Probability = z.number().min(0).max(1);

/** One candidate species from the recognition provider. */
export const SpeciesCandidateSchema = z.object({
  speciesId: z.string().optional(),
  scientificName: z.string().min(1),
  commonNames: z.array(z.string()),
  probability: Probability,
});

/** A detected health issue with suggested treatments. */
export const HealthIssueSchema = z.object({
  code: z.enum(IssueCodes),
  name: z.string().min(1),
  probability: Probability,
  treatmentHints: z.array(z.string()),
});

/** Health assessment of a photographed plant. */
export const HealthAssessmentSchema = z.object({
  isHealthy: z.boolean(),
  issues: z.array(HealthIssueSchema),
  confidence: Probability,
});

/**
 * One actionable step in a care plan. Every step answers three questions so the
 * result card can lay them out as distinct lines instead of a wall of prose.
 */
export const CareStepSchema = z.object({
  action: z.string().min(1),
  when: z.string().min(1),
  why: z.string().min(1),
});

/**
 * Care advice derived from a completed diagnosis.
 *
 * No character ceilings anywhere in here, deliberately: this doubles as the
 * JSON schema the model's output is constrained to, and a max() there turns a
 * sentence that runs three words long into a hard validation failure and no
 * advice at all. Length belongs in the prompt, where overshooting degrades
 * instead of breaking.
 */
export const CareAdviceSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(CareStepSchema).min(1).max(5),
  watchFor: z.array(z.string().min(1)).max(3).default([]),
});

/**
 * Normalized recognition output. Every provider adapter must produce this
 * shape — it is what the mobile result screen renders.
 */
export const RecognitionResultSchema = z.object({
  species: z.array(SpeciesCandidateSchema),
  health: HealthAssessmentSchema,
  // Filled in after recognition by a separate model call that is allowed to
  // fail. Defaulted rather than required so provider adapters — which know
  // nothing about advice — keep parsing their own output unchanged.
  advice: CareAdviceSchema.nullable().default(null),
});

/** Payload for POST /uploads — asks for somewhere to put one image. */
export const CreateUploadSchema = z.object({
  contentType: z.enum(UploadContentTypes),
  /**
   * Declared up front so an oversized image is refused before a byte moves.
   * The driver binds the number into the upload URL it signs, so a client that
   * lies about it cannot then push a larger file.
   */
  byteLength: z.number().int().min(1),
});

/**
 * Payload for POST /diagnoses.
 *
 * Two ways to hand over the photo, exactly one of them per request:
 *
 * - `imageKey` — the preferred path. The bytes went straight to storage over a
 *   signed upload URL, and the API reads them back to recognise them. The key
 *   is also what the diagnosis keeps, which is what lets an escalated HELP post
 *   show a photo other people can open.
 * - `imageBase64` — the original path, still supported. The API writes the
 *   bytes to storage itself, so such a scan ends up with the same key; it just
 *   pays for the round trip through the request body.
 */
export const CreateDiagnosisSchema = z
  .object({
    imageBase64: z
      .string()
      .min(1)
      // Accept a `data:image/jpeg;base64,...` URL and keep only the payload, so
      // callers can pass an ImagePicker/Camera result through unmodified.
      .transform((value) => value.replace(/^data:[^;,]*;base64,/, '').trim())
      .refine((value) => value.length > 0, { message: 'imageBase64 is empty' })
      .refine((value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value), {
        message: 'imageBase64 is not valid base64',
      })
      .optional(),
    imageKey: z
      .string()
      .refine(isUploadKey, { message: 'imageKey is not an upload key from POST /uploads' })
      .optional(),
    mode: z.enum(DiagnosisModes).default('identify'),
    plantId: z.string().optional(),
    // Tunes the care advice to the user's region. Optional: a diagnosis without
    // it still succeeds, it just gets advice written for Lebanon generally.
    climateZone: z.enum(ClimateZones).optional(),
  })
  .refine((input) => Boolean(input.imageBase64) !== Boolean(input.imageKey), {
    // Reported against imageBase64 so the message names the field a caller who
    // sent nothing at all is most likely missing.
    path: ['imageBase64'],
    message: 'provide either imageBase64 or imageKey (exactly one)',
  });

/**
 * What the client knows about a plant when there is no diagnosis to draft from.
 *
 * Passed inline rather than resolved from a plantId on purpose: the plants API
 * does not exist yet, and the mobile store already holds every one of these
 * fields. Once plants land server-side a plantId branch goes in front of this
 * and the inline shape becomes the fallback, not dead code.
 */
export const DraftPlantContextSchema = z.object({
  nickname: z.string().min(1),
  speciesName: z.string().min(1).optional(),
  /** Days since the plant was added — what turns into "I've had it 3 months". */
  ageDays: z.number().int().min(0).optional(),
  lastWateredAt: z.iso.datetime().nullish(),
  /** How many growth logs exist, as a rough proxy for how closely it is tracked. */
  logCount: z.number().int().min(0).optional(),
});

/**
 * Payload for POST /drafts/post.
 *
 * Either half is enough on its own: a diagnosis produces a HELP post about the
 * symptoms, a bare plant produces a show-and-tell post from its age and care
 * history. Both together produce the best version of the former.
 */
export const DraftPostSchema = z
  .object({
    diagnosis: RecognitionResultSchema.nullable().default(null),
    plant: DraftPlantContextSchema.nullable().default(null),
  })
  .refine((input) => input.diagnosis !== null || input.plant !== null, {
    message: 'A draft needs a diagnosis, a plant, or both',
    path: ['plant'],
  });

/**
 * A drafted post body, returned by POST /drafts/post.
 *
 * Text only, and nothing is created server-side: the draft lands in the
 * composer for the user to edit and submit themselves. Length is steered by the
 * prompt rather than capped here — see the note on CareAdviceSchema.
 */
export const PostDraftSchema = z.object({
  body: z.string().min(1),
});
