import type { SkillHandler, SkillHandlerContext } from '@apogee/skills-runtime';

const handler = (async function handler(raw: unknown, ctx: SkillHandlerContext): Promise<unknown> {
  const input = raw as { contractAddress: string; to: string; name: string; description?: string; image?: string; attributes: unknown[]; dryRun: boolean };
  const metadata = { name: input.name, description: input.description ?? '', image: input.image, attributes: input.attributes };
  const uploaded = await ctx.call('storage.uploadJson', [metadata]) as { rootHash?: string };
  const tokenUri = `0g://${uploaded.rootHash ?? 'pending'}`;
  if (input.dryRun) return { tokenUri, storageRoot: uploaded.rootHash, dryRun: true };
  const tx = await ctx.call('chain.send', [{ to: input.contractAddress, data: JSON.stringify({ mintTo: input.to, tokenUri }) }]) as { hash?: string };
  return { tokenUri, storageRoot: uploaded.rootHash, txHash: tx.hash, dryRun: false };

}) as SkillHandler;

export default handler;
