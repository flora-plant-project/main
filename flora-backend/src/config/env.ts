import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/** Treat empty-string env vars as "not set" — `FOO=` in .env means absent. */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const envSchema = z.object({
  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().trim().default('*'),

  // Database
  DATABASE_URL: z.string().url(),

  // AWS
  AWS_REGION: z.string().trim().min(1),

  // Cognito — credentials live here; we only verify tokens and keep a local User row.
  COGNITO_USER_POOL_ID: z.string().trim().min(1),
  COGNITO_CLIENT_ID: z.string().trim().min(1),
  // Present only if the app client was created with a secret (drives SECRET_HASH).
  COGNITO_CLIENT_SECRET: optionalString,

  // Media
  S3_BUCKET: z.string().trim().min(1),
  S3_PRESIGN_EXPIRY_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
  CLOUDFRONT_DOMAIN: optionalString,

  // Diagnosis
  RECOGNITION_PROVIDER: z.enum(['MOCK', 'THIRD_PARTY', 'OWN_MODEL']).default('MOCK'),
  DIAGNOSIS_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Boot-time failure: print and die rather than crash later on a request.
  console.error(`Invalid environment configuration:\n${details}\n\nSee .env.example.`);
  process.exit(1);
}

const raw = parsed.data;

export const env = Object.freeze({
  ...raw,

  /** Parsed allow-list. `*` means "any origin" and is handled by the CORS middleware. */
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',

  /** True when the Cognito app client has a secret, so auth calls need a SECRET_HASH. */
  cognitoUsesClientSecret: Boolean(raw.COGNITO_CLIENT_SECRET),
});

export type Env = typeof env;
