import { describe, expect, it } from 'vitest';
import { IssueCode, IssueCodes, matchIssueCode } from '../issues.js';

describe('matchIssueCode', () => {
  it.each([
    ['Alternaria solani (early blight)', IssueCode.EARLY_BLIGHT],
    ['Phytophthora infestans', IssueCode.LATE_BLIGHT],
    ['powdery mildew', IssueCode.POWDERY_MILDEW],
    ['downy mildew', IssueCode.DOWNY_MILDEW],
    ['Septoria leaf spot', IssueCode.LEAF_SPOT],
    ['nutrient deficiency', IssueCode.NUTRIENT_DEFICIENCY],
    ['water-related issue', IssueCode.WATER_STRESS],
    ['spider mite infestation', IssueCode.PEST_INFESTATION],
  ])('maps %s', (name, expected) => {
    expect(matchIssueCode(name)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(matchIssueCode('POWDERY MILDEW')).toBe(IssueCode.POWDERY_MILDEW);
  });

  it('prefers the narrower phrase when two keywords overlap', () => {
    // "late blight" must win over a bare "blight", and "root rot" over "rot".
    expect(matchIssueCode('late blight')).toBe(IssueCode.LATE_BLIGHT);
    expect(matchIssueCode('root rot')).toBe(IssueCode.ROOT_ROT);
  });

  it.each([['senescence'], ['mechanical damage'], [''], [undefined], [null]])(
    'falls back to OTHER for %s',
    (name) => {
      expect(matchIssueCode(name)).toBe(IssueCode.OTHER);
    },
  );

  it('only ever returns a known code', () => {
    const samples = ['early blight', 'unknown gibberish', 'rust', ''];
    for (const sample of samples) {
      expect(IssueCodes).toContain(matchIssueCode(sample));
    }
  });
});
