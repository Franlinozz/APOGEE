# Apogee Protocol — Reviewer / Judge Guide

> **HackQuest 0G Buildathon submission** · Deadline 2026-05-16 23:59 UTC+8
>
> This document is written for hackathon judges who need to verify the submission
> end-to-end in under 30 minutes. Every live URL, contract address, and smoke-test
> command is provided here.

---

## 1. What is Apogee?

Apogee Protocol is an **autonomous-agent infrastructure layer** built on 0G
blockchain. It lets developers deploy AI agents that:

- Execute skill workflows (chat, vision, search, memory, storage) in isolated sandboxes
- Record every action as a tamper-proof **receipt** on 0G Aristotle mainnet
- Manage pay-per-use billing through nine on-chain smart contracts
- Store long-term memory and media on 0G distributed storage

The project integrates **all four 0G primitives**: EVM contracts (0G Chain),
decentralised data (0G Storage via `@0gfoundation/0g-ts-sdk`), verifiable
compute (0G Compute via `@0glabs/0g-serving-broker`), and native token payments.

---

## 2. Quick Links

| Resource | URL |
|---|---|
| Live web app | https://apogeeprotocol.vercel.app |
| /proofs page (live on-chain data) | https://apogeeprotocol.vercel.app/proofs |
| Edge API (health) | https://apogeeedge-production.up.railway.app/health |
| Edge API docs | https://apogeeedge-production.up.railway.app/docs/api |
| GitHub repository | https://github.com/Franlinozz/APOGEE |
| Chainscan explorer | https://chainscan.0g.ai |
| X / Twitter | https://x.com/ApogeeProtocol/status/2055641847821664765?s=20 |
| Demo video | https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb |
| Technical write-up | https://medium.com/@chatwithnonso01/building-an-autonomous-agent-runtime-on-0g-an-engineering-deep-dive-into-apogee-6af3dfedac94 |

---

## 3. Deployed Contracts (Aristotle Mainnet — chainId 16661)

All nine contracts are live and verified on Aristotle mainnet.

| Contract | Address |
|---|---|
| AgentIdentity (iNFT registry) | `0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3` |
| PolicyEngine | `0xa8933d96A27BDfFac07C0d7467f3213cb340f550` |
| **ReceiptBook** (headline contract) | **`0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53`** |
| ServiceRegistry | `0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad` |
| RevenueSplitter | `0x1E32A89B6815a492Ad30f71a5E35280EF7399b74` |
| PaymentRouter | `0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c` |
| EscrowVault | `0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767` |
| AccountFactory | `0xABc44aF98e6d873C0700c9B687fbf3Be560cba90` |
| AgentAccount (implementation) | `0xc18eD4e075a23A66505744A353eeFE91340F924d` |

Verify any contract at: `https://chainscan.0g.ai/address/<address>`

The ReceiptBook is the single source of truth for all agent actions. Browse its
`ReceiptMinted` events to see real-time heartbeat activity from Aurora, Vesper,
and Helix agents.

---

## 4. Demo Agents

Three autonomous agents run continuously on Aristotle mainnet:

| Agent | Token ID | Schedule | Action |
|---|---|---|---|
| **Aurora** | #1 | Every 10 min | Pull news → summarise → embed → write to 0G memory → receipt |
| **Vesper** | #2 | Every 15 min | Search Aurora's memory → generate image → upload to 0G Storage → receipt |
| **Helix** | #3 | Every 30 min | Query on-chain receipts → LLM report → memory write → receipt |

All three agents mint receipts via `ReceiptBook.mint()` on Aristotle. Filter
`ReceiptMinted` events by `agentId` 1, 2, or 3 to see individual heartbeat history.

---

## 5-minute walkthrough

1. **Open the landing page** — https://apogeeprotocol.vercel.app
   - Apogee is the runtime layer for autonomous agents on 0G / Aristotle.
   - The core promise is self-custodial wallets, encrypted memory infrastructure, and verifiable receipts for agent actions.

