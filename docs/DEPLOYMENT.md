# Apogee Protocol — Deployment Guide

This document describes the three deployed services, their required environment
variables (names only — never commit secrets), and operational procedures.

---

## Services

### 1. Web App (Vercel)

**URL:** https://apogeeprotocol.vercel.app  
**Framework:** Next.js 14.2.x, App Router, standalone output  
**Deploy trigger:** Push to `main` branch

#### Required env vars (Vercel dashboard → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Client-visible Edge API base URL (no trailing slash) |
| `EDGE_API_URL` | Server-side Edge API base URL used by Next.js API proxy routes |
| `NEXT_PUBLIC_CHAIN_ID` | Target chain ID (set to `16661` for Aristotle mainnet) |

#### Notes
- `NEXT_PUBLIC_*` vars are baked at build time; changing them requires a redeploy
- The SIWE auth flow uses same-origin proxy routes (`/api/auth/siwe/*`) that
  call the Edge API server-side, so the browser never needs CORS access to Edge
- ISR pages (`/proofs`, `/dashboard`) revalidate every 30–60 s automatically

---

### 2. Edge API (Railway)

**URL:** https://apogeeedge-production.up.railway.app  
**Framework:** Fastify 5, Node.js 22  
**Deploy trigger:** Push to `main` branch, Railway builds `apps/edge`

#### Required env vars

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL 16 connection string (Railway managed) |
| `REDIS_URL` | Redis 7 connection string (Railway managed) |
| `JWT_SECRET` | HS256 secret for signing user JWTs (≥ 32 chars) |
| `EDGE_SERVICE_PRIVATE_KEY` | Service-account private key for EIP-712 quote signing |
| `INTERNAL_SECRET` | Shared secret for `/internal/*` routes called by Runtime |
| `EDGE_API_URL` | Self-referencing URL (used by health check) |
| `ZERO_G_RPC_URL` | Aristotle mainnet RPC (e.g. `https://evmrpc-testnet.0g.ai`) |
| `ZERO_G_STORAGE_INDEXER_URL` | 0G Storage indexer endpoint |
| `PILOT_LLM_BASE_URL` | Optional — OpenAI-compatible base URL for live Pilot LLM |
| `PILOT_LLM_API_KEY` | Optional — API key for Pilot LLM |
| `PILOT_LLM_MODEL` | Optional — model name (default `gpt-4o-mini`) |

#### Notes
- `DATABASE_URL` and `REDIS_URL` are provisioned automatically by Railway add-ons
- Health endpoint: `GET /health` — returns chain status + lastHeartbeat
- OpenAPI UI: `GET /docs/api` — interactive Swagger documentation

---

### 3. Runtime Workers (Railway)

**Process:** Runs in the same Railway service as Edge API (monorepo, shared deploy)  
**Entry:** `apps/runtime/src/index.ts` via `pnpm -F @apogee/runtime start`

#### Required env vars

| Variable | Purpose |
|---|---|
| `REDIS_URL` | BullMQ queue connection (same as Edge) |
| `ZERO_G_RPC_URL` | Aristotle mainnet RPC |
| `ZERO_G_STORAGE_INDEXER_URL` | 0G Storage indexer for payload uploads |
| `DEPLOYER_PRIVATE_KEY` | Signing key for on-chain receipt minting |
| `RECEIPT_BOOK_ADDRESS` | `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53` |
| `AURORA_AGENT_ID` | Numeric token ID for Aurora (from demo-agents-aristotle.json) |
| `VESPER_AGENT_ID` | Numeric token ID for Vesper |
| `HELIX_AGENT_ID` | Numeric token ID for Helix |
| `HEARTBEATS_PAUSED` | `true` to pause all heartbeat loops; `false` to activate |
| `EDGE_API_URL` | URL of Edge API for `/internal/receipt` push |
| `INTERNAL_SECRET` | Must match Edge API value |
| `RECEIPT_FALLBACK_DIR` | Local path for pending receipts (default `/tmp/receipts`) |

#### Heartbeat pause / unpause

Heartbeats are controlled by `HEARTBEATS_PAUSED` without restarting the service:

- `HEARTBEATS_PAUSED=true` — BullMQ jobs are scheduled but the worker checks
  this variable at execution time and skips the heartbeat body. No receipts are
  minted. Use during maintenance or contract changes.
- `HEARTBEATS_PAUSED=false` (or unset) — heartbeats run normally.

To change the value on Railway:
1. Railway dashboard → Service → Variables → `HEARTBEATS_PAUSED`
2. Update value → Deploy (or use Railway CLI: `railway variables set HEARTBEATS_PAUSED=false`)
3. Verify via `GET /health` → `lastHeartbeat` timestamps begin updating

#### Reconciler

A BullMQ job runs every 60 seconds and retries any receipts that failed their
0G Storage upload and were written to `RECEIPT_FALLBACK_DIR`. On success, the
`storageRoot` is upgraded from `local://` to the real 0G Merkle root.

---

## Network configuration

| Field | Value |
|---|---|
| Network name | 0G Aristotle Mainnet |
| Chain ID | 16661 |
| RPC URL | https://evmrpc-testnet.0g.ai |
| Block explorer | https://chainscan.0g.ai |
| Faucet | https://faucet.0g.ai |
| Native currency | A0GI (0G) |
| 0G Storage indexer | https://indexer-storage-testnet-turbo.0g.ai |

---

## Local development

```bash
# Prerequisites: Node.js ≥ 20, pnpm ≥ 9, PostgreSQL 16, Redis 7

git clone https://github.com/Franlinozz/APOGEE.git
cd APOGEE
pnpm install

cp .env.example .env.local
# Fill in: DEPLOYER_PRIVATE_KEY, DATABASE_URL, REDIS_URL, JWT_SECRET, etc.

pnpm -F @apogee/edge db:push   # Run Prisma migrations

# Start all services in separate terminals
pnpm -F @apogee/edge dev            # http://localhost:8080
HEARTBEATS_PAUSED=true pnpm -F @apogee/runtime dev
pnpm -F @apogee/web dev             # http://localhost:3000
```

### Smoke test commands

```bash
# Test 0G Storage upload
pnpm -F @apogee/runtime storage:once

# Run a single heartbeat cycle for each agent
pnpm -F @apogee/runtime heartbeat:once Aurora
pnpm -F @apogee/runtime heartbeat:once Vesper
pnpm -F @apogee/runtime heartbeat:once Helix
```

---

## CI / Build commands

```bash
pnpm typecheck                    # All packages
pnpm -F @apogee/web build         # Next.js production build
pnpm -F @apogee/edge build        # Fastify production build
pnpm -F @apogee/runtime build     # Runtime production build
pnpm -F @apogee/contracts compile # Hardhat compile
pnpm -F @apogee/contracts test    # Contract unit tests
```

---

## Rollback procedure

1. In Railway, go to the service → Deployments tab
2. Select the last known-good deployment → **Redeploy**
3. No contract changes needed — contracts on Aristotle mainnet are immutable
   once deployed

---

## Monitoring

| Signal | Source |
|---|---|
| Agent heartbeat health | `GET /health` → `lastHeartbeat` |
| Chain connectivity | `GET /health` → `chain.aristotle` |
| Pending/failed receipts | Railway logs: grep `storage upload failed` or `mintErrorReceipt` |
| Storage proof backlog | `RECEIPT_FALLBACK_DIR` file count on Railway volume |
