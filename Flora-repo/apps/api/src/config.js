/**
 * Runtime configuration, read once from the environment.
 *
 * Every value has a working default except PLANT_ID_API_KEY: leave that unset
 * and the recognition factory falls back to the fixture-backed stub, so the API
 * runs end-to-end with no credentials and no network. Only whoever is working
 * on the recognition module needs a real key.
 *
 * New variables must be added to .env.example AND infra/README.md in the same
 * commit (see CLAUDE.md).
 */

/**
 * Read an integer env var, falling back when unset or unparseable.
 * @param {string|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Build the config object from an environment bag.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function loadConfig(env = process.env) {
  return {
    port: intFromEnv(env.PORT, 4000),
    plantIdApiKey: (env.PLANT_ID_API_KEY ?? '').trim(),
    plantIdBaseUrl: (env.PLANT_ID_BASE_URL ?? 'https://plant.id/api/v3').replace(/\/+$/, ''),
    /** Hard ceiling on one provider call. Mobile gives up at 90s; we fail first. */
    recognitionTimeoutMs: intFromEnv(env.FLORA_RECOGNITION_TIMEOUT_MS, 45_000),
    /**
     * Decoded image ceiling, applied to both upload paths: the byte count a
     * client declares to POST /uploads, and an inline `imageBase64` body.
     */
    maxImageBytes: intFromEnv(env.FLORA_MAX_IMAGE_BYTES, 6 * 1024 * 1024),
    /** Bucket for uploaded photos. Unset = the local-disk driver (see src/storage). */
    s3Bucket: (env.FLORA_S3_BUCKET ?? '').trim(),
    s3Region: (env.AWS_REGION ?? 'eu-north-1').trim(),
    /**
     * Where uploaded photos are READ from: the CDN in front of the bucket, or
     * this API's own address under the local driver. Required with S3; blank
     * locally means `http://localhost:PORT`, which is right for a simulator and
     * wrong for a physical phone — set the LAN address there.
     */
    mediaBaseUrl: (env.FLORA_MEDIA_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    /** Where the local driver keeps bytes, relative to apps/api. */
    uploadDir: (env.FLORA_UPLOAD_DIR ?? '.uploads').trim(),
    /**
     * Signing key for local upload URLs. Dev-only by construction — with S3 the
     * signing is AWS SigV4 and this is unused — so a default is safe here.
     */
    uploadSecret: (env.FLORA_UPLOAD_SECRET ?? 'flora-local-upload-secret').trim(),
    /** How long an upload URL stays valid. Long enough for a slow phone upload. */
    uploadUrlTtlMs: intFromEnv(env.FLORA_UPLOAD_URL_TTL_MS, 15 * 60 * 1000),
    /** Which canned Plant.id response the stub replays. */
    stubFixture: (env.FLORA_STUB_FIXTURE ?? 'healthy-basil').trim(),
    /**
     * Artificial latency for the stub recognizer, in ms. Zero by default, so
     * development is fast. The live contract suite sets it, because a provider
     * that answers instantly never lets a client observe PENDING.
     */
    stubDelayMs: intFromEnv(env.FLORA_STUB_DELAY_MS, 0),
    /**
     * Opt in to real Bedrock calls. An explicit flag rather than a key check:
     * Bedrock reads the ambient AWS credential chain, which is often populated
     * for reasons that have nothing to do with wanting to spend on inference.
     */
    llmEnabled: (env.FLORA_LLM_ENABLED ?? '').trim() === '1',
    /**
     * Which model service answers when the LLM is on: 'gemini' or 'bedrock'.
     * Defaults to bedrock, so an existing checkout that only sets
     * FLORA_LLM_ENABLED behaves exactly as it did before Gemini existed.
     */
    llmProvider: (env.FLORA_LLM_PROVIDER ?? 'bedrock').trim().toLowerCase(),
    /**
     * Gemini API key. A real secret, unlike the Bedrock path's ambient AWS
     * chain — never give this an EXPO_PUBLIC_ name or it ships in the bundle.
     */
    geminiApiKey: (env.GEMINI_API_KEY ?? '').trim(),
    /**
     * Gemini model id. gemini-2.5-* is deliberately NOT the default: Google has
     * closed that generation to new API keys, and a key issued today gets a 404
     * naming 3.6-flash as the replacement.
     */
    geminiModel: (env.FLORA_GEMINI_MODEL ?? 'gemini-3.6-flash').trim(),
    bedrockRegion: (env.FLORA_BEDROCK_REGION ?? 'us-east-1').trim(),
    bedrockModelId: (env.FLORA_BEDROCK_MODEL_ID ?? 'openai.gpt-oss-120b-1:0').trim(),
    /** Ceiling on one model call. Shorter than recognition — these are small tasks. */
    llmTimeoutMs: intFromEnv(env.FLORA_LLM_TIMEOUT_MS, 30_000),
  };
}

export const config = loadConfig();
