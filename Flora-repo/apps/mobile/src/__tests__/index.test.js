import { appName } from '../index.js';

describe('mobile placeholder', () => {
  it('exports the package name', () => {
    expect(appName()).toBe('mobile');
  });
});
