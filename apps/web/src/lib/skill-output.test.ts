import { describe, expect, it } from 'vitest';
import { normalizeSkillOutput } from './skill-output';

describe('normalizeSkillOutput', () => {
  it('renders text.summarize summary text', () => {
    expect(normalizeSkillOutput('text.summarize', { summary: 'Short summary.' })).toEqual({ kind: 'text', text: 'Short summary.' });
  });

  it('renders text.translate translation text', () => {
    expect(normalizeSkillOutput('text.translate', { translation: 'Bonjour.' })).toEqual({ kind: 'text', text: 'Bonjour.' });
  });

  it('renders text.title title text', () => {
    expect(normalizeSkillOutput('text.title', { title: 'A crisp headline' })).toEqual({ kind: 'text', text: 'A crisp headline' });
  });

  it('renders text.rewrite rewritten text', () => {
    expect(normalizeSkillOutput('text.rewrite', { rewrite: 'This is clearer.' })).toEqual({ kind: 'text', text: 'This is clearer.' });
  });

  it('renders text.sentiment label and score', () => {
    expect(normalizeSkillOutput('text.sentiment', { sentiment: 'positive', score: 0.873 })).toEqual({ kind: 'sentiment', sentiment: 'positive', score: 0.873 });
  });

  it('renders empty text.entities as an empty entities list', () => {
    expect(normalizeSkillOutput('text.entities', { entities: [] })).toEqual({ kind: 'entities', entities: [] });
  });

  it('renders text.entities entries with normalized badges', () => {
    expect(normalizeSkillOutput('text.entities', { entities: [{ type: 'PERSON', value: 'Ada' }, { type: 'unknown', value: 'Thing' }] })).toEqual({
      kind: 'entities',
      entities: [{ type: 'PERSON', value: 'Ada' }, { type: 'OTHER', value: 'Thing' }],
    });
  });

  it('renders text.keywords entries with normalized badges', () => {
    expect(normalizeSkillOutput('text.keywords', { keywords: [{ type: 'KEYWORD', value: 'agent runtime' }, { type: 'unknown', value: '0G' }] })).toEqual({
      kind: 'entities',
      entities: [{ type: 'KEYWORD', value: 'agent runtime' }, { type: 'KEYWORD', value: '0G' }],
    });
  });

  it('renders code.review in monospace mode', () => {
    expect(normalizeSkillOutput('code.review', { review: '- Looks good\n- Add tests' })).toEqual({ kind: 'text', text: '- Looks good\n- Add tests', mono: true });
  });

  it('renders chat.completion content directly', () => {
    expect(normalizeSkillOutput('chat.completion', { content: 'Hello there.' })).toEqual({ kind: 'text', text: 'Hello there.' });
  });

  it('renders chat.completion from the last assistant message', () => {
    expect(normalizeSkillOutput('chat.completion', { messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }] })).toEqual({ kind: 'text', text: 'Hello.' });
  });

  it('falls back to unexpected format with raw JSON', () => {
    const normalized = normalizeSkillOutput('text.summarize', { wrong: { nested: true } });
    expect(normalized.kind).toBe('unexpected');
    expect(normalized).toMatchObject({ raw: '{\n  "wrong": {\n    "nested": true\n  }\n}' });
  });
});
