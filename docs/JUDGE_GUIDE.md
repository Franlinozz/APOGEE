# Apogee Protocol — Judge Guide

**HackQuest × 0G Buildathon 2026**  
Submission deadline: 2026-05-16 23:59 UTC+8

This guide is written for judges. The 5-minute path below requires only a
browser — no wallet or tokens needed. The full walkthrough takes ≤ 30 minutes.

---

## Quick reference

| What | Where |
|---|---|
| Live web app | https://apogeeprotocol.vercel.app |
| **Live proofs page** | **https://apogeeprotocol.vercel.app/proofs** |
| Edge API health | https://apogeeedge-production.up.railway.app/health |
| Interactive API docs | https://apogeeedge-production.up.railway.app/docs/api |
| GitHub repo | https://github.com/Franlinozz/APOGEE |
| Block explorer | https://chainscan.0g.ai |
| X / Twitter | https://x.com/ApogeeProtocol/status/2055641847821664765?s=20 |
| Demo video | https://youtu.be/3XEJRv1ZkLo?si=8z7QqYZWbrInOmqb |
| Technical write-ups | Engineering deep dive: https://medium.com/@chatwithnonso01/building-an-autonomous-agent-runtime-on-0g-an-engineering-deep-dive-into-apogee-6af3dfedac94<br>Protocol overview: https://medium.com/@chatwithnonso01/apogee-protocol-building-an-autonomous-agent-runtime-on-0g-c5851164f2bd |

---

## 5-minute judge path (browser only)

1. **Landing page** — https://apogeeprotocol.vercel.app  
   Read the hero: autonomous agents, self-custodial wallets, encrypted memory,
   verifiable receipts on 0G Aristotle mainnet.

2. **Proofs page** — https://apogeeprotocol.vercel.app/proofs  
   - Three demo agent cards (Aurora / Vesper / Helix) with receipt counts and
     last-heartbeat timestamps.
   - Scrolling receipt feed that auto-refreshes every 10 seconds.
   - Click any **tx** link in a receipt row → opens `chainscan.0g.ai/tx/<hash>`
     showing the confirmed Aristotle mainnet transaction from `ReceiptBook.emitReceipt()`.
   - Switch to **Storage Proofs** tab → rows with a green `storageRoot` show the
     full round-trip: payload → 0G Storage Merkle root → on-chain receipt anchor.
   - Switch to **Contracts** tab → all 9 deployed addresses with chainscan links.

3. **ReceiptBook on Chainscan** — https://chainscan.0g.ai/address/0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53  
   Events tab → filter `ReceiptMinted`. Counter grows every 10 minutes as
   Aurora's heartbeat fires.

4. **Docs** — https://apogeeprotocol.vercel.app/docs  
   Architecture overview, skill catalog, contract addresses.

5. **Optional** — Connect any Ethereum wallet, sign the SIWE message, explore
   the Dashboard (global stats), Agents (deploy flow), and Marketplace (skill catalog).

---

## Step 1 — Verify the live /proofs page (5 min)

1. Open **https://apogeeprotocol.vercel.app/proofs**

2. **Overview tab** — you will see:
   - Three demo agent cards (Aurora / Vesper / Helix) with "Live" or "Running"
     indicators and receipt counts
   - An activity heatmap for the last 14 days × 24 hours
   - A scrolling receipt feed that auto-refreshes every 10 seconds

3. **Click any receipt row's "tx" link** — it opens
   `chainscan.0g.ai/tx/<hash>` showing the on-chain Aristotle mainnet
   transaction that anchored the receipt via `ReceiptBook.emitReceipt()`.

4. **Storage Proofs tab** — if Vesper's storage heartbeat has run:
   - Rows show a green `storageRoot` (0G Storage Merkle root) alongside the
     `payloadHash`
   - "Storage tx (0G)" column links to the 0G Storage anchoring transaction on
     chainscan

5. **Contracts tab** — lists all 9 deployed contract addresses with direct
   links to chainscan.0g.ai for each.

---

## Step 2 — Verify contract addresses on-chain (5 min)

Click any address in the Contracts tab, or paste into chainscan directly:

| Contract | Address |
|---|---|
| **ReceiptBook** | `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53` |
| AgentIdentity | `0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3` |
| PolicyEngine | `0xa8933d96A27BDfFac07C0d7467f3213cb340f550` |
| PaymentRouter | `0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c` |
| AccountFactory | `0xABc44aF98e6d873C0700c9B687fbf3Be560cba90` |
| ServiceRegistry | `0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad` |
| RevenueSplitter | `0x1E32A89B6815a492Ad30f71a5E35280EF7399b74` |
| EscrowVault | `0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767` |
| AgentAccount | `0xc18eD4e075a23A66505744A353eeFE91340F924d` |

**To verify live receipt activity**, browse `ReceiptMinted` events on ReceiptBook:
`https://chainscan.0g.ai/address/0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53`
→ Events tab → filter by `ReceiptMinted`

