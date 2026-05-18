import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.sentiment', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.sentiment');
    expect(manifest.sideEffects).toContain('compute');
  });
});
