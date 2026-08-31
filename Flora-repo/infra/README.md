4# Flora infra

AWS CDK app (JavaScript).

## Stacks

| Stack | What it is |
| --- | --- |
| `flora-media` (`src/media-stack.js`) | The photo store: a private S3 bucket plus the CloudFront distribution that serves it. Phones write through presigned PUT URLs the API signs and read through the CDN — the bucket is never public. |

Deploy from this directory:

```
npx aws-cdk deploy flora-media
```

First time in an account/region: `npx aws-cdk bootstrap aws://<account>/<region>`.

Then set the stack outputs in the API's environment: `MediaBucketName` →
`FLORA_S3_BUCKET`, `MediaBaseUrl` → `FLORA_MEDIA_BASE_URL`. Until a bucket is
set, the API stores uploads on local disk and serves them itself — which is what
local development and the mentor demo run on.

### How the API authenticates

The bucket is private, so the API needs an identity of its own — CloudFront's
read access does not cover it. `FLORA_API_HOSTING` picks which kind:

- **`external`** (default, for an API running on your own server): the stack
  creates an IAM user, an access key, and a Secrets Manager entry holding it.
  Read it out and put the two values in the API's `.env`:
  ```
  aws secretsmanager get-secret-value --secret-id <MediaApiCredentialsSecret>
  ```
  The key is never a stack output — outputs are plaintext to anyone who can
  describe the stack.
- **`aws`** (once apps/api runs on ECS or App Runner): the stack creates a role
  instead, the compute assumes it, and no long-lived key exists to leak. Prefer
  this as soon as there is somewhere to attach it.

Either way the grant is the same three actions on `uploads/*` and nothing more:
`s3:PutObject`, `s3:GetObject`, `s3:PutObjectTagging`. No delete, no list.

### Uploads that nobody claimed

An upload URL is signed before any row references the key, so abandoned scans
would otherwise be stored and billed forever. Every upload lands tagged
`flora-state=pending`; the API retags it `attached` once a row names it; the
bucket's lifecycle rule deletes anything still `pending` after 7 days. Tag and
retention are shared constants (`packages/shared/src/media.js`) so the API and
the rule cannot drift apart.

## Environment variables

Two `.env` files, split by who reads them — this is not a style choice:

| File | Read by | Template |
| --- | --- | --- |
| `.env` (repo root) | `apps/api` (via `--env-file-if-exists`) | `.env.example` |
| `apps/mobile/.env` | Expo, which loads `.env` from its **own** project root | `apps/mobile/.env.example` |

An `EXPO_PUBLIC_*` var placed in the repo-root `.env` is **silently ignored** by
the app. Secrets go in the root file only: every `EXPO_PUBLIC_*` value is inlined
into the app bundle at build time and is readable by anyone with the app.

