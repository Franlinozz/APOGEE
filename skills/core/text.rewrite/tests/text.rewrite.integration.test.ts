import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.rewrite', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.rewrite');
    expect(manifest.sideEffects).toContain('compute');
  });
});