2. **Connect wallet**
   - Wallet connection proves ownership of the workspace being viewed.
   - Signing may be required for dashboard/session flows and for deploy authorization; sign-in does not require spending funds.

3. **Open Dashboard**
   - **Network Agents** = indexed `AgentIdentity` records / deployed agents visible to Apogee.
   - **Runtime Active** = agents with recent runtime or demo heartbeat activity.
   - **Network Receipts** = indexed `ReceiptBook` receipt activity.
   - **Network Volume** = cumulative 0G value recorded by indexed receipts.
   - Dashboard totals are global Aristotle network activity. The Agents page focuses on the connected wallet where applicable.

4. **Open Receipts**
   - Click a real transaction hash and confirm it opens on `chainscan.0g.ai`.
   - Some rows may represent local deployment/lifecycle records without a transaction hash. Transaction links should only exist when a real `0x` transaction hash exists.

5. **Deploy a fresh agent**
   - Choose 1–2 skills and complete the wallet authorization/signature flow.
   - Expected result within about 60 seconds: the agent appears in `/agents`; status becomes initialized, ready, or bootstrapped depending on the current UI label; Activity shows deployment/bootstrap events where implemented; Memory shows `system/init` bootstrap memory; Skills shows the selected skills.
   - Receipt rows link to Chainscan only when a real transaction hash exists.

6. **Open Marketplace**
   - The Skills tab shows the skill catalog and the Services tab shows available service listings.
   - Current install/selection is part of deployment/configuration. A full paid third-party marketplace purchase flow is roadmap.

7. **Open `/proofs`**
   - The page explains `ReceiptBook`, payload hashes, optional 0G Storage roots, and the autonomous proof loop.
   - Demo agents generate recurring heartbeat/proof activity that can be verified through indexed receipts and Chainscan links.

## Current production truth

- Demo agents 1–3 run scheduled heartbeat/demo tasks.
- User-deployed agents currently get deployment/bootstrap receipts immediately.
- User-deployed agents can show bootstrap memory and selected skills.
- Full autonomous recurring runtime for arbitrary newly-created user agents requires session-key/delegation support and is roadmap.
- Paid third-party marketplace install flow is roadmap.
- On-chain policy editing and revenue-split actions are roadmap unless explicitly shown as implemented in the UI.

## 30-Minute Verification Walkthrough

### Step 1 — /proofs page (5 min)

1. Open https://apogeeprotocol.vercel.app/proofs
2. The **On-chain Receipts** tab shows indexed receipt events fetched from the Edge API which reads from Aristotle mainnet and local lifecycle records.
3. Click any real `txHash` link — it opens chainscan.0g.ai showing the on-chain transaction.
4. The **Storage Proofs** tab shows receipts that include a `storageRoot` from 0G Storage where available.
5. The **Activity Heatmap** shows recent receipt volume.

### Step 2 — Edge API health (2 min)

```bash
curl https://apogeeedge-production.up.railway.app/v1/health | jq .
```

Expected response includes `ok: true` plus chain/indexer/runtime health fields when available.

### Step 3 — Live receipts via API (3 min)

```bash
curl "https://apogeeedge-production.up.railway.app/v1/receipts?scope=global&limit=3" | jq .items
```

Returns indexed receipts. Verify any populated `txHash` on chainscan.

### Step 4 — SIWE sign-in (5 min)

1. Visit https://apogeeprotocol.vercel.app
2. Click **Launch App** → **Connect Wallet**
3. Sign the SIWE message with any Ethereum wallet. No 0G token spend is required for sign-in.
4. You land on the **Dashboard** showing global Aristotle network statistics.

### Step 5 — Verify 0G Storage integration (5 min)

1. On `/proofs`, open **Storage Proofs**.
2. Rows with a real hex `storageRoot` represent 0G Storage-backed payload roots.
3. Rows with local/bootstrap-only records are lifecycle records and should not show fake transaction links.

