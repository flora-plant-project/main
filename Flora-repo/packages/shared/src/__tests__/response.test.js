import { describe, expect, it } from 'vitest';
import { ErrorCode, fail, ok } from '../response.js';

describe('ApiResponse helpers', () => {
  it('ok() wraps data in a success envelope', () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it('fail() wraps code and message in an error envelope', () => {
    expect(fail(ErrorCode.NOT_FOUND, 'species not found')).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'species not found' },
    });
  });

  it('ErrorCode is frozen and exposes the canonical codes', () => {
    expect(Object.isFrozen(ErrorCode)).toBe(true);
    expect(Object.keys(ErrorCode)).toEqual([
      'VALIDATION',
      'UNAUTHORIZED',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PROVIDER_ERROR',
      'INTERNAL',
    ]);
  });
});