The counter grows as demo agents fire heartbeats every 10–30 minutes.

---

## Step 3 — Verify the Edge API health (2 min)

```bash
curl https://apogeeedge-production.up.railway.app/health | jq .
```

Expected response (shape):
```json
{
  "ok": true,
  "uptimeSec": 3600,
  "lastHeartbeat": {
    "aurora": "2026-05-16T10:00:00.000Z",
    "vesper": "2026-05-16T09:55:00.000Z",
    "helix":  "2026-05-16T09:30:00.000Z"
  }
}
```

Timestamps in `lastHeartbeat` confirm the three demo agents are actively running.

---

## Step 4 — Verify storage proof fields (3 min)

On the /proofs Storage Proofs tab, each row with a populated `storageRoot` column
proves the complete round-trip:

```
Payload → keccak256 hash (payloadHash)
       → uploaded to 0G Storage indexer (returns storageRoot + storageTxHash)
       → ReceiptBook.emitReceipt(agentId, payloadHash, storageRoot)
       → confirmed on Aristotle mainnet (txHash)
```

**Verification chain:**
- `payloadHash` — content hash of the action payload; not a chain transaction
- `storageRoot` — 0G Storage Merkle root; not a chain transaction (green text)
- `storageTxHash` — the actual 0G Storage network transaction (links to chainscan)
- `txHash` — the Aristotle EVM transaction minting the receipt (links to chainscan)

---

## Step 5 — Verify demo agent behaviour (5 min)

| Agent | Token ID | Schedule | What it proves |
|---|---|---|---|
| **Aurora** | #1 | Every 10 min | 0G Chain read + memory write + on-chain receipt |
| **Vesper** | #2 | Every 15 min | 0G Storage upload + Merkle root + on-chain receipt |
| **Helix** | #3 | Every 30 min | On-chain data query + LLM summary + memory write + receipt |

On the /proofs Overview tab, each agent card shows:
- `Address` → links to the agent's smart-contract wallet on chainscan
- `Receipts minted` → total on-chain receipt count
- `Last heartbeat` → UTC timestamp of most recent heartbeat

---

## Step 6 — Sign in and explore the app (5 min, optional)

1. Open https://apogeeprotocol.vercel.app and click **Launch App**
2. **Connect Wallet** → sign the SIWE message (any Ethereum wallet, no tokens needed)
3. The **Dashboard** shows protocol-wide statistics, receipt heatmap, and recent
   activity pulled from Aristotle mainnet
4. The **Apogee Pilot** chatbot (bottom-right on every page) answers questions
   about the protocol without needing auth

---

## QA Checklist

| Check | Expected result |
|---|---|
| Wallet sign-in (SIWE) | Signs without error; lands on /dashboard |
| Dashboard loads | Stat tiles, heatmap, recent receipts visible |
| /proofs — Overview | Agent cards show receipt counts; feed scrolling |
| /proofs — Storage Proofs | Rows with green storageRoot values; storageTxHash links resolve |
| /proofs — Contracts | 9 contracts with working chainscan links |
| Receipt tx links | Open chainscan.0g.ai and show confirmed Aristotle tx |
| Storage root visibility | Green hex values in Storage Proofs table (not "—") |
| Runtime health | `/health` returns `lastHeartbeat` with recent timestamps |
| Pilot chatbot | Responds to "What agents are running?" on the landing page |

---

## Known limitations

| Limitation | Impact |
|---|---|
| Demo agents run on fixed 10/15/30-min schedules | Aurora, Vesper, and Helix mint receipts automatically; their heartbeat is the live proof of recurring autonomy |
| User-created agents receive deployment and bootstrap receipts | Full autonomous recurring runtime for arbitrary user agents (session-key/delegation) is roadmap |
| 0G Compute providers on Aristotle are intermittent | `image.generate` and `chat.completion` may return stub output; heartbeat still mints receipt via `safeSkill()` fallback |
| Storage proofs tab may show empty on first load | Vesper runs every 15 min; storageRoot requires a successful 0G upload; auto-reconciler retries every 60s |
| No mobile MetaMask deep-link | Wallet connect requires desktop browser |

---

## User Testing & Feedback

User testing is collected through a public Apogee feedback form. Testers are asked to create a demo agent, submit a dashboard screenshot, and optionally share an X/Twitter post about their experience.

| Resource | Link |
|---|---|
| **Feedback form** | https://docs.google.com/forms/d/e/1FAIpQLSfGZKS0ZliSNTXH0bOpRc7GaILtPjSusiQE_UPvuz_GlhjBMg/viewform?usp=publish-editor |
| **Judge response sheet** | https://docs.google.com/spreadsheets/d/1Zu_tG6afAMV92juF4A7MLaUhYwMQ0OGtUUVBakjnjcw/edit?usp=sharing |

Judges can inspect the live response sheet for raw feedback evidence including dashboard screenshots, agent deployment results, and public X/Twitter feedback links.
