import { describe, expect, it } from 'vitest';
import manifest from '../manifest.js';

describe('text.translate', () => {
  it('declares compute side effect', () => {
    expect(manifest.id).toBe('text.translate');
    expect(manifest.sideEffects).toContain('compute');
  });
});
