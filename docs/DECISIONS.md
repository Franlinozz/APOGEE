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

## 2026-05-10 — Prompt 6: frontend foundation, design system, landing page

- Bootstrapped `apps/web` with Next.js 14.2.35 App Router, TypeScript strict, Tailwind 3.4.x, Geist Sans + Geist Mono (npm self-hosted), standalone output, `poweredByHeader: false`, bundle analyzer (`ANALYZE=true`), `optimizePackageImports` for lucide-react and framer-motion, and Avif/WebP image formats.
- Built `packages/ui` design system: 14 components (Button/Input/Textarea/Select/Switch/Slider/Card/Badge/Tag/Toast/Skeleton/EmptyState/StatTile/ChainAddress/ReceiptRow/AgentAvatar/CodeBlock), 4 layout primitives (Container/Stack/Row/Grid), Fade/RiseIn/StaggeredChildren motion wrappers gated on `prefers-reduced-motion`, `tokens.css` with CSS custom properties, and a Tailwind preset re-exported at `@apogee/ui/tailwind-preset`.
- Landing page: Nav (sticky, blurred backdrop), Hero (H1 gradient text, pure-CSS orbital SVG animation at 40s, zero client JS above the fold), lazy-loaded ReceiptsTicker (WebSocket + SSR snapshot fallback, `next/dynamic ssr:false`), 3 feature panels (CSS-only hover), 4-step How It Works, 0G Stack badge row, async NumbersSection (60 s revalidation), FinalCta, Footer with all 5 Galileo contract addresses linked to chainscan-galileo.0g.ai.
- Performance verified: First Load JS gzip 98.1 KB (budget 130 KB ✓); CSS gzip 6.1 KB (budget 30 KB ✓); all hero content SSR'd; orbital animation CSS ~400 B, no JS.
- Lighthouse CI config added at `apps/web/.lighthouserc.json`; asserts all 4 Lighthouse categories ≥ 95 and LCP ≤ 1800 ms.
- Deviation: `exactOptionalPropertyTypes` disabled in `packages/ui/tsconfig.json` (kept enabled in all other packages). This is necessary because Radix UI's JSX prop types for optional boolean/string fields are not compatible with the strict mode flag when spreading destructured props. The setting applies only to the component-library package, not to app or domain code.
- Follow-up: `NEXT_PUBLIC_API_URL` must be set in `apps/web/.env.local` before NumbersSection and ReceiptsTicker can fetch live data. Add `/v1/stats` endpoint to `apps/edge` in a later prompt.

## 2026-05-10 — Prompt 7: authenticated app surface (dashboard, agents, marketplace, memory, receipts, policies)

- Added wagmi 2.14.1 + viem 2.21.58 with custom 0G Galileo (16602) and Aristotle (16661) chain configs; injected connector only (no RainbowKit). `WagmiProvider` added to `(app)` and `connect` route groups only — landing page retains zero client JS.
- SIWE auth flow: `POST /v1/auth/siwe/nonce` + `POST /v1/auth/siwe/verify`; JWT stored as httpOnly cookie `apogee-jwt` via `/api/auth/set-cookie`; never localStorage.
- `apps/web/src/middleware.ts` gates all app routes on `apogee-jwt` cookie presence; redirects to `/connect?redirect=<path>` on missing cookie.
- App shell: `Sidebar` (client, active route highlighting) + `Topbar` (server, JWT decode for address display, "New agent" CTA).
- Pages shipped: `/dashboard` (stat tiles, 7×24 CSS heatmap, recent receipts), `/agents` (TanStack Table v8, row virtualizer above 100 rows), `/agents/new` (5-step wizard: Identity/Funding/Policy/Skills/Deploy with CSS progress steps), `/agents/:id` (7-tab detail: Overview/Activity/Memory/Skills/Policy/Splits/Settings), `/marketplace` (Skills + Services tabs with filter), `/memory` (index), `/memory/:agentId` (tree view, semantic search, anchor-on-chain), `/receipts` (TanStack Table, CSV export), `/policies/:id` (read-only + new-version CTA), `/apogee-pilot` (placeholder), `/connect` (wallet connect page).
- API split: `lib/api.ts` is client-safe (pure fetch, no `next/headers`); `lib/server-api.ts` is server-only (reads `apogee-jwt` cookie, wraps api.ts calls). Server pages import from `server-api.ts`; client components import from `api.ts`.
- Deviation: `exactOptionalPropertyTypes: false` added to `apps/web/tsconfig.json`. Required because apps/web directly imports packages/ui source (via `transpilePackages`), and packages/ui Radix UI wrappers are incompatible with this strict flag. The landing page and domain packages are unaffected.
- Deviation: `webpack.extensionAlias` added to `next.config.mjs` to resolve `.js` imports to `.ts`/`.tsx` source files for `@apogee/ui` transpiled package. This is needed because packages/ui uses TypeScript ESM `.js` extension convention.
- Performance: Landing page 98.2 KB (budget 130 KB ✓); Dashboard 180 KB (budget 180 KB ✓). `pnpm typecheck`, `pnpm build`, and `pnpm lint` all green.
- Follow-up: Add `GET /v1/stats` and `GET /v1/receipts/heatmap` endpoints to `apps/edge`; wire wagmi wallet balance display in dashboard; add real deploy transaction signing in WizardStepDeploy.

