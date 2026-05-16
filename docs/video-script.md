# Apogee Protocol — 3-Minute Demo Video Script

**Target length:** 2:45 – 3:00  
**Format:** Screen recording with picture-in-picture narration  
**Tone:** Confident, technical, fast-paced  

---

## Pre-production checklist

- [ ] Browser: Chrome, dark mode, 1920×1080
- [ ] Open tabs: chainscan.0g.ai, apogeeprotocol.vercel.app, Railway logs
- [ ] Wallet: MetaMask connected to Aristotle (chainId 16661)
- [ ] Terminal: `cast` installed, DEPLOYER_KEY exported

---

## Shot List & Script

---

### [0:00 – 0:12] COLD OPEN — hook

**Visual:** Black screen → quick cut to chainscan.0g.ai showing a stream of
incoming transactions on ReceiptBook `0xD0B08...`

**VO:**
> "Every ten minutes, an AI agent writes a tamper-proof receipt onto 0G
> blockchain. No one pressed a button. This is Apogee Protocol."

---

### [0:12 – 0:35] PROBLEM STATEMENT

**Visual:** Slide-style overlay on blurred chainscan background

```
The problem:
  AI agents can lie.
  There's no way to prove what they did,
  when they did it, or what data they used.
```

**VO:**
> "When you deploy an AI agent today, you have to trust it. Trust that it called
> the right API, trust that it stored the right data, trust that it charged you
> fairly. Apogee replaces trust with proof."

---

### [0:35 – 1:05] THE SOLUTION — /proofs PAGE TOUR (30 sec)

**Visual:** Navigate to https://apogeeprotocol.vercel.app/proofs

**Screen actions + VO (combined):**

1. **[0:35]** Page loads — Activity Heatmap visible
   > "This is the Apogee Proofs page. It's live — every row here is a real
   > on-chain transaction."

2. **[0:42]** Click first receipt row — chainscan opens in new tab
   > "Three autonomous demo agents — Aurora, Vesper, and Helix — run continuously
   > on 0G Aristotle mainnet. Aurora pulls news headlines every ten minutes,
   > summarises them with an LLM, and embeds them into 0G distributed memory."

3. **[0:52]** Switch to Storage Proofs tab
   > "Vesper takes Aurora's summaries, generates an image via 0G Compute, and
   > uploads it to 0G decentralised storage. Each upload produces a Merkle root —
   > verifiable by anyone."

4. **[1:00]** Click a storageTxHash link → chainscan 0G Storage tx
   > "That's not a database write. That's an on-chain storage proof."

---

### [1:05 – 1:35] ARCHITECTURE — 30-second technical summary

**Visual:** Show `docs/diagrams/architecture.svg` in browser, then zoom into
the four 0G primitive boxes

**VO:**
> "Apogee integrates all four 0G primitives."
> "**0G Chain** — nine Solidity contracts handle agent identity, policy
> enforcement, payment routing, and receipt storage."
> "**0G Storage** — agent memory and media are stored as Merkle-verified blobs
> via the official 0G TypeScript SDK."
> "**0G Compute** — skills like image generation and chat completion route
> through verifiable 0G compute providers."
> "**0G DA** — slated for v2 to anchor skill run proofs at DA layer cost."

---

### [1:35 – 2:05] DEVELOPER EXPERIENCE — signing in and deploying

**Visual:** Navigate to https://apogeeprotocol.vercel.app → click Launch App

**Screen actions + VO:**

1. **[1:35]** Click "Connect Wallet" — MetaMask SIWE prompt appears
   > "Developers sign in with their Ethereum wallet. No email, no OAuth."

2. **[1:42]** Sign message — dashboard loads
   > "The dashboard shows live agent stats, a receipt heatmap, and protocol
   > revenue — all pulled from Aristotle mainnet in real time."

3. **[1:50]** Click Agents → New Agent → quickly walk through wizard steps
   > "Deploying an agent takes four steps: set a name, fund an account, choose a
   > skill policy, and sign the deploy transaction. The agent gets an on-chain
   > iNFT identity and a smart-contract wallet that enforces its policy."

4. **[2:00]** Open the Pilot chatbot (bottom-right)
   > "The built-in Apogee Pilot answers questions about the protocol directly
   > inside the app — no docs tab needed."

---

### [2:05 – 2:35] RECEIPTS & BILLING — the core innovation

**Visual:** Open Receipts page, then terminal with `cast call`

**Screen actions + VO:**

1. **[2:05]** Receipts page — filter by agentId
   > "Every skill execution produces a receipt: a canonical hash of the input and
   > output, anchored on-chain."

2. **[2:12]** Terminal:
   ```bash
   cast call 0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \
     "totalReceipts()(uint256)" \
     --rpc-url https://evmrpc-testnet.0g.ai
   ```
   > "Here's the on-chain receipt counter — live, growing while we record this."

3. **[2:22]** Show Railway logs — structured Pino log lines for a heartbeat
   > "The runtime worker logs every skill call, storage upload, and on-chain
   > confirmation. When something fails, it retries — and mints an error receipt
   > so the failure itself is on the record."

---

### [2:35 – 2:55] CLOSING — call to action

**Visual:** Slow pull-back to the /proofs page, all three agent cards glowing

**VO:**
> "Apogee Protocol is open source, deployed on Aristotle mainnet, and live
> today. Fork the repo, request faucet tokens, and deploy your first agent in
> fifteen minutes."
>
> "AI agents that leave a trail. Built on 0G."

**Visual:** Fade to black. GitHub URL overlaid: `github.com/Franlinozz/APOGEE`

---

### [2:55 – 3:00] END CARD

```
APOGEE PROTOCOL
github.com/Franlinozz/APOGEE
apogeeprotocol.vercel.app

Built for HackQuest × 0G Buildathon 2026
```

---

## Recording Notes

- Keep the chainscan tab open in background — the live transaction stream
  reinforces that this is real mainnet activity, not a mockup.
- When showing Railway logs, scroll slowly enough that viewers can read a
  single heartbeat entry.
- The `cast call` terminal command should return within ~2s on Aristotle; do a
  dry run before recording.
- Subtitles: export SRT from your screen recorder. English only; Chinese
  subtitles can be added post-edit for the HackQuest bilingual requirement.
