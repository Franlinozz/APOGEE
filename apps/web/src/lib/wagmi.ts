'use client';

import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain } from 'viem';

export const galileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: {
    default: { name: '0G Galileo Scan', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

export const aristotle = defineChain({
  id: 16661,
  name: '0G Aristotle Mainnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc.0g.ai'] } },
  blockExplorers: {
    default: { name: '0G Aristotle Scan', url: 'https://chainscan.0g.ai' },
  },
});

export const wagmiConfig = createConfig({
  chains: [galileo, aristotle],
  connectors: [injected()],
  transports: {
    [galileo.id]: http(),
    [aristotle.id]: http(),
  },
  ssr: true,
});