## 2026-05-10 — Prompt 7 verification

- Verification gates passed: `pnpm -F @apogee/web typecheck` ✓, `pnpm -F @apogee/web build` ✓ (landing 98.2 KB, dashboard 180 KB), `pnpm -F @apogee/web lint` ✓, `pnpm -F @apogee/web test` ✓ (stub). Cross-package checks: `packages/ui`, `packages/billing`, `apps/edge` typecheck all ✓ (no regression).
- Vercel deployment: `success` — https://apogee-18dr54j1k-franlinozzs-projects.vercel.app (sha 17050bc).
- CI fix: corrected `pnpm/action-setup` step ordering in `.github/workflows/ci.yml` — must run before `actions/setup-node` (which uses pnpm for cache lookup). All prior CI failures had this same root cause.
- Disk management: `pnpm store prune` run after each build; `.next` artifacts deleted immediately post-verification. VM root filesystem at ~96% (9.7 GB total). Per-session discipline: clear `.next` and `/tmp/*.log` after each build cycle.

## 2026-05-10 — Wallet auth fix (SIWE sign-in on Vercel)

- Root cause: `apps/web/src/lib/api.ts` used `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'` as the base for `siweNonce` and `siweVerify` calls. On Vercel `NEXT_PUBLIC_API_URL` is unset, so the browser fired fetch requests to `http://localhost:8080/v1/auth/siwe/*` which fail immediately with `TypeError: Failed to fetch`.
- Fix: Added two same-origin Next.js API proxy routes — `apps/web/src/app/api/auth/siwe/nonce/route.ts` and `.../verify/route.ts` — that forward POST bodies to the Edge API using the server-side env var `EDGE_API_URL`. Updated `siweNonce` and `siweVerify` in `api.ts` to call `/api/auth/siwe/nonce` and `/api/auth/siwe/verify` (relative, same-origin). The browser never needs to know the Edge API URL; CORS is irrelevant for the auth path.
- UX: ConnectWallet.tsx now distinguishes EIP-1193 user rejection (code 4001 → silently resets to idle), `ApiError` (shows detail/title), `TypeError` (network error message), and other errors. Eliminates the raw "Failed to fetch" display.
- Files changed: `apps/web/src/lib/api.ts`, `apps/web/src/components/auth/ConnectWallet.tsx`, `apps/web/src/app/api/auth/siwe/nonce/route.ts` (new), `apps/web/src/app/api/auth/siwe/verify/route.ts` (new), `.env.example`.
- Vercel env vars required: `EDGE_API_URL` (server-side, points to the deployed Edge API, no trailing slash) and `NEXT_PUBLIC_API_URL` (client-side, same host, for authenticated app API calls).

