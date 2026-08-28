import { describe, expect, it } from 'vitest';
import { serviceName } from '../index.js';

describe('api placeholder', () => {
  it('exports the package name', () => {
    expect(serviceName()).toBe('api');
  });
});
