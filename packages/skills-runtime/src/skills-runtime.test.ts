import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SkillRegistry, SkillRunner, TimeoutError, ValidationError, EgressDenied } from './index.js';

const manifest = {
  id: 'test.echo',
  version: '1.0.0',
  author: { name: 'tests' },
  description: 'Echo test skill',
  inputs: z.object({ value: z.string() }),
  outputs: z.object({ value: z.string() }),
  sideEffects: [],
  declaredEgress: [],
  pricePerCallWei: 0n,
  requiresEnv: [],
  timeoutMs: 5_000,
} as const;

describe('SkillRegistry', () => {
  it('registers, gets, lists, and uninstalls skills', () => {
    const registry = new SkillRegistry();
    registry.register(manifest, async (input) => input);
    expect(registry.get('test.echo').manifest.id).toBe('test.echo');
    expect(registry.list({ freeOnly: true })).toHaveLength(1);
    registry.uninstall('test.echo');
    expect(registry.list()).toHaveLength(0);
  });
});

describe('SkillRunner', () => {
  it('executes a skill in an isolate and validates output', async () => {
    const registry = new SkillRegistry();
    registry.register(manifest, async function handler(input) { return input; });
    const runner = new SkillRunner(registry);
    await expect(runner.execute('test.echo', { value: 'ok' }, { agentId: 'agent-1' })).resolves.toMatchObject({ output: { value: 'ok' } });
  });

  it('translates input validation failures', async () => {
    const registry = new SkillRegistry();
    registry.register(manifest, async function handler(input) { return input; });
    const runner = new SkillRunner(registry);
    await expect(runner.execute('test.echo', { value: 1 }, { agentId: 'agent-1' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('captures storage provenance from context calls', async () => {
    const registry = new SkillRegistry();
    registry.register({ ...manifest, sideEffects: ['storage'] }, async function handler(input, ctx) {
      await ctx.call('storage.uploadBytes', [new Uint8Array([1]), {}]);
      return input;
    });
    const runner = new SkillRunner(registry);
    const storageClient = { uploadBytes: async () => ({ rootHash: 'root-1', txHash: 'tx-1', size: 1 }) };
    const result = await runner.execute('test.echo', { value: 'ok' }, { agentId: 'agent-1', storageClient, allowStorageWrite: true });
    expect(result.provenance.storageRoots).toEqual(['root-1']);
    expect(result.provenance.txHashes).toEqual(['tx-1']);
  });

  it('enforces declared egress', async () => {
    const registry = new SkillRegistry();
    registry.register({ ...manifest, sideEffects: ['http'] }, async function handler(input, ctx) {
      await ctx.call('http.fetch', { url: 'https://example.com' });
      return input;
    });
    const runner = new SkillRunner(registry);
    await expect(runner.execute('test.echo', { value: 'ok' }, { agentId: 'agent-1' })).rejects.toBeInstanceOf(EgressDenied);
  });

  it('enforces timeout', async () => {
    const registry = new SkillRegistry();
    registry.register({ ...manifest, timeoutMs: 5 }, async function handler(input) {
      while (true) { Math.random(); }
      return input;
    });
    const runner = new SkillRunner(registry);
    await expect(runner.execute('test.echo', { value: 'ok' }, { agentId: 'agent-1' })).rejects.toBeInstanceOf(TimeoutError);
  });
});
