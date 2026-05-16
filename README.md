<div align="center">

```
                               █████╗ ██████╗  ██████╗  ██████╗ ███████╗███████╗
                              ██╔══██╗██╔══██╗██╔═══██╗██╔════╝ ██╔════╝██╔════╝
                              ███████║██████╔╝██║   ██║██║  ███╗█████╗  █████╗  
                              ██╔══██║██╔═══╝ ██║   ██║██║   ██║██╔══╝  ██╔══╝  
                              ██║  ██║██║     ╚██████╔╝╚██████╔╝███████╗███████╗
                              ╚═╝  ╚═╝╚═╝      ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
```

# Apogee Protocol

**The autonomous-agent runtime for the 0G blockchain**

*Self-custodial smart wallets · on-chain receipts · encrypted persistent memory · paid skills marketplace · 0G Compute backbone — every agent action verifiable on Aristotle mainnet.*

[![GitHub Stars](https://img.shields.io/github/stars/Franlinozz/APOGEE?style=flat-square&color=7c3aed)](https://github.com/Franlinozz/APOGEE)
[![Live Demo](https://img.shields.io/badge/live-apogeeprotocol.vercel.app-7c3aed?style=flat-square)](https://apogeeprotocol.vercel.app)
[![On-chain Proofs](https://img.shields.io/badge/proofs-aristotle%20mainnet-10b981?style=flat-square)](https://apogeeprotocol.vercel.app/proofs)
[![Demo Video](https://img.shields.io/badge/demo-YouTube-red?style=flat-square&logo=youtube)](https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb)
[![X / Twitter](https://img.shields.io/badge/X-post-000?style=flat-square&logo=x)](https://x.com/ApogeeProtocol/status/2055641847821664765?s=20)
[![Built on 0G](https://img.shields.io/badge/built%20on-0G%20Network-f59e0b?style=flat-square)](https://0g.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[**Live App**](https://apogeeprotocol.vercel.app) · [**On-chain Proofs**](https://apogeeprotocol.vercel.app/proofs) · [**Demo Video**](https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb) · [**X Post**](https://x.com/ApogeeProtocol/status/2055641847821664765?s=20) · [**API Docs**](https://apogeeedge-production.up.railway.app/docs/api) · [**Judge Guide**](docs/JUDGE_GUIDE.md) · [**Tutorial**](docs/TUTORIAL.md)

</div>

---

## 中文简介 *(Chinese Summary)*

> ⚠️ **翻译声明：** 以下中文摘要经过仔细撰写，建议由母语为中文的评审者进行最终审核，以确保表达准确自然。  
> *Translation notice: This section was written with care; a native-speaker review is recommended before final submission.*

**Apogee Protocol** 是基于 **0G（Zero Gravity）区块链**构建的自主人工智能代理运行时层。项目为开发者提供了在 0G 生态系统中构建、部署和商业化自主 AI 代理所需的完整基础设施——包括自托管智能钱包、可编程支出策略、ERC-7857/ERC-8004 链上身份标准，以及通过 0G Storage 实现的加密持久化记忆系统。每一个代理行为都会在链上生成一张可验证的收据，真正做到"每个行动皆有迹可查"。

**核心组件**方面，Apogee 在 Aristotle 主网（链 ID 16661）上部署了 9 个智能合约，涵盖收据记录合约（ReceiptBook）、代理身份合约（AgentIdentity）、支付路由合约（PaymentRouter）、策略引擎（PolicyEngine）和账户工厂（AccountFactory）等。后端由 Fastify 5 构建的边缘 API 和基于 BullMQ 的异步运行时工作器组成，前端则采用 Next.js 14 App Router 实现服务端渲染与流式传输。所有对外数据均经过 Zod 全量验证，代码严格遵循 TypeScript strict 模式。

**0G 网络集成**涵盖三个核心层面：**0G Chain** 用于智能合约部署、代理间支付路由和收据永久锚定；**0G Storage** 用于代理 payload 的 Merkle 树上传、基于 AES-256-GCM 加密的记忆存储与检索，以及 64 MB LRU 内存缓存加速；**0G Compute** 通过 `@0glabs/0g-serving-broker` 作为推理主干，支持聊天补全、向量嵌入、图像生成和语音转文字能力，并自动处理 Provider 确认、ChatID 提取及 `processResponse()` 结算流程。三条网络通路均已在 Aristotle 主网上完成实测验证。

**三位演示代理**——Aurora（新闻分析）、Vesper（创意媒体生成）和 Helix（链上数据分析）——已在 Aristotle 主网上完成部署并每 10 至 30 分钟自动运行一次心跳循环：拉取外部数据、调用相应技能、将 payload 上传至 0G Storage 获取 Merkle 根哈希，最后通过 `ReceiptBook.emitReceipt()` 在主网上铸造收据。所有收据实时可查，访问 [apogeeprotocol.vercel.app/proofs](https://apogeeprotocol.vercel.app/proofs) 即可查看自动刷新的收据流、技能行动标签和链上交易哈希。

**技术栈**严格遵循黑客松要求：TypeScript 5.5（strict 模式）、Solidity 0.8.24（`cancun` EVM 版本）、Prisma 5 + PostgreSQL 16、Redis 7 + BullMQ 5、Pino 9 日志、Zod 4 全量验证、ethers v6（纯服务端）、wagmi 2 + viem 2（浏览器端）。项目托管于 Vercel（前端）和 Railway（边缘 API 与运行时），代码完整开源。

---

## The Problem

Autonomous AI agents need three things to be economically viable: **identity** (who is this agent?), **money** (how does it pay for compute and services?), and **receipts** (how does anyone verify it actually did something?).

Today, builders on 0G who want to deploy an agent face:

- **No standardized smart-wallet layer** — agents can't hold or spend tokens autonomously
- **No on-chain billing primitive** — there's no native way to charge for agent actions or prove they happened
- **No persistent encrypted memory** — agents forget everything between sessions
- **No skills marketplace** — translate, search, mint NFTs, code review all have to be wired from scratch
- **No inference backbone** — every team re-implements their own OpenAI-compatible wrapper on top of 0G Compute

The result: teams spend weeks on plumbing instead of building products. Apogee eliminates that plumbing.

---

## The Solution — Five Pillars

| # | Pillar | What it means |
|---|--------|---------------|
| 1 | **Self-custodial smart wallets** | Every agent gets an `AgentAccount` on 0G Chain with a programmable `PolicyEngine` — spending limits, allowlists, per-action caps, pause flags. No centralized custodian ever touches agent funds. |
| 2 | **On-chain receipts** | Every billable action calls `ReceiptBook.emitReceipt(agentId, actionTag, payloadHash, storageRoot, valueWei)` on Aristotle mainnet. The payload is uploaded to 0G Storage first; its Merkle root is the permanent anchor. |
| 3 | **Encrypted persistent memory** | Agent memories are AES-256-GCM encrypted, stored as Merkle blobs on 0G Storage, and indexed on-chain. The decryption key is derived from the agent's signer — no third party can read it. |
| 4 | **Paid skills marketplace** | 22 skills (12 free core + 10 premium) run in `isolated-vm` sandboxes. Premium skills charge $0G per call through `PaymentRouter`. `RevenueSplitter` enables creator royalties. |
| 5 | **0G Compute backbone** | `chat.completion`, `chat.embed`, `image.generate`, and `audio.transcribe` route through `@0glabs/0g-serving-broker`. Provider acknowledgement, ChatID extraction from response headers, and `processResponse()` settlement happen automatically. |

---

## What works today

- Wallet connect and wallet ownership/signature flow for sign-in and deployment authorization where enabled.
- Agent deployment through the web app.
- On-chain `AgentIdentity` indexing for agents visible to Apogee.
- `ReceiptBook` receipts and a receipts explorer with safe Chainscan links only for real transaction hashes.
- Global dashboard metrics for Aristotle network agents, active runtime/demo agents, receipts, and indexed volume.
- Marketplace skill catalog and services catalog.
- System/bootstrap memory for newly deployed agents.
- Selected skills attached to new deployments.
- Demo runtime receipts from scheduled heartbeat agents.
- `/proofs` page for live receipt/proof visibility, payload hashes, and optional 0G Storage roots.

## Roadmap / not yet fully automated

- Full autonomous recurring runtime scheduling for arbitrary user-created agents.
- Session-key/delegation flow for user agents.
- True paid marketplace install/purchase flow.
- On-chain policy editing UI.
- Revenue split UI actions.
- Richer memory writes beyond bootstrap for arbitrary newly-created agents.

---

## Architecture

![Apogee Protocol Architecture](docs/diagrams/architecture.svg)

**Request flow:**

```
Developer  →  Web App (Next.js 14 / Vercel)
           →  Edge API (Fastify 5 / Railway)   ← SIWE auth, quotes, billing, WS
           →  Runtime (BullMQ workers / Railway) ← skill sandbox, heartbeats
           →  0G Chain (Aristotle mainnet)       ← ReceiptBook, PaymentRouter
           →  0G Storage (Aristotle mainnet)     ← payload upload, memory blobs
           →  0G Compute (0g-serving-broker)     ← inference, embeddings
```

Full sequence diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 0G Integrations

| Component | Role | Mainnet Address | Explorer |
|-----------|------|----------------|----------|
| **ReceiptBook** | On-chain receipt anchor | `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53) |
| **AgentIdentity** | ERC-7857 agent iNFT | `0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3) |
| **PaymentRouter** | Agent-to-agent payments | `0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c) |
| **PolicyEngine** | Spending policy enforcement | `0xa8933d96A27BDfFac07C0d7467f3213cb340f550` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xa8933d96A27BDfFac07C0d7467f3213cb340f550) |
| **AccountFactory** | Smart wallet factory | `0xABc44aF98e6d873C0700c9B687fbf3Be560cba90` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xABc44aF98e6d873C0700c9B687fbf3Be560cba90) |
| **ServiceRegistry** | Agent service listing | `0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad) |
| **RevenueSplitter** | Creator royalty splits | `0x1E32A89B6815a492Ad30f71a5E35280EF7399b74` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0x1E32A89B6815a492Ad30f71a5E35280EF7399b74) |
| **EscrowVault** | Deferred payment escrow | `0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767) |
| **AgentAccount** | Smart wallet implementation | `0xc18eD4e075a23A66505744A353eeFE91340F924d` | [chainscan.0g.ai](https://chainscan.0g.ai/address/0xc18eD4e075a23A66505744A353eeFE91340F924d) |
| **0G Storage** | Payload + memory blobs | `indexer-storage-turbo.0g.ai` | Aristotle chainId 16661 |
| **0G Compute** | Inference backbone | `@0glabs/0g-serving-broker 0.6.5` | TEE-attested providers |

---

## Quickstart

### Prerequisites

- Node.js 20.18.x LTS, pnpm 9.12.x
- 0G-compatible wallet + testnet tokens from [faucet.0g.ai](https://faucet.0g.ai)
- PostgreSQL 16 and Redis 7

### Clone and install

```bash
git clone https://github.com/Franlinozz/APOGEE.git
cd APOGEE
pnpm install
```

### Configure environment

```bash
cp .env.example .env
# Fill required values — minimum set below
```

```env
DEPLOYER_PRIVATE_KEY=0x...           # Wallet funded with testnet 0G
EDGE_SERVICE_PRIVATE_KEY=0x...       # Service-account signing key
DATABASE_URL=postgresql://user:pass@localhost:5432/apogee
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32-char-random-string>
EDGE_JWT_SECRET=<32-char-random-string>
ZERO_G_GALILEO_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_STORAGE_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
```

### Database

```bash
pnpm -F @apogee/edge db:push
```

### Run locally

```bash
# Terminal 1 — Edge API
pnpm -F @apogee/edge dev

# Terminal 2 — Runtime workers
pnpm -F @apogee/runtime dev

# Terminal 3 — Web app (http://localhost:3000)
pnpm -F @apogee/web dev
```

### Deploy to Galileo testnet

```bash
pnpm -F @apogee/contracts deploy:galileo
pnpm -F @apogee/contracts seed:agents --testnet
```

### Smoke tests

```bash
pnpm -F @apogee/runtime storage:once          # Verify 0G Storage upload
pnpm -F @apogee/runtime heartbeat:once aurora # Run one Aurora heartbeat
pnpm -F @apogee/runtime heartbeat:once vesper
pnpm -F @apogee/runtime heartbeat:once helix
```

Full deployment guide: [docs/REVIEWER.md](docs/REVIEWER.md)

---

## Demo Agents

Three agents are live on Aristotle mainnet. Receipts are visible at [apogeeprotocol.vercel.app/proofs](https://apogeeprotocol.vercel.app/proofs) with auto-refresh.

| Agent | Token ID | Address | Heartbeat | Primary Skills |
|-------|----------|---------|-----------|----------------|
| **Aurora** ☀️ | #1 | [`0x8AD1Ef…a34`](https://chainscan.0g.ai/address/0x8AD1Ef8a59554E5537631BfBa9a655A88A803a34) | 10 min | `web.search` → `summarize.long` → `memory.write` |
| **Vesper** 🌙 | #2 | [`0x4d1d3E…f90`](https://chainscan.0g.ai/address/0x4d1d3E14913C050dF9fD68aFaB90D04079C37f90) | 15 min | `image.generate` → `storage.upload` → `nft.mint` |
| **Helix** 🧬 | #3 | [`0x62283f…f00`](https://chainscan.0g.ai/address/0x62283f2064bA32c9797C5c1D7d5F6942229FAf00) | 30 min | `chain.query` → `chat.completion` → `memory.write` |

---

## Skills Catalog

### Free Core Skills (12)

| Skill | Description |
|-------|-------------|
| `chat.completion` | Chat inference via 0G Compute — OpenAI-compatible |
| `chat.embed` | Text embeddings for semantic search |
| `image.generate` | Image generation via 0G Compute |
| `audio.transcribe` | Speech-to-text transcription |
| `web.search` | Web search via Tavily API |
| `web.fetch` | HTTP fetch with egress allowlist enforcement |
| `memory.write` | Encrypt and write agent memory to 0G Storage |
| `memory.read` | Decrypt and read agent memory from 0G Storage |
| `memory.search` | Semantic search over agent memory index |
| `chain.query` | Read-only EVM contract calls |
| `chain.send` | Send EVM transactions via agent smart wallet |
| `storage.upload` | Upload arbitrary bytes or text to 0G Storage |

### Premium Skills (10) — billed per call in $0G

| Skill | Price | Description |
|-------|-------|-------------|
| `translate.text` | 0.0006 0G | Translate text to/from 50 languages via 0G Compute |
| `news.aggregate` | 0.0005 0G | RSS and news API aggregation with categorization |
| `data.clean` | 0.0007 0G | Normalize CSV/JSON datasets with quality report |
| `defi.snapshot` | 0.0008 0G | Multi-chain DeFi portfolio snapshot |
| `summarize.long` | 0.0009 0G | Recursive map-reduce summary for long documents |
| `social.post` | 0.001 0G | Post to X/Twitter with OAuth tokens |
| `analytics.report` | 0.0014 0G | Generate Vega-Lite chart specs from any dataset |
| `pdf.extract` | 0.0012 0G | Extract text from PDFs with OCR fallback |
| `code.review` | 0.0015 0G | Structured code review findings via 0G Compute |
| `nft.mint` | 0.002 0G | Mint ERC-721 with metadata stored on 0G Storage |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/JUDGE_GUIDE.md](docs/JUDGE_GUIDE.md) | **Judges' guide** — QA checklist, step-by-step verification, known limitations |
| [docs/REVIEWER.md](docs/REVIEWER.md) | Extended reviewer guide — scoring criteria, 30-min walkthrough, test wallet |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Railway setup, env var names, heartbeat pause/unpause |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System + sequence diagrams, ADR index |
| [docs/API.md](docs/API.md) | REST + WebSocket API reference |
| [docs/TUTORIAL.md](docs/TUTORIAL.md) | Build a paid translator agent in 15 minutes |
| [docs/video-script.md](docs/video-script.md) | 3-minute demo video script and storyboard |
| [Live Swagger UI](https://apogeeedge-production.up.railway.app/docs/api) | Interactive API explorer (OpenAPI 3.1) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision log (all 10 prompts) |

---

## License

MIT © 2026 Francis Okafor — [github.com/Franlinozz/APOGEE](https://github.com/Franlinozz/APOGEE)

**Contact:** Open an issue or follow [@apogeeprotocol](https://x.com/apogeeprotocol) on X.  
**Demo video:** [youtu.be/3XEJRv1ZkLo](https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb)  
**X post:** [x.com/ApogeeProtocol/status/2055641847821664765](https://x.com/ApogeeProtocol/status/2055641847821664765?s=20)  
**Hackathon:** [0G Hackathon on HackQuest](https://hackquest.io) · Submitted 2026-05-16
