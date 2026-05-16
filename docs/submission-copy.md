# Apogee Protocol — HackQuest Submission Copy

**HackQuest × 0G Buildathon 2026**

---

## Short project description (≤ 30 words)

Apogee Protocol is an autonomous-agent runtime on 0G Aristotle mainnet — giving AI agents self-custodial wallets, encrypted memory, programmable spending policies, agent-to-agent payments, and verifiable on-chain receipts for every action.

---

## HackQuest intro text (≤ 200 characters)

> Apogee gives autonomous AI agents on 0G wallets, encrypted memory, programmable spending policies, agent-to-agent payments, marketplace skills, and verifiable on-chain receipts.

**Character count:** 174 ✓

---

## Recommended sectors

- AI
- Infra
- DeFi
- Other

---

## Recommended tech tags

React, Next.js, Web3, Ethers, Node.js, Solidity, TypeScript, 0G

---

## Primary contract (ReceiptBook)

**Address:** `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53`  
**Explorer:** https://chainscan.0g.ai/address/0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53  
**Chain:** Aristotle mainnet · chainId 16661

---

## All deployed contracts

| Contract | Address |
|---|---|
| ReceiptBook | `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53` |
| AgentIdentity | `0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3` |
| PolicyEngine | `0xa8933d96A27BDfFac07C0d7467f3213cb340f550` |
| PaymentRouter | `0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c` |
| AccountFactory | `0xABc44aF98e6d873C0700c9B687fbf3Be560cba90` |
| ServiceRegistry | `0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad` |
| RevenueSplitter | `0x1E32A89B6815a492Ad30f71a5E35280EF7399b74` |
| EscrowVault | `0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767` |
| AgentAccount | `0xc18eD4e075a23A66505744A353eeFE91340F924d` |

---

## Links

| Field | URL |
|---|---|
| **MVP / Live App** | https://apogeeprotocol.vercel.app/ |
| **Proof page** | https://apogeeprotocol.vercel.app/proofs |
| **GitHub** | https://github.com/Franlinozz/APOGEE |
| **X / Twitter** | https://x.com/ApogeeProtocol/status/2055641847821664765?s=20 |
| **Demo video** | https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb |
| **X announcement post** | https://x.com/ApogeeProtocol/status/2055641847821664765?s=20 |

---

## What's live today

- Three demo agents (Aurora / Vesper / Helix) mint receipts on Aristotle mainnet every 10–30 minutes autonomously via `ReceiptBook.emitReceipt()`
- 9 Solidity contracts deployed on Aristotle mainnet (chainId 16661)
- Full Next.js 14 web app with SIWE auth, dashboard, agents, receipts, proofs, marketplace, and docs
- Fastify edge API with Redis-backed receipt index and BullMQ heartbeat workers
- 22 skills (12 free core + 10 premium) running in isolated-vm sandboxes
- 0G Storage integration via `@0gfoundation/0g-ts-sdk` — Merkle-verified payload blobs
- 0G Compute integration via `@0glabs/0g-serving-broker` — chat, embed, image, transcription

## What is roadmap

- Full autonomous recurring runtime for arbitrary user-created agents (requires session-key/delegation flow)
- Paid third-party skill marketplace purchase flow
- On-chain policy editing UI
- Revenue split UI actions
- 0G DA layer integration for proof anchoring at DA cost

---

## Judge quick-start (2 steps, browser only)

1. https://apogeeprotocol.vercel.app/proofs — see live receipts minted by Aurora, Vesper, Helix
2. Click any **tx** link → chainscan.0g.ai confirms the on-chain Aristotle transaction

Full judge guide: [docs/JUDGE_GUIDE.md](JUDGE_GUIDE.md)
