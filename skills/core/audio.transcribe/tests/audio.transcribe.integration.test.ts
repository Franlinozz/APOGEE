import { describe, it, expect } from 'vitest';
import manifest from '../manifest.js';

describe('audio.transcribe integration manifest', () => {
  it('is a real testnet integration placeholder gated by environment', () => {
    const enabled = process.env.APOGEE_RUN_SKILL_INTEGRATION === '1';
    if (!enabled) {
      expect(manifest.id).toBe('audio.transcribe');
      return;
    }
    expect(manifest.pricePerCallWei).toBe(0n);
  });
});
