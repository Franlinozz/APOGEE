type EntityType = 'PERSON' | 'PLACE' | 'ORG' | 'OTHER';

export type RenderedSkillOutput =
  | { kind: 'text'; text: string; mono?: boolean }
  | { kind: 'sentiment'; sentiment: 'positive' | 'negative' | 'neutral'; score: number }
  | { kind: 'entities'; entities: Array<{ type: EntityType; value: string }> }
  | { kind: 'unexpected'; raw: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asString = (value: unknown): string | null => typeof value === 'string' && value.trim().length > 0 ? value : null;

const rawJson = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const unexpected = (output: unknown): RenderedSkillOutput => ({ kind: 'unexpected', raw: rawJson(output) });

function lastAssistantMessage(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (const item of [...messages].reverse()) {
    if (!isRecord(item)) continue;
    if (item.role !== 'assistant') continue;
    const content = asString(item.content);
    if (content) return content;
  }
  return null;
}

export function normalizeSkillOutput(skillId: string, output: unknown): RenderedSkillOutput {
  const record = isRecord(output) ? output : null;
  if (!record) return unexpected(output);

  if (skillId === 'text.summarize') {
    const summary = asString(record.summary);
    return summary ? { kind: 'text', text: summary } : unexpected(output);
  }

  if (skillId === 'text.translate') {
    const translation = asString(record.translation);
    return translation ? { kind: 'text', text: translation } : unexpected(output);
  }

  if (skillId === 'code.review') {
    const review = asString(record.review);
    return review ? { kind: 'text', text: review, mono: true } : unexpected(output);
  }

  if (skillId === 'chat.completion') {
    const content = asString(record.content) ?? lastAssistantMessage(record.messages);
    return content ? { kind: 'text', text: content } : unexpected(output);
  }

  if (skillId === 'text.sentiment') {
    const rawSentiment = typeof record.sentiment === 'string' ? record.sentiment.toLowerCase() : '';
    const sentiment = rawSentiment === 'positive' || rawSentiment === 'negative' || rawSentiment === 'neutral' ? rawSentiment : null;
    const rawScore = typeof record.score === 'number' ? record.score : Number(record.score);
    if (!sentiment || !Number.isFinite(rawScore)) return unexpected(output);
    return { kind: 'sentiment', sentiment, score: Math.min(1, Math.max(0, rawScore)) };
  }

  if (skillId === 'text.entities') {
    if (!Array.isArray(record.entities)) return unexpected(output);
    const entities = record.entities.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const rawType = typeof entry.type === 'string' ? entry.type.toUpperCase() : 'OTHER';
      const type: EntityType = rawType === 'PERSON' || rawType === 'PLACE' || rawType === 'ORG' || rawType === 'OTHER' ? rawType : 'OTHER';
      const value = asString(entry.value);
      return value ? [{ type, value }] : [];
    });
    return { kind: 'entities', entities };
  }

  return unexpected(output);
}