## 2026-05-10 — Prompt 8: Apogee Pilot (floating chatbot with streaming)

- Added floating chatbot launcher (56px, bottom-right, 4s CSS breathing animation) + slide-up panel (380×560 desktop, full-screen mobile) on every page. Keyboard: Cmd/Ctrl+K toggle, Esc close, Enter send, Shift+Enter newline. aria-live="polite" on stream region, focus trap when open.
- Components: `ApogeeePilot.tsx` (orchestrator), `Launcher.tsx` (breathing orbit button with notification dot), `Panel.tsx` (header/messages/chips/input), `Avatar.tsx` (animated SVG orbit), `ChatMessage.tsx` (code-block-aware inline markdown renderer, no external parser), `useSSE.ts` (fetch-based SSE client with abort), `pilot.module.css` (keyframe animations). All CSS-only animation — no framer-motion added, zero initial-route JS delta.
- Edge route `POST /v1/pilot/chat`: JWT-optional (guest rate-limited to 5/10min via IP), SSE streaming (`event: token`, `tool_call`, `tool_result`, `done`, `error`), read-only tool executor (`getMyAgents`, `listRecentReceipts`, `getMemorySummary`, `getProtocolStats`, `explainConcept`), token-by-token simulation when `PILOT_LLM_BASE_URL`/`PILOT_LLM_API_KEY` not set, real OpenAI-compatible streaming when set. Conversation history stored in `InMemoryEdgeStore.pilotConversations` (Postgres migration is a follow-up).
- Next.js proxy route `POST /api/pilot/chat` pipes the SSE stream from Edge API server-side (reads `apogee-jwt` cookie) — browser calls same-origin only.
- Landing page: guest Pilot from root layout (dynamic, `ssr:false`) when unauthenticated. App pages: auth Pilot from `(app)/layout.tsx`. No double-mount: root layout skips guest Pilot when `apogee-jwt` cookie present.
- Bundle: initial-route JS unchanged (98.2 kB landing, 180 kB dashboard). Pilot lazy chunk loaded only on first open.
- Deviation: `apps/edge/routes/pilot/chat.ts` spec path not created — route added directly to `apps/edge/src/index.ts` following existing monolithic pattern. `react-markdown`/`remark-gfm` not installed; custom inline renderer used instead (avoids disk pressure on 9.7 GB VM and adds zero npm deps to the project).
- Optional real LLM env vars (Railway): `PILOT_LLM_BASE_URL` (OpenAI-compatible base URL), `PILOT_LLM_API_KEY`, `PILOT_LLM_MODEL` (default `gpt-4o-mini`). Without these, simulation streams context-aware canned responses.
- Verification: `pnpm -F @apogee/edge typecheck` ✓, `pnpm -F @apogee/edge build` ✓, `pnpm -F @apogee/web typecheck` ✓, `pnpm -F @apogee/web build` ✓ (no bundle regression).

## 2026-05-10 — Prompt 9: Aristotle mainnet scripts, demo agents, heartbeat loops, reconciler, /proofs page

