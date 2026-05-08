import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { text?: string; bytes?: Uint8Array; encrypt?: boolean; agentPubKey?: string };
  const payload = input.bytes ?? input.text ?? '';
  return await ctx.call('storage.uploadBytes', [payload, { encrypt: Boolean(input.encrypt), agentPubKey: input.agentPubKey }]);
}) as SkillHandler;

export default handler;