| Variable       | Where                                  | Description                 |
| -------------- | -------------------------------------- | --------------------------- |
| `DATABASE_URL` | apps/api (local: `docker compose up -d db`) | Postgres connection string. |
| `FLORA_DB_PORT` | docker compose | Host port the `db` container publishes. Default `5432`; change it (and `DATABASE_URL`) when another project already owns that port. |
| `EXPO_PUBLIC_API_MODE` | apps/mobile | Selects the mobile data client: `mock` (default) or `live`. Both implement the whole client interface and pass the same contract suite. `live` needs the API running against a seeded database; `mock` is the only mode that works with no network, which is what the mentor demo needs. |
| `EXPO_PUBLIC_LIVE_SCAN` | apps/mobile | `1` routes only the Plant.id scan to the API, leaving the rest on the offline mock. `0` (default) is fully offline — the mode the mentor demo runs in. |
| `EXPO_PUBLIC_API_URL` | apps/mobile | API base URL **as seen from the phone**. Blank auto-derives the LAN address from the Metro host. Never `localhost` on a physical device. |
| `PORT` | apps/api | Port the API listens on. Default `4000`. |
| `PLANT_ID_API_KEY` | apps/api | Plant.id recognition key. **Secret.** Blank = fixture-backed stub recognizer (no key, no network), which is the default for everyone not working on recognition. |
| `PLANT_ID_BASE_URL` | apps/api | Plant.id API root. Default `https://plant.id/api/v3`. |
| — | apps/api | Two Plant.id endpoints are used under that root. `/identification` costs **1 credit** per scan. `/kb/plants/name_search`, which backs `GET /species/suggest`, is **free** — measured, not assumed — which is what makes search-as-you-type over the full species database affordable. |
| `FLORA_RECOGNITION_TIMEOUT_MS` | apps/api | Provider call ceiling. Default `45000` — must stay under the mobile client's 90s poll budget. |
| `FLORA_MAX_IMAGE_BYTES` | apps/api | Largest accepted image, decoded. Default `6291456`. Applies to both upload paths: the size declared to `POST /uploads`, and an inline base64 scan body. |
| `FLORA_S3_BUCKET` | apps/api | Bucket for uploaded photos. Blank = the local-disk driver, which serves uploads from the API itself and needs no AWS account. |
| `AWS_REGION` | apps/api | Region for the S3 client. Default `eu-north-1` (Stockholm), where the Flora account's resources live. |
| `FLORA_MEDIA_BASE_URL` | apps/api | Where photos are read from. **Required when `FLORA_S3_BUCKET` is set** — the CloudFront domain the media stack outputs; the API refuses to start without it. Blank locally means `http://localhost:$PORT`; on a physical phone set the LAN address instead. |
| `FLORA_UPLOAD_DIR` | apps/api | Where the local driver writes bytes, relative to `apps/api`. Default `.uploads` (gitignored). |
| `FLORA_UPLOAD_SECRET` | apps/api | Signs local upload URLs. Dev-only — with S3 the signing is AWS SigV4. |
| `FLORA_UPLOAD_URL_TTL_MS` | apps/api | Lifetime of a signed upload URL. Default `900000` (15 min). |
| `FLORA_MEDIA_CORS_ORIGINS` | infra | Comma-separated origins allowed to PUT to the bucket. Default `*`. |
| `FLORA_API_HOSTING` | infra | `external` (default) issues the API an IAM user + access key into Secrets Manager. `aws` creates a task/instance role instead and no long-lived key exists. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | apps/api | Only when hosting is `external`. **Secret.** Read them out of the Secrets Manager entry the stack creates; never commit them. On AWS, drop them entirely and let the role supply credentials. |
| `FLORA_STUB_FIXTURE` | apps/api | Which canned response the stub replays: `healthy-basil`, `diseased-tomato` or `blurry`. |
| `FLORA_LLM_ENABLED` | apps/api | `1` sends care advice and post drafts to a real model. Anything else (default) replays `test/fixtures/llm-*.json` — no account, no spend. Which service answers is `FLORA_LLM_PROVIDER`. |
| `FLORA_LLM_PROVIDER` | apps/api | Which model service answers when the LLM is on: `gemini` or `bedrock` (default). Bedrock is the older path and authenticates off the ambient AWS credential chain, which is why `FLORA_LLM_ENABLED` is an explicit opt-in rather than a key check. Prove a real call with `pnpm -F api smoke:gemini` or `smoke:bedrock`. |
| `GEMINI_API_KEY` | apps/api | Gemini API key, from <https://aistudio.google.com/apikey>. **Secret.** Blank falls back to the fixture stub rather than failing to boot — an optional feature must not be able to take down scanning, watering and the feed. |
| `FLORA_GEMINI_MODEL` | apps/api | Default `gemini-3.6-flash`. Do **not** set a `gemini-2.5-*` id: Google has closed that generation to new API keys, and a key issued today answers `404` naming `gemini-3.6-flash` as the replacement. `gemini-3.5-flash-lite` is the cheaper sibling. |
| `FLORA_BEDROCK_REGION` | apps/api | Region for Bedrock calls. Default `us-east-1`. Model access must be requested per-region in the Bedrock console first. gpt-oss is **in-region only** — no global or geo cross-region endpoint — so this must name a region that hosts the model. |
| `FLORA_BEDROCK_MODEL_ID` | apps/api | Default `openai.gpt-oss-120b-1:0` (OpenAI open-weight, via the Converse API on `bedrock-runtime`). `openai.gpt-oss-20b-1:0` is the smaller/cheaper sibling. |
| `FLORA_LLM_TIMEOUT_MS` | apps/api | Ceiling on one model call. Default `30000`. |
| `FLORA_STUB_DELAY_MS` | apps/api | Artificial latency for the stub recognizer. Default `0`. The live contract suite sets it, because a provider that answers instantly never lets a client observe `PENDING`. |
| `FLORA_LIVE_TEST_PORT` | live contract suite | Port the suite's throwaway API listens on. Default `4010`, kept clear of the `4000` dev server. |

### Secrets

`PLANT_ID_API_KEY` and `GEMINI_API_KEY` are the secrets. Rules:

- **Never `EXPO_PUBLIC_`-prefix it.** Expo inlines those into the JS bundle at
  build time, publishing the key to every user. It belongs to `apps/api` only.
- **Local development:** each teammate uses their own free-tier key in their own
  gitignored `.env`. Most of the team needs no key at all — the stub covers it.
- **Deployed environments:** store in AWS Secrets Manager / SSM Parameter Store
  and reference by ARN from the CDK stack. The value never appears in `infra/`.
- **If one leaks:** rotate it — the Plant.id dashboard, or Google AI Studio.
  Rewriting git history does not un-share a key that has already been pushed
  and pulled.
- **Plant.id is metered by a lifetime credit total**, not a monthly reset. Check
  what is left before a demo: `curl -H "Api-Key: $PLANT_ID_API_KEY"
  https://plant.id/api/v3/usage_info`. Blanking the key falls back to the stub
  instantly, with no code change — which is the safety net if a demo runs dry.