- Added `packages/contracts/scripts/deploy-aristotle.ts`: chainId 16661 guard, balance ≥ 0.5 0G preflight, `--dry-run` flag (gas estimation via `factory.getDeployTransaction()` + `provider.estimateGas()`, aborts if total > 0.3 0G without deploying), deploys all 9 contracts, authorises relayers, verifies on chainscan.0g.ai, writes `deployments/aristotle.json`, regenerates `apps/web/src/lib/contracts.ts` with both network entries.
- Added `packages/contracts/scripts/seed-demo-agents.ts`: `--testnet` flag for Galileo vs Aristotle, deploys AgentAccount + mints iNFT for Aurora/Vesper/Helix, registers policies with computed allowlistRoot, registers Vesper in ServiceRegistry as `vesper.media`, writes `deployments/demo-agents-{network}.json`.
- Added `apps/runtime/src/heartbeats.ts`: three BullMQ heartbeat loops — Aurora (10 min: web.search→news.aggregate→summarize.long→chat.embed→memory.write→receipt 0.0005 0G), Vesper (15 min: memory.search→image.generate→storage.upload→nft.mint→receipt 0.0002 0G), Helix (30 min: chain.query→chat.completion→memory.write→receipt). All calls wrapped in `safeSkill()` (catch+continue). Default paused via `HEARTBEATS_PAUSED=true`; activates when `HEARTBEATS_PAUSED=false`. Exports `lastHeartbeat` for health endpoint.
- Added `apps/runtime/src/reconciler.ts`: BullMQ job every 60s, reads fallback dir, retries `receiptMinter.mint()`, deletes file on success, warns if age > 10 min.
- Extended `apps/runtime/src/index.ts`: `startRuntime()` now creates SkillRunner, ReceiptMinter (with `InMemoryReceiptIndex` + fallbackDir), schedules heartbeats and reconciler, creates heartbeat and reconciler workers. `/health` endpoint returns `{ ok, uptimeSec, lastHeartbeat }`.
- Extended `apps/edge/src/index.ts`: `GET /v1/health` now returns chain status (Galileo + Aristotle) and runtime state. Chain status cached in background `setInterval(30s)` via `addHook('onReady')` so health endpoint is instant (6ms in tests, down from ~958ms). `GET /v1/proofs`: public, ISR-friendly, returns 14d×24h heatmap, demo agents with heartbeat state, last 50 receipts, 5 storage proof samples. `POST /internal/heartbeat`: internal push from runtime (protected by `x-internal-secret`).
- Added `apps/web/src/app/proofs/page.tsx`: ISR 30s (`export const revalidate = 30`), server components `ContractsTable`, `DemoAgentCard`, `ActivityHeatmap`, `StorageProofsSection`, client islands `ReceiptsFeed` (auto-refresh 10s) and `NetworkToggle` from `_client.tsx`.
- Deviation: `@apogee/billing` not added as dependency to `apps/web` — `ReceiptIndexRow` type redefined locally in `apps/web/src/app/proofs/_client.tsx`. Tags in heartbeats.ts are plain strings (not `bytes4` keccak values) because `ReceiptMinter` handles the bytes4 conversion internally. `ethers` not imported in runtime — `createHash('sha256')` from `node:crypto` used for short hashes instead.
- Verification: `pnpm typecheck` (22/22) ✓, `pnpm -F @apogee/edge test` (4/4) ✓ — health endpoint 6ms (< 50ms budget).

## 2026-05-12 — v1.0.0 hackathon submission (Prompt 10)

- Upgraded `packages/storage-client` from `@0glabs/0g-ts-sdk@0.3.3` to `@0gfoundation/0g-ts-sdk@1.2.8` (commit `4fe87e2`). New SDK emits `submit()` selector `0xbc8c11f8` accepted by Aristotle Flow contract; old selector `0xef3e12dc` was rejected. `storage:once` smoke command confirmed working on Aristotle mainnet.
- Added `storageTxHash` field through the full pipeline: `StorageClient.uploadWithFallback()` → `MintReceiptResult` → `ReceiptIndexRow` → `notifyEdge()` → edge `storageProofSample` → web Storage Proofs table.
- Added per-instance serial mint mutex (`mintTail: Promise<unknown>`) in `ReceiptMinter` to prevent signer nonce conflicts when heartbeat worker and reconciler call `mint()` concurrently on the same instance.
- Fixed heartbeat error logging to extract `err.name`, `err.message`, `err.code`, `err.reason`, `err.stack` explicitly (Pino serialises `Error` objects as `{}` without explicit extraction).
- Replaced hardcoded "unavailable" banner in `StorageProofsTab` with a data-driven table. Edge `storageProofSample` filter: `r.storageRoot && !r.storageRoot.startsWith('local://') && r.storageRoot !== r.payloadHash`.
- Created hackathon submission documentation package: `README.md` (bilingual EN + ZH), `docs/REVIEWER.md`, `docs/API.md`, `docs/ARCHITECTURE.md` (Mermaid sequence diagrams), `docs/TUTORIAL.md` (15-min paid translator agent walkthrough), `docs/video-script.md` (3-min demo storyboard), `docs/ADR/0001` through `docs/ADR/0003`, `docs/deck-outline.md` (10-slide pitch deck), `docs/x-posts.md` (3-post launch thread), `docs/diagrams/architecture.svg` (SVG system diagram).
- Chinese README summary (5 paragraphs) flagged for native-speaker review before submission.
- HackQuest submission deadline: 2026-05-16 23:59 UTC+8. ReceiptBook headline contract: `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53`. Submission URL: https://apogeeprotocol.vercel.app.