### Step 6 — Smart contract read (5 min)

Using cast or any Web3 tool against Aristotle RPC:
```bash
# RPC: https://evmrpc-testnet.0g.ai  chainId: 16661
cast call 0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \
  "totalReceipts()(uint256)" \
  --rpc-url https://evmrpc-testnet.0g.ai
```

Increasing totals confirm live receipt activity from the demo/runtime loop.

### Step 7 — Skill sandbox (optional, 5 min)

The Apogee Pilot chatbot (bottom-right on public pages) runs without authentication.
Try: `What agents are running?` or `Explain how receipts work`.

## 6. Repository Structure

```
APOGEE/
├── apps/
│   ├── web/          Next.js 14 frontend (Vercel)
│   ├── edge/         Fastify API + WS (Railway)
│   └── runtime/      BullMQ heartbeat workers (Railway)
├── packages/
│   ├── contracts/    9 Solidity contracts + deploy scripts
│   ├── billing/      ReceiptMinter, QuoteIssuer, SettlementHandler
│   ├── chain-client/ ethers v6 wrapper for 0G Chain
│   ├── storage-client/ @0gfoundation/0g-ts-sdk wrapper
│   ├── compute-client/ @0glabs/0g-serving-broker wrapper
│   ├── memory/       Encrypted agent memory on 0G Storage
│   ├── skills-runtime/ isolated-vm skill execution engine
│   └── ui/           Design system (14 components)
└── skills/
    ├── core/         12 free skills
    └── premium/      10 paid skills
```

---

## 7. Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| 0G Compute provider availability on Aristotle is intermittent | `image.generate` and `chat.completion` skills fall back to stub output when no provider is available | Skills use `safeSkill()` wrapper — heartbeat continues; receipt still minted |
| Heartbeat rate throttled by `HEARTBEATS_PAUSED` env var | If set to `true` on Railway, no new heartbeats fire | Check `/health` → `lastHeartbeat` timestamps |
| Storage upload can lag 30–120s on first attempt due to Aristotle indexer propagation | Vesper receipts may show `local://` fallback storageRoot | Auto-reconciler retries every 60s and upgrades the root |
| No MetaMask deep-link on mobile | Wallet connect works only in desktop browser | Planned for post-hackathon |
| Pilot LLM responses are simulated | `PILOT_LLM_BASE_URL` not set in production Railway service | Simulation returns context-aware canned responses |

---

## 8. Test Wallet

A funded test wallet is available for judges who want to deploy an agent or pay
for a skill call:

- **Network**: Aristotle mainnet (chainId 16661)
- **RPC**: https://evmrpc-testnet.0g.ai
- **Faucet**: https://faucet.0g.ai

The faucet issues 1 0G per request — sufficient to deploy an AgentAccount
(~0.01 0G gas) and run several skill calls.

---

## 9. Scoring Criteria Mapping

| HackQuest Criterion | Apogee Evidence |
|---|---|
| **0G Chain integration** | 9 deployed contracts; ChainClient wraps ethers v6; `ReceiptBook` stores all agent actions on-chain |
| **0G Storage integration** | `@0gfoundation/0g-ts-sdk@1.2.8`; Vesper uploads media; `storageTxHash` visible in /proofs |
| **0G Compute integration** | `@0glabs/0g-serving-broker`; `chat.completion` and `image.generate` route through 0G Compute providers |
| **Originality** | First autonomous-agent runtime with receipt-based accountability on 0G |
| **Technical depth** | isolated-vm sandboxes, EIP-712 billing, serial mint mutex, BullMQ repeatable jobs |
| **UX / Demo quality** | Live /proofs page, floating Pilot chatbot, SIWE auth, responsive design |
| **Documentation** | README (bilingual), API.md, ARCHITECTURE.md, TUTORIAL.md, this file |

---

*Questions? Open an issue at https://github.com/Franlinozz/APOGEE/issues*
