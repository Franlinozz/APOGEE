import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.title', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.title');
    expect(manifest.sideEffects).toContain('compute');
  });
});
