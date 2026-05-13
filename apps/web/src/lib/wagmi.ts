'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';
import { http } from 'wagmi';

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

export const wagmiConfig = getDefaultConfig({
  appName: 'Apogee Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [aristotle, galileo],
  transports: {
    [aristotle.id]: http('https://evmrpc.0g.ai'),
    [galileo.id]: http('https://evmrpc-testnet.0g.ai'),
  },
  ssr: true,
});
