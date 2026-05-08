import { describe, expect, it } from 'vitest';
import { chatMessageSchema } from './compute.js';

describe('chatMessageSchema', () => {
  it('rejects empty content', () => {
    expect(() => chatMessageSchema.parse({ role: 'user', content: '' })).toThrow();
  });
});
