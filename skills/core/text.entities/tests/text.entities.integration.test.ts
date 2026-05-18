import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.entities', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.entities');
    expect(manifest.sideEffects).toContain('compute');
  });
});
