# Decisions

## 2026-05-08 — Prompt 1 complete

- Deployed and verified all 9 Prompt 1 contracts on 0G Galileo testnet; `packages/contracts/deployments/galileo.json` contains addresses, tx hashes, block numbers, and `verified: true` for each entry.
- Contract addresses: PolicyEngine=0xa8933d96A27BDfFac07C0d7467f3213cb340f550; ReceiptBook=0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53; AgentIdentity=0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3; ServiceRegistry=0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad; RevenueSplitter=0x1E32A89B6815a492Ad30f71a5E35280EF7399b74; PaymentRouter=0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c; EscrowVault=0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767; AccountFactory=0xABc44aF98e6d873C0700c9B687fbf3Be560cba90; AgentAccount=0xc18eD4e075a23A66505744A353eeFE91340F924d.
- Verification gates: `pnpm install`, `pnpm -F @apogee/contracts compile`, `pnpm -F @apogee/contracts test`, and coverage all passed; coverage report is 84% branch overall.
- Gas snapshot: local Hardhat gas reporter output from `pnpm -F @apogee/contracts test` / `coverage` in this run.
- Deviation: `RevenueSplitter` is deployed before `PaymentRouter` because `PaymentRouter` requires its address in the constructor; no mainnet deployment was performed.

## 2026-05-08 — Prompt 2 foundational clients

- Added `@apogee/chain-client`, `@apogee/storage-client`, `@apogee/compute-client`, and `@apogee/memory` as the only 0G SDK integration boundary packages.
- `ChainClient` reuses a single ethers v6 provider/signer, estimates gas, applies 250/750/2000ms retry backoff, caps EIP-1559 max fee from fee history/base fee, logs sends via Pino, supports sequential batching, receipt waits, contracts, and custom error decoding.
- `StorageClient` wraps `@0glabs/0g-ts-sdk` Indexer/ZgFile, uses SDK Merkle tree/upload/download verification, AES-256-GCM encrypted payload support, temp-file cleanup, and a 64 MB in-memory LRU cache.
- `ComputeClient` wraps `@0glabs/0g-serving-broker`, centralizes provider listing, acknowledgement, request headers, chat completion calls, and required `processResponse(providerAddress, chatID, usageData)` settlement order.
- `MemoryEngine` sits on storage/chain clients with per-agent mutexed writes, encrypted blobs, index/version tracking, semantic search vectors, and ReceiptBook anchoring with `bytes4(keccak256("memory.commit"))`.
- Deviation: Prompt 2 text did not include a detailed D section for compute-client, so the implementation follows the project’s stored 0G compute constraints and local 0G compute skill patterns.
- Verification gates passed locally under Node 22 with expected Node 20 engine warnings: `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm lint`.

## 2026-05-08 — Prompt 2 compute-client completion and integration harness

