import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { address: string; chains: string[]; tokens: string[]; currency: string };
  const chains = input.chains.map((chain) => ({ chain, totalValue: 0, assets: input.tokens.map((symbol) => ({ symbol, balance: '0', value: 0 })) }));
  return { address: input.address, currency: input.currency, chains, totalValue: chains.reduce((sum, chain) => sum + chain.totalValue, 0) };

}) as SkillHandler;

export default handler;
