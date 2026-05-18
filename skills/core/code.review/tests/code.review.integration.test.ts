import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('code.review', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('code.review');
    expect(manifest.sideEffects).toContain('compute');
  });
});
