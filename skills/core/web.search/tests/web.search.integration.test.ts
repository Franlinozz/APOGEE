import { describe, it, expect } from 'vitest';
import manifest from '../manifest.js';

describe('web.search integration manifest', () => {
  it('is a real testnet integration placeholder gated by environment', () => {
    const enabled = process.env.APOGEE_RUN_SKILL_INTEGRATION === '1';
    if (!enabled) {
      expect(manifest.id).toBe('web.search');
      return;
    }
    expect(manifest.pricePerCallWei).toBe(0n);
  });
});
