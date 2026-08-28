import { describe, expect, it } from 'vitest';
import { stackPrefix } from '../index.js';

describe('infra placeholder', () => {
  it('exports the stack prefix', () => {
    expect(stackPrefix()).toBe('flora');
  });
});
