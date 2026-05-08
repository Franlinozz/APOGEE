# APOGEE Protocol

Autonomous-agent runtime for 0G: self-custodial smart wallets, programmable spending policies, identity, encrypted persistent memory on 0G Storage, agent-to-agent payment rails with on-chain receipts, a paid skills marketplace, and 0G Compute-backed inference.

## Why APOGEE

Developers building autonomous agents need billing, identity, memory, payments, policy, and proof in one production runtime. APOGEE packages those primitives into a Stripe + AWS + Linear style developer experience for the 0G ecosystem.

## 0G integrations

- **0G Chain:** on-chain receipts for every billable agent action.
- **0G Storage:** encrypted persistent memory, addressed by verifiable root hashes.
- **0G Compute:** inference backbone via the 0G serving broker.
- **0G Testnet Galileo:** default development network.

## Monorepo

- `apps/web` — Next.js 14 App Router dashboard and proofs UX.
- `apps/api` — Fastify API for receipts, proofs, and health checks.
- `packages/contracts` — Solidity 0.8.24 receipt contract and Hardhat tests.
- `packages/0g` — 0G Storage/Compute integration adapters.
- `packages/config` — shared network constants and validated env loading.
- `packages/db` — Prisma schema/client package.

## Quickstart

```bash
corepack enable
corepack prepare pnpm@9.12.3 --activate
pnpm install
pnpm verify
```

Copy `.env.example` to `.env` for local services and 0G credentials. Never commit secrets.
