import { env } from '../../config/env';
import { InternalError, UpstreamError } from '../../lib/errors';

/**
 * THE RECOGNITION CONTRACT.
 *
 * This shape is the seam between the backend and whatever performs recognition. The
 * database columns and the API response are both built against it, so the team's
 * train-vs-buy decision (FLOR-5 / FLOR-9) can land later without touching either.
 *
 * `source` is the only field that reveals which implementation ran.
 */
export interface RecognitionResult {
  source: 'THIRD_PARTY' | 'OWN_MODEL' | 'MOCK';
  resultType: 'IDENTIFY' | 'HEALTH';
  species: { scientificName: string | null; commonName: string | null };
  health: { status: 'HEALTHY' | 'DISEASED' | 'UNKNOWN'; disease: string | null } | null;
  confidence: number;
  raw: Record<string, unknown>;
}

/** Plausible-for-Lebanon species, so mock output is recognisable during development. */
const SAMPLE_SPECIES = [
  { scientificName: 'Olea europaea', commonName: 'Olive' },
  { scientificName: 'Citrus limon', commonName: 'Lemon' },
  { scientificName: 'Vitis vinifera', commonName: 'Grapevine' },
  { scientificName: 'Ficus carica', commonName: 'Fig' },
  { scientificName: 'Ocimum basilicum', commonName: 'Basil' },
  { scientificName: 'Mentha spicata', commonName: 'Spearmint' },
] as const;

const SAMPLE_DISEASES = ['Leaf spot', 'Powdery mildew', 'Aphid infestation'] as const;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/**
 * Stubbed recognition. Confidence is drawn across the whole range on purpose, so the
 * low-confidence flagging path is exercised in normal development rather than only in
 * tests that do not exist yet.
 */
const runMock = (resultType: 'IDENTIFY' | 'HEALTH'): RecognitionResult => {
  const species = pick(SAMPLE_SPECIES);
  const confidence = Number((0.35 + Math.random() * 0.64).toFixed(2));
  const diseased = Math.random() < 0.4;

  return {
    source: 'MOCK',
    resultType,
    species: { scientificName: species.scientificName, commonName: species.commonName },
    health:
      resultType === 'HEALTH'
        ? {
            status: diseased ? 'DISEASED' : 'HEALTHY',
            disease: diseased ? pick(SAMPLE_DISEASES) : null,
          }
        : null,
    confidence,
    raw: { provider: 'mock', generatedAt: new Date().toISOString() },
  };
};

/**
 * Dispatches to the configured provider.
 *
 * Production guard: a MOCK result must never reach the database outside development.
 * Checking here means a misconfigured deployment fails immediately and loudly, rather
 * than quietly filling a real user's health timeline with invented diagnoses.
 */
export const recognize = async (
  resultType: 'IDENTIFY' | 'HEALTH',
  _imageKey: string,
): Promise<RecognitionResult> => {
  if (env.RECOGNITION_PROVIDER === 'MOCK') {
    if (env.isProduction) {
      throw new InternalError('Recognition provider is MOCK in a production environment.');
    }
    return runMock(resultType);
  }

  // Deferred, deliberately not stubbed: returning fabricated data for a provider that is
  // supposed to be real is exactly the failure the MOCK guard above exists to prevent.
  throw new UpstreamError(
    `Recognition provider ${env.RECOGNITION_PROVIDER} is not implemented yet.`,
  );
};
