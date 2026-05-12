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
| Live web app | https://apogee-red.vercel.app |
| /proofs page (live on-chain data) | https://apogee-red.vercel.app/proofs |
| Edge API (health) | https://apogeeedge-production.up.railway.app/health |
| Edge API docs | https://apogeeedge-production.up.railway.app/docs/api |
| GitHub repository | https://github.com/Franlinozz/APOGEE |
| Chainscan explorer | https://chainscan.0g.ai |

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

## 5. 30-Minute Verification Walkthrough

### Step 1 — /proofs page (5 min)

1. Open https://apogee-red.vercel.app/proofs
2. The **On-chain Receipts** tab shows live `ReceiptMinted` events fetched from
   the Edge API which reads from Aristotle mainnet.
3. Click any receipt row's `txHash` link — opens chainscan.0g.ai showing the
   on-chain transaction.
4. The **Storage Proofs** tab shows receipts that include a `storageRoot` from
   0G Storage. Click the `storageTxHash` link to verify the data was anchored.
5. The **Activity Heatmap** shows 14 days × 24 hours of receipt volume.

### Step 2 — Edge API health (2 min)

```bash
curl https://apogeeedge-production.up.railway.app/health | jq .
```

Expected response shape:
```json
{
  "ok": true,
  "uptimeSec": ...,
  "chain": { "aristotle": { "ok": true, "blockNumber": ..., "latencyMs": ... } },
  "lastHeartbeat": { "aurora": "...", "vesper": "...", "helix": "..." }
}
```

### Step 3 — Live receipts via API (3 min)

```bash
curl "https://apogeeedge-production.up.railway.app/v1/proofs" | jq .receipts[0:3]
```

Returns the last 50 on-chain receipts. Verify `txHash` fields on chainscan.

### Step 4 — SIWE sign-in (5 min)

1. Visit https://apogee-red.vercel.app
2. Click **Launch App** → **Connect Wallet**
3. Sign the SIWE message with any Ethereum wallet (no 0G tokens needed for sign-in)
4. You land on the **Dashboard** showing protocol-wide statistics

### Step 5 — Verify 0G Storage integration (5 min)

Vesper's heartbeat uploads data to 0G Storage every 15 minutes. To check:

1. On the /proofs page → **Storage Proofs** tab
2. Each row with a `storageRoot` (hex, not `local://`) represents a successful
   0G Storage upload
3. The `storageTxHash` links to the 0G Storage transaction on chainscan

Alternatively, check the Railway logs:
```
VESPER heartbeat: storage.upload → storageRoot=0x... storageTxHash=0x...
```

### Step 6 — Smart contract read (5 min)

Using cast or any Web3 tool against Aristotle RPC:
```bash
# RPC: https://evmrpc-testnet.0g.ai  chainId: 16661
cast call 0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \
  "totalReceipts()(uint256)" \
  --rpc-url https://evmrpc-testnet.0g.ai
```

Increasing total confirms live heartbeat activity. The counter grows by ~1 every
10 minutes.

### Step 7 — Skill sandbox (optional, 5 min)

The Apogee Pilot chatbot (bottom-right on every page) runs without authentication.
Try: `"What agents are running?"` or `"Explain how receipts work"`

---

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
