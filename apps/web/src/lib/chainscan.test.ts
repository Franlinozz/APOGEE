import { describe, expect, it } from 'vitest';
import { buildChainscanUrl } from './chainscan';

const tx = `0x${'a'.repeat(64)}`;
const addr = `0x${'b'.repeat(40)}`;

describe('buildChainscanUrl', () => {
  it('builds valid aristotle tx links', () => {
    expect(buildChainscanUrl({ txHash: tx, chainId: 16661 })).toBe(`https://chainscan.0g.ai/tx/${tx}`);
    expect(buildChainscanUrl({ txHash: tx, network: 'aristotle' })).toBe(`https://chainscan.0g.ai/tx/${tx}`);
  });

  it('builds valid galileo tx links', () => {
    expect(buildChainscanUrl({ txHash: tx, chainId: 16602 })).toBe(`https://chainscan-galileo.0g.ai/tx/${tx}`);
    expect(buildChainscanUrl({ txHash: tx, network: 'galileo' })).toBe(`https://chainscan-galileo.0g.ai/tx/${tx}`);
  });

  it('returns null for invalid tx values', () => {
    expect(buildChainscanUrl({ txHash: '0x1234' })).toBeNull();
    expect(buildChainscanUrl({ txHash: '1' })).toBeNull();
  });

  it('builds valid address links', () => {
    expect(buildChainscanUrl({ address: addr, chainId: 16661 })).toBe(`https://chainscan.0g.ai/address/${addr}`);
  });

  it('returns null for invalid addresses', () => {
    expect(buildChainscanUrl({ address: 'aurora', kind: 'address' })).toBeNull();
    expect(buildChainscanUrl({ address: '2', kind: 'address' })).toBeNull();
  });

  it('returns null for an agent without accountAddress', () => {
    expect(buildChainscanUrl({ address: undefined, kind: 'address' })).toBeNull();
  });

  it('never creates chainscan URLs for agent names or tokenIds', () => {
    expect(buildChainscanUrl({ value: 'aurora' })).toBeNull();
    expect(buildChainscanUrl({ value: 'vesper' })).toBeNull();
    expect(buildChainscanUrl({ value: '1' })).toBeNull();
    expect(buildChainscanUrl({ value: '2' })).toBeNull();
  });
});