## 2026-05-10 — Prompt 8 verification + chatbot visibility fix

- All CI gates green: `pnpm -F @apogee/web lint` ✓, `pnpm -F @apogee/web typecheck` ✓, `pnpm -F @apogee/web test` ✓, `pnpm -F @apogee/edge typecheck` ✓, `pnpm -F @apogee/billing typecheck` ✓.
- Bug fixed: Pilot was invisible on the live site for authenticated users on non-app pages (e.g. the landing page). Root cause: root layout rendered `GuestPilot` only when `!isAuthenticated`, but `AuthPilot` in `(app)/layout.tsx` only mounts on dashboard/agents/etc. routes. An authenticated user visiting `/` had no Pilot instance at all.
- Fix: Root layout now unconditionally mounts a single `ApogeePilot` with `isGuest={!isAuthenticated}`. `(app)/layout.tsx` no longer imports or mounts a second Pilot instance. One mount point, zero double-mounting risk, Pilot visible on every page regardless of auth state.
- No bundle regression: landing 98.2 kB, dashboard 180 kB (unchanged).

## 2026-05-14 — Light theme, brand system, logo integration (UI/Brand pass)

- **Shipped**: Full dual-theme system: dark (existing, unchanged) + light (opt-in via sidebar toggle). Token override via `[data-theme="light"]` on `<html>`. Theme persisted in `apogee-theme` httpOnly cookie via server action in `apps/web/src/app/actions/theme.ts`. Anti-FOUC blocking script in root layout detects `prefers-color-scheme` on first visit (no cookie).
- **Token system**: `packages/ui/src/tokens.css` and `apps/web/src/app/globals.css` both define `[data-theme="light"]` block with 15 overridden RGB-channel tokens + rgba border/shadow tokens. Light accent `#1FB89A` chosen for WCAG AA contrast on light surfaces (dark-theme cyan `#4DE3C1` would fail).
- **Logo integration**: `apogee-logo-dark.webp` / `apogee-logo-light.webp` (1023×489) used in Sidebar, Nav, Footer. Both rendered server-side; `.theme-logo-dark` / `.theme-logo-light` CSS classes toggle visibility per `[data-theme]`. Zero hydration mismatch, zero flash.
- **Shell**: `Sidebar.tsx` gets `app-sidebar` class (glass backdrop-filter in light); `Topbar.tsx` gets `app-topbar`; `Nav.tsx` gets `landing-nav`. `ThemeToggle` component placed in sidebar footer with mounted-state pattern.
- **Pilot light mode**: `pilot.module.css` `:global([data-theme="light"])` overrides — white panel with soft shadow, black launcher.
- **Orbital SVG**: All hardcoded hex/rgba stroke/fill replaced with CSS vars (`--orbital-ring-stroke`, `--orbital-node-gradient`, etc.); vars swap per theme.
- **Favicon/icons**: `layout.tsx` metadata now references `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`. `viewport.themeColor` uses dual media-query array.
- **TX hash guard**: already in place via `buildChainscanUrl` + `TX_RE = /^0x[a-fA-F0-9]{64}$/`; verified across `RecentActivity` and `ReceiptsTableClient`.
- **Build**: 26 pages clean, no TS errors. Pre-existing pino-pretty warning (dev-only dep, not related to this change).
- **Deviations**: Local index hide/delete feature scoped as future work — no backend hide endpoint in this pass. Follow-up: wire `/api/agents/[id]/hide` to a "Hide from dashboard" button in agent settings.
