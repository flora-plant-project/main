import { IssueCode } from '../issues.js';

/**
 * Canned RecognitionResult-shaped fixtures for the mock diagnosis flow.
 * Select the next one with mockClient.setNextDiagnosisFixture(name); default is random.
 * 'blurry' has confidence < 0.55 and therefore surfaces lowConfidence: true.
 */
export const diagnosisFixtures = {
  'healthy-basil': {
    species: [
      {
        speciesId: 'sp1',
        scientificName: 'Ocimum basilicum',
        commonNames: ['Basil', 'حبق'],
        probability: 0.93,
      },
      { scientificName: 'Ocimum tenuiflorum', commonNames: ['Holy basil'], probability: 0.05 },
    ],
    health: { isHealthy: true, issues: [], confidence: 0.91 },
    advice: {
      summary: 'Your basil looks healthy. At this point the job is keeping it productive.',
      steps: [
        {
          action: 'Pinch off flower buds as soon as they appear',
          when: 'Weekly',
          why: 'Once basil flowers, leaf production drops and the flavour turns bitter.',
        },
        {
          action: 'Harvest from the top, cutting just above a pair of leaves',
          when: 'Ongoing',
          why: 'Each cut forces two new branches, so the plant gets bushier instead of leggy.',
        },
      ],
      watchFor: ['Leaves wilting by midday in the heat — that is a watering signal, not disease'],
    },
  },
  'diseased-tomato': {
    species: [
      {
        speciesId: 'sp2',
        scientificName: 'Solanum lycopersicum',
        commonNames: ['Tomato', 'بندورة'],
        probability: 0.88,
      },
    ],
    health: {
      isHealthy: false,
      issues: [
        {
          code: IssueCode.EARLY_BLIGHT,
          name: 'Early blight',
          probability: 0.81,
          treatmentHints: [
            'Remove the affected lower leaves',
            'Apply a copper-based fungicide',
            'Water at the base — keep the foliage dry',
          ],
        },
        {
          code: IssueCode.NUTRIENT_DEFICIENCY,
          name: 'Nitrogen deficiency',
          probability: 0.22,
          treatmentHints: ['Feed with a balanced fertilizer every two weeks'],
        },
      ],
      confidence: 0.84,
    },
    advice: {
      summary:
        'Your tomato has early blight, a fungal disease that starts on the oldest leaves and works upward. It is very treatable at this stage, but hot days followed by cool nights leave dew on the foliage every morning, which is exactly what the fungus needs to spread.',
      steps: [
        {
          action:
            'Cut off every leaf with brown target-shaped spots, plus the bare lower stems. Bag them — do not compost.',
          when: 'Today',
          why: 'Spores survive on fallen leaves and splash back up onto the plant.',
        },
        {
          action: 'Water at the soil line only, early in the morning',
          when: 'From the next watering',
          why: 'Morning water lets the leaves dry before nightfall; evening watering keeps them wet through the dew hours.',
        },
        {
          action: 'Apply a copper-based fungicide every 7-10 days while symptoms are active',
          when: 'After pruning, on a still evening',
          why: 'Copper is protective, not curative — it shields the healthy leaves you just saved.',
        },
      ],
      watchFor: [
        'Spots climbing past the middle of the plant despite treatment',
        'Dark sunken patches on the fruit itself',
        'Yellowing that starts at leaf tips rather than as distinct spots — that points to feeding, not blight',
      ],
    },
  },
  blurry: {
    species: [{ scientificName: 'Unknown', commonNames: [], probability: 0.31 }],
    health: { isHealthy: true, issues: [], confidence: 0.34 },
    // No advice: confidence is below LOW_CONFIDENCE_THRESHOLD, so the API skips
    // the model call entirely rather than advise on a bad identification.
    advice: null,
  },
};

export const fixtureNames = Object.keys(diagnosisFixtures);

/** One completed diagnosis so plant p2's timeline mixes logs and diagnoses. */
export const seedDiagnoses = [
  {
    id: 'dg_seed1',
    userId: 'u1',
    plantId: 'p2',
    imageUri: 'assets/demo/plant-2.jpg',
    mode: 'health',
    status: 'COMPLETE',
    fixtureName: 'diseased-tomato',
    createdAt: 1754326800000, // 2026-08-04T17:00:00.000Z
    result: diagnosisFixtures['diseased-tomato'],
    lowConfidence: false,
  },
];
