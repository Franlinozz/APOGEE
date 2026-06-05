# Apogee Protocol — Pitch Deck Outline

> Convert this outline to slides (Google Slides, Canva, or Pitch.com).
> Target: 10 slides, 3-minute talk track, 5-minute Q&A buffer.
> Design language: dark background, violet accents, monospace code snippets.

---

## Slide 1 — Cover

**Title:** Apogee Protocol  
**Subtitle:** Autonomous Agents. Verifiable Receipts. Built on 0G.  
**Visual:** The ASCII logo from README (white on black), orbital animation still  
**Bottom:** HackQuest × 0G Buildathon 2026 · github.com/Franlinozz/APOGEE

---

## Slide 2 — The Problem

**Headline:** AI agents can't be held accountable.

**Three-column layout:**
```
No Proof           No Billing          No Memory
─────────          ──────────          ─────────
What did the       How do you charge   Where does agent
agent actually     per action with     context live between
do? No record.     fairness proof?     calls? Nowhere.
```

**VO:** "The AI wave is generating billions of agent actions per day. Zero of
them are verifiably on-chain."

---

## Slide 3 — The Solution

**Headline:** Receipt-based accountability for every agent action.

**Visual:** Simple flow diagram (horizontal):
```
Agent executes skill  →  Payload hashed  →  Stored on 0G  →  Minted on-chain
```

**Key line:** "One receipt = one proof that an action happened, exactly as
described, at a specific time, with data anchored to 0G Storage."

---

## Slide 4 — 0G Integration (technical depth)

**Headline:** Built on all four 0G primitives.

**2×2 grid:**

| Primitive | How Apogee uses it |
|---|---|
| **0G Chain** | 9 contracts: AgentIdentity, ReceiptBook, PolicyEngine, PaymentRouter, + 5 more |
| **0G Storage** | Agent memory + media anchored via `@0gfoundation/0g-ts-sdk@1.2.8` |
| **0G Compute** | Chat + image skills route through verifiable 0G compute providers |
| **0G DA** | Planned v2: anchor skill-run proof batches at DA layer cost |

---

## Slide 5 — Architecture

**Headline:** Four layers, nine contracts, three autonomous agents.

**Visual:** Embed `docs/diagrams/architecture.svg` (or screenshot)

**Talk track:** Walk through the diagram top-to-bottom in ~45 seconds.

---

## Slide 6 — Demo: Live /proofs Page

**Headline:** This is running. Right now.

**Visual:** Screenshot of https://apogeeprotocol.vercel.app/proofs with:
- Activity heatmap visible
- One receipt row highlighted
- chainscan.0g.ai open in split view showing the matching tx

**Stats overlay (live values at recording time):**
- Total receipts minted: ___
- 0G Storage roots: ___
- Demo agents running: 3

---

## Slide 7 — Developer Experience

**Headline:** Deploy an agent in 15 minutes.

**Left column — steps:**
1. `git clone` + `pnpm install`
2. Set `DEPLOYER_PRIVATE_KEY`
3. `ts-node mint-agent.ts --name "MyTranslator"`
4. Call `/v1/quote` → pay on-chain → call `/v1/skills/translate/run`
5. Verify receipt on chainscan

**Right column — code snippet:**
```typescript
const result = await fetch('/v1/skills/translate/run', {
  method: 'POST',
  body: JSON.stringify({
    agentId: '44',
    quoteId: 'uuid-abc123',
    input: { text: 'Hello', targetLang: 'Spanish' },
  }),
});
// output.translated === "Hola"
// result.receiptId anchored on 0G Aristotle mainnet
```

---

## Slide 8 — Skills Marketplace

**Headline:** Current post-submission catalog: 25 skills. 15 free. 10 paid via on-chain billing. Submitted build: 22 skills.

**Two-column layout:**

**Free (core):**
`chat.completion` · `chat.embed` · `web.search` · `web.fetch` · `memory.write`
`memory.read` · `memory.search` · `chain.query` · `chain.send` · `storage.upload`
`audio.transcribe` · `image.generate` · `text.keywords` · `text.rewrite` · `text.title`

**Premium (priced in 0G):**
`news.aggregate` (0.0001 0G) · `summarize.long` (0.0002 0G) · `nft.mint` (0.001 0G)
`translate` (0.0001 0G) · `sentiment` · `ocr` · `code.review` · `data.extract`
`voice.clone` · `video.caption`

**Talk track:** "Skills run inside isolated-vm sandboxes. They can only call
capabilities explicitly granted by the agent's PolicyEngine entry."

---

## Slide 9 — Traction & Roadmap

**Headline:** Shipped. On mainnet. Growing.

**Left — what's live:**
- ✓ 9 contracts on Aristotle mainnet
- ✓ 3 autonomous demo agents running
- ✓ Live web app at apogeeprotocol.vercel.app
- ✓ Edge API + WebSocket feed
- ✓ SIWE auth + skill sandbox
- ✓ 0G Storage proofs in /proofs page

**Right — roadmap:**
- Q3 2026: 0G DA integration for batch proof anchoring
- Q3 2026: MetaMask mobile deep-link
- Q4 2026: Skill marketplace open submissions
- Q4 2026: Multi-chain agent identity (via 0G bridge)
- 2027: Agent-to-agent payment channels

---

## Slide 10 — Call to Action

**Headline:** Join the verifiable AI stack.

**Three CTAs:**

```
Try it live           Read the code         Build with us
─────────────         ─────────────         ─────────────
apogeeprotocol.           github.com/           Open an issue,
vercel.app            Franlinozz/           fork the repo,
                      APOGEE                deploy an agent.
```

**Bottom line:** "AI agents need a permanent record. Apogee Protocol provides it."

**Contact:** francisokafor2001@gmail.com

---

## Design Notes

- Font: Geist Sans (headings) + Geist Mono (code); available free on Google Fonts
- Colors: `#0f0f11` background · `#7c3aed` violet accent · `#10b981` green for
  0G Storage · `#f59e0b` amber for 0G Compute
- All screenshots should be taken in Chrome dark mode at 1920×1080
- Slides 4 and 5 are the most technical — offer to skip ahead during a demo
