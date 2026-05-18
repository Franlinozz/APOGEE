import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.summarize', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.summarize');
    expect(manifest.sideEffects).toContain('compute');
  });
});
