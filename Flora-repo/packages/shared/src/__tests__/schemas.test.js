import { describe, expect, it } from 'vitest';
import {
  CareAdviceSchema,
  CreateDiagnosisSchema,
  CreatePlantSchema,
  CreatePostSchema,
  CreateScheduleSchema,
  DraftPostSchema,
  RecognitionResultSchema,
  RegisterDeviceSchema,
  SignupSchema,
  UpdateMeSchema,
} from '../schemas.js';
import { diagnosisFixtures } from '../seed/diagnoses.js';

/**
 * Collect the dotted issue paths of a failed safeParse.
 * @param {import('zod').ZodSafeParseResult<unknown>} result
 * @returns {string[]}
 */
function issuePaths(result) {
  expect(result.success).toBe(false);
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('SignupSchema', () => {
  it('accepts a valid signup', () => {
    const result = SignupSchema.safeParse({ username: 'flora_fan_01', password: 'supersecret' });
    expect(result.success).toBe(true);
  });

  it('rejects a username with uppercase characters', () => {
    const result = SignupSchema.safeParse({ username: 'Flora', password: 'supersecret' });
    expect(issuePaths(result)).toContain('username');
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = SignupSchema.safeParse({ username: 'flora_fan_01', password: 'short' });
    expect(issuePaths(result)).toContain('password');
  });
});

describe('CreatePlantSchema', () => {
  it('accepts a plant with only a nickname', () => {
    const result = CreatePlantSchema.safeParse({ nickname: 'Fernie' });
    expect(result.success).toBe(true);
  });

  it('rejects a missing nickname', () => {
    const result = CreatePlantSchema.safeParse({ speciesId: 'sp_1' });
    expect(issuePaths(result)).toContain('nickname');
  });

  it('rejects a non-string speciesId', () => {
    const result = CreatePlantSchema.safeParse({ nickname: 'Fernie', speciesId: 42 });
    expect(issuePaths(result)).toContain('speciesId');
  });
});

describe('CreateScheduleSchema', () => {
  it('accepts a watering schedule with an interval', () => {
    const result = CreateScheduleSchema.safeParse({ type: 'WATER', intervalDays: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown schedule type', () => {
    const result = CreateScheduleSchema.safeParse({ type: 'PRUNE', intervalDays: 3 });
    expect(issuePaths(result)).toContain('type');
  });

  it('rejects a non-positive intervalDays', () => {
    const result = CreateScheduleSchema.safeParse({ type: 'WATER', intervalDays: 0 });
    expect(issuePaths(result)).toContain('intervalDays');
  });
});

describe('CreatePostSchema', () => {
  it('accepts a body-only post and an images-only post', () => {
    expect(CreatePostSchema.safeParse({ body: 'Look at my monstera!' }).success).toBe(true);
    expect(CreatePostSchema.safeParse({ images: ['uploads/1.jpg'] }).success).toBe(true);
  });

  it('rejects a post with neither body nor images', () => {
    const result = CreatePostSchema.safeParse({ body: '   ' });
    expect(issuePaths(result)).toContain('body');
  });

  it('rejects images that are not an array of strings', () => {
    const result = CreatePostSchema.safeParse({ images: 'uploads/1.jpg' });
    expect(issuePaths(result)).toContain('images');
  });
});

describe('UpdateMeSchema', () => {
  it('accepts a supported climate zone', () => {
    const result = UpdateMeSchema.safeParse({ climateZone: 'BEKAA' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown climate zone', () => {
    const result = UpdateMeSchema.safeParse({ climateZone: 'DESERT' });
    expect(issuePaths(result)).toContain('climateZone');
  });

  it('rejects a missing climate zone', () => {
    const result = UpdateMeSchema.safeParse({});
    expect(issuePaths(result)).toContain('climateZone');
  });
});

describe('RegisterDeviceSchema', () => {
  it('accepts a valid device registration', () => {
    const result = RegisterDeviceSchema.safeParse({
      pushToken: 'ExponentPushToken[abc123]',
      platform: 'ios',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unsupported platform', () => {
    const result = RegisterDeviceSchema.safeParse({ pushToken: 'tok', platform: 'web' });
    expect(issuePaths(result)).toContain('platform');
  });

  it('rejects a missing pushToken', () => {
    const result = RegisterDeviceSchema.safeParse({ platform: 'android' });
    expect(issuePaths(result)).toContain('pushToken');
  });
});

/** A minimal valid recognition result, before advice is attached. */
const recognized = {
  species: [{ scientificName: 'Solanum lycopersicum', commonNames: ['Tomato'], probability: 0.88 }],
  health: { isHealthy: false, issues: [], confidence: 0.84 },
};

describe('CareAdviceSchema', () => {
  const advice = {
    summary: 'Early blight, caught early and very treatable.',
    steps: [{ action: 'Remove spotted lower leaves', when: 'Today', why: 'Spores splash upward' }],
    watchFor: ['Spots climbing past the middle of the plant'],
  };

  it('accepts a complete care plan', () => {
    expect(CareAdviceSchema.safeParse(advice).success).toBe(true);
  });

  it('defaults watchFor to an empty array', () => {
    const result = CareAdviceSchema.safeParse({ summary: advice.summary, steps: advice.steps });
    expect(result.success).toBe(true);
    expect(result.data.watchFor).toEqual([]);
  });

  it('rejects a plan with no steps', () => {
    expect(issuePaths(CareAdviceSchema.safeParse({ ...advice, steps: [] }))).toContain('steps');
  });

  it('rejects a step missing its reasoning', () => {
    const steps = [{ action: 'Water less', when: 'Now' }];
    expect(issuePaths(CareAdviceSchema.safeParse({ ...advice, steps }))).toContain('steps.0.why');
  });

  it('caps a plan at five steps', () => {
    const steps = Array.from({ length: 6 }, () => advice.steps[0]);
    expect(issuePaths(CareAdviceSchema.safeParse({ ...advice, steps }))).toContain('steps');
  });
});

describe('RecognitionResultSchema advice', () => {
  it('defaults advice to null so provider adapters parse unchanged', () => {
    const result = RecognitionResultSchema.safeParse(recognized);
    expect(result.success).toBe(true);
    expect(result.data.advice).toBeNull();
  });

  it('accepts an attached care plan', () => {
    const advice = {
      summary: 'Looks healthy.',
      steps: [{ action: 'Pinch flower buds', when: 'Weekly', why: 'Keeps the leaves coming' }],
      watchFor: [],
    };
    const result = RecognitionResultSchema.safeParse({ ...recognized, advice });
    expect(result.success).toBe(true);
    expect(result.data.advice.steps).toHaveLength(1);
  });

  it('rejects malformed advice rather than silently dropping it', () => {
    const result = RecognitionResultSchema.safeParse({ ...recognized, advice: { summary: '' } });
    expect(issuePaths(result)).toContain('advice.summary');
  });
});

describe('CreateDiagnosisSchema climateZone', () => {
  const image = 'aGVsbG8=';

  it('accepts a diagnosis without a climate zone', () => {
    const result = CreateDiagnosisSchema.safeParse({ imageBase64: image });
    expect(result.success).toBe(true);
    expect(result.data.climateZone).toBeUndefined();
  });

  it('accepts a supported zone and rejects an unknown one', () => {
    expect(CreateDiagnosisSchema.safeParse({ imageBase64: image, climateZone: 'BEKAA' }).success).toBe(
      true,
    );
    const bad = CreateDiagnosisSchema.safeParse({ imageBase64: image, climateZone: 'DESERT' });
    expect(issuePaths(bad)).toContain('climateZone');
  });
});

describe('DraftPostSchema', () => {
  const plant = { nickname: 'Minty', speciesName: 'Mentha spicata', ageDays: 92 };

  it('accepts a diagnosis-only draft', () => {
    const result = DraftPostSchema.safeParse({ diagnosis: recognized });
    expect(result.success).toBe(true);
    expect(result.data.plant).toBeNull();
  });

  it('accepts a plant-only draft', () => {
    const result = DraftPostSchema.safeParse({ plant });
    expect(result.success).toBe(true);
    expect(result.data.diagnosis).toBeNull();
  });

  it('accepts both halves together', () => {
    expect(DraftPostSchema.safeParse({ diagnosis: recognized, plant }).success).toBe(true);
  });

  it('rejects a draft with nothing to write about', () => {
    expect(issuePaths(DraftPostSchema.safeParse({}))).toContain('plant');
    expect(issuePaths(DraftPostSchema.safeParse({ diagnosis: null, plant: null }))).toContain('plant');
  });

  it('rejects a plant with no nickname', () => {
    const result = DraftPostSchema.safeParse({ plant: { speciesName: 'Mentha spicata' } });
    expect(issuePaths(result)).toContain('plant.nickname');
  });

  it('rejects a non-ISO lastWateredAt', () => {
    const result = DraftPostSchema.safeParse({ plant: { ...plant, lastWateredAt: 'yesterday' } });
    expect(issuePaths(result)).toContain('plant.lastWateredAt');
  });

  it('accepts a null lastWateredAt for a never-watered plant', () => {
    expect(DraftPostSchema.safeParse({ plant: { ...plant, lastWateredAt: null } }).success).toBe(true);
  });
});

/**
 * The fixtures are not just mock scenery: they are seeded into the database and
 * handed to DraftPostSchema by both clients when someone asks the community for
 * help. A fixture that does not satisfy RecognitionResultSchema fails drafting
 * at runtime and nowhere else, which is exactly how a missing issue `code` got
 * shipped — so validate them here.
 */
describe('diagnosisFixtures', () => {
  it.each(Object.keys(diagnosisFixtures))('%s is a valid RecognitionResult', (name) => {
    const result = RecognitionResultSchema.safeParse(diagnosisFixtures[name]);
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it.each(Object.keys(diagnosisFixtures))('%s is draftable as a community post', (name) => {
    const result = DraftPostSchema.safeParse({ diagnosis: diagnosisFixtures[name] });
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });
});
