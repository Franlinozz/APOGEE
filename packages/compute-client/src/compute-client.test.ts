import { describe, expect, it } from 'vitest';
import { buildChatCompletionBody } from './index.js';

describe('buildChatCompletionBody', () => {
  it('disables GLM thinking so skill calls return message.content, not reasoning-only payloads', () => {
    const body = buildChatCompletionBody({
      messages: [{ role: 'user', content: 'Summarize this.' }],
      maxTokens: 72,
    }, 'zai-org/GLM-5-FP8');

    expect(body).toMatchObject({
      model: 'zai-org/GLM-5-FP8',
      stream: false,
      max_tokens: 72,
      chat_template_kwargs: { enable_thinking: false },
    });
  });
});