- Reworked `@apogee/compute-client` to match the full D spec from the 0G compute pattern: provider discovery/acknowledgement, ledger deposit/balance/refund/withdraw, chat streaming and non-streaming, embeddings, image generation, transcription, request-header signing, response processing, sealed-mode TEE attestation digests, and receipt-ready metadata without minting receipts.
- Tightened all four foundational clients around `src/index.ts` exports only, Pino logger injection/defaults, Zod validation on public method inputs, typed error classes with `.code`, and no top-level network calls.
- Added package-level Vitest `.integration.test.ts` suites for chain, storage, compute, and memory with at least six real-testnet tests each; default `pnpm test` excludes them and package `pnpm test:integration` runs them explicitly.
- Integration tests require dedicated testnet environment variables (`ZERO_G_GALILEO_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, plus provider/indexer variables where needed) and intentionally skip when those secrets are absent from the shell.
- Verification gates run locally under Node 22 with expected Node 20 engine warnings: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, and package integration commands in skip mode because testnet secrets were not present in the environment.

## 2026-05-08 — Prompt 3 skills runtime and core skills

- Implemented `@apogee/skills-runtime` with Zod skill manifests, semver/dot-case validation, `SkillRegistry`, isolated-vm-backed `SkillRunner`, UI-safe typed `SkillError` taxonomy, timeout enforcement, input/output validation, egress checks, context-only capability calls, and provenance capture for chat IDs, storage roots, tx hashes, and attestations.
- Added isolated-vm install/runtime notes in `packages/skills-runtime/README.md`; every run creates a fresh 128 MB isolate and skills only access capabilities through `ctx.call`.
- Added the 12 free built-in core skill folders under `skills/core`: `chat.completion`, `chat.embed`, `image.generate`, `audio.transcribe`, `web.search`, `web.fetch`, `memory.write`, `memory.read`, `memory.search`, `chain.query`, `chain.send`, and `storage.upload`, each with `manifest.ts`, `handler.ts`, marketplace README, and integration test placeholder.
- Added `registerCoreSkills()` loader export for built-ins and runtime `loadSkills()` support for build-time scanned `skills/core` and `skills/premium` manifests.
- Extended `@apogee/chain-client` with `query()` and `sendViaAgentAccount()` so `chain.query` and `chain.send` have a typed boundary method instead of direct ethers usage inside skills.
- Verification gates passed locally under Node 22 with expected Node 20 engine warnings: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm -F @apogee/skills-runtime test`, and `pnpm test:skills`.

## 2026-05-08 — Prompt 4 billing, receipts, Edge API, and WS

- Added `@apogee/billing` with EIP-712 `QuoteIssuer`, Redis-compatible `QuoteStore`, `SettlementHandler`, `RefundManager`, and BullMQ `SubscriptionScheduler` queue named `subscriptions`.
- Added `ReceiptMinter` with canonical JSON hashing, 0G Storage upload retries, local pending fallback, 60s background reconciler hook, chain submission retries, idempotency via `clientReceiptId`, receipt index abstraction, and WS event-bus publishing.
- Added `@apogee/edge` Fastify API with `POST /v1/quote`, `POST /v1/settle`, `POST /v1/refund`, `/health`, and WebSocket `/v1/ws` receipt events.
- Extended `PaymentRouter` with payee-signed off-chain quote settlement via `paySignedQuote(...)` so an external quote returned by the Edge API can be paid directly on-chain, while preserving the existing on-chain quote `pay(...)` path.
- Added `PaymentRouter.refund(...)` receipt recording with payee/owner/timeout authorization and refund receipt emission. Note: because the current router distributes payments immediately, this records/refund-attests rather than escrowing prior funds.
- Verification gates passed locally under Node 22 with expected Node 20 engine warnings: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, plus targeted billing, edge, and contracts tests. Disk remained below threshold at 78%.

## 2026-05-08 — Prompt 4C/4D Edge hardening and PostgreSQL schema

- Expanded `@apogee/edge` into a Fastify 5 service with Helmet, configurable CORS, global and route-specific rate limits, JWT auth, SIWE nonce/verify flow, Swagger/OpenAPI 3.1 UI at `/docs/api`, WebSocket streaming at `/v1/stream/:agentId`, RFC 7807 problem errors, and SIGTERM graceful shutdown.
- Implemented the requested Edge route surface: SIWE auth, agents, policies, skills, runs, services, quote/settle/refund, memory CRUD/search, receipts, and health endpoints. Public routes remain `/v1/quote` and `GET /v1/services`; owner-scoped routes require Bearer JWT.
- Kept Edge free of direct ethers imports; SIWE signature recovery is exposed through `@apogee/chain-client.verifyMessage(...)`, and Edge uses `EDGE_SERVICE_PRIVATE_KEY` rather than deployer key for service-account operations.
- Added Fastify/Zod OpenAPI generation via `fastify-type-provider-zod`; all route inputs are parsed by Zod before handler logic.
- Added Prisma PostgreSQL schema and migration for agents, policies, services, receipts, payments, subscriptions, memory_index, skill_installs, runs, run_steps, sessions, and webhook_events with query indexes.
- Verification gates passed locally under Node 22 with expected Node 20 engine warnings: Prisma schema validation, `pnpm -F @apogee/edge build`, local Edge server curl health/docs checks on port 8080, `pnpm -F @apogee/billing test`, `pnpm test:e2e:billing` in env-gated skip mode, `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm lint`. Disk remained below threshold at 78%.
