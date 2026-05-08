import { describe, it, expect } from 'vitest';
import manifest from '../manifest.js';

describe('chat.embed integration manifest', () => {
  it('is a real testnet integration placeholder gated by environment', () => {
    const enabled = process.env.APOGEE_RUN_SKILL_INTEGRATION === '1';
    if (!enabled) {
      expect(manifest.id).toBe('chat.embed');
      return;
    }
    expect(manifest.pricePerCallWei).toBe(0n);
  });
});
