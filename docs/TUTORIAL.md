# Build a Paid Translator Agent in 15 Minutes

This tutorial walks you through deploying a real, fee-charging AI agent on
Apogee Protocol. When you finish, you will have:

- An on-chain **AgentIdentity** (iNFT) on 0G Aristotle mainnet
- A **PolicyEngine** entry that authorises the `chat.completion` skill
- A working `/translate` endpoint that charges callers 0.0001 0G per request
- An on-chain receipt for every translation, with payload stored on 0G Storage

**Time:** ~15 minutes  
**Prerequisites:** Node.js ≥ 20, a funded Aristotle wallet (≥ 0.1 0G)

---

## Step 0 — Get 0G tokens

If you don't have an Aristotle wallet yet:

1. Add the network to MetaMask:
   - **RPC**: `https://evmrpc-testnet.0g.ai`
   - **Chain ID**: `16661`
   - **Symbol**: `A0GI`
2. Visit https://faucet.0g.ai and request tokens

---

## Step 1 — Clone and install

```bash
git clone https://github.com/Franlinozz/APOGEE.git
cd APOGEE
pnpm install
```

---

## Step 2 — Configure environment

Copy the example env file and fill in your private key:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Your funded Aristotle wallet
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Aristotle mainnet
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16661

# 0G Storage
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-standard.0g.ai

# Contract addresses (Aristotle mainnet — already deployed)
AGENT_IDENTITY_ADDRESS=0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3
ACCOUNT_FACTORY_ADDRESS=0xABc44aF98e6d873C0700c9B687fbf3Be560cba90
POLICY_ENGINE_ADDRESS=0xa8933d96A27BDfFac07C0d7467f3213cb340f550
RECEIPT_BOOK_ADDRESS=0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53
PAYMENT_ROUTER_ADDRESS=0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c
```

---

## Step 3 — Mint your agent iNFT

Run the seed script to deploy an AgentAccount and mint an iNFT in one step:

```bash
pnpm -F @apogee/contracts ts-node scripts/mint-agent.ts \
  --name "MyTranslator" \
  --metadata '{"description":"Translates text via 0G Compute","skills":["chat.completion"]}'
```

Expected output:
```
Deploying AgentAccount proxy...
  tx: 0xabc...  confirmed in block 12345
Minting iNFT...
  agentId: 44
  accountAddress: 0xDef...
  tx: 0xghi...  confirmed in block 12346
✓ Agent "MyTranslator" deployed. tokenId=44
```

Save your `agentId` (e.g. `44`).

---

## Step 4 — Register a policy

Policies control which skills an agent can call. Create a policy that allows
only `chat.completion`:

```bash
pnpm -F @apogee/contracts ts-node scripts/set-policy.ts \
  --agentId 44 \
  --skills chat.completion \
  --maxFeeWei 100000000000000
```

The script:
1. Computes the Merkle `allowlistRoot` over the approved skill IDs
2. Calls `PolicyEngine.setPolicy(agentId, allowlistRoot, maxFeeWei)`
3. Prints the policy version number

---

## Step 5 — Write the skill handler

Create `skills/custom/translate/handler.ts`:

```typescript
import type { SkillContext } from '@apogee/skills-runtime';

export default async function translate(
  input: { text: string; targetLang: string },
  ctx: SkillContext,
): Promise<{ translated: string }> {
  const { text, targetLang } = input;

  const result = await ctx.call('chat.completion', {
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate to ${targetLang}. Reply with only the translated text.`,
      },
      { role: 'user', content: text },
    ],
  });

  return { translated: String(result.choices[0].message.content) };
}
```

Create `skills/custom/translate/manifest.ts`:

```typescript
import type { SkillManifest } from '@apogee/skills-runtime';

export const manifest: SkillManifest = {
  skillId: 'translate',
  version: '1.0.0',
  tier: 'premium',
  priceWei: 100_000_000_000_000n,   // 0.0001 0G per call
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', maxLength: 2000 },
      targetLang: { type: 'string', maxLength: 20 },
    },
    required: ['text', 'targetLang'],
  },
  outputSchema: {
    type: 'object',
    properties: { translated: { type: 'string' } },
    required: ['translated'],
  },
  capabilities: ['chat'],
  timeout: 30_000,
};
```

---

## Step 6 — Register the skill with your agent

```bash
pnpm -F @apogee/skills-runtime ts-node scripts/register-skill.ts \
  --agentId 44 \
  --skillId translate \
  --path skills/custom/translate
```

---

## Step 7 — Run a local Edge + Runtime

```bash
# Terminal 1 — Edge API
pnpm -F @apogee/edge dev

# Terminal 2 — Runtime (with heartbeats disabled for now)
HEARTBEATS_PAUSED=true pnpm -F @apogee/runtime dev
```

---

## Step 8 — Request a quote

```bash
curl -X POST http://localhost:8080/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "44",
    "skillId": "translate",
    "input": { "text": "Hello world", "targetLang": "Spanish" }
  }'
```

Response:
```json
{
  "quoteId": "uuid-abc123",
  "priceWei": "100000000000000",
  "expiresAt": "2026-05-12T10:05:00.000Z",
  "signature": "0x...",
  "paymentAddress": "0x..."
}
```

---

## Step 9 — Pay and execute

Use the `paySignedQuote` on PaymentRouter to pay the quote, then call the
skill via the Edge API:

```bash
# Pay on-chain (using cast)
cast send 0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c \
  "paySignedQuote((string,string,string,uint256,uint256),(uint8,bytes32,bytes32))" \
  "($QUOTE_TUPLE)" "($SIG_TUPLE)" \
  --value 100000000000000 \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key $YOUR_KEY

# Execute skill (requires JWT)
curl -X POST http://localhost:8080/v1/skills/translate/run \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "44",
    "quoteId": "uuid-abc123",
    "input": { "text": "Hello world", "targetLang": "Spanish" }
  }'
```

Response:
```json
{
  "output": { "translated": "Hola mundo" },
  "receiptId": "0x...",
  "txHash": "0x..."
}
```

---

## Step 10 — Verify the receipt on-chain

```bash
# View receipt on chainscan
open "https://chainscan.0g.ai/tx/$TX_HASH"

# Or read directly from ReceiptBook
cast call 0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53 \
  "getReceipt(bytes32)(address,bytes32,bytes32,uint256)" \
  "$RECEIPT_ID" \
  --rpc-url https://evmrpc-testnet.0g.ai
```

The receipt proves:
- **Who** performed the action (agentId 44)
- **What** they did (payload hash)
- **Where** the data lives (storageRoot on 0G Storage)
- **When** it happened (block timestamp)

---

## What's Next

| Idea | Guide |
|---|---|
| Add streaming output to your skill | See `useSSE.ts` pattern in `apps/web` |
| Schedule automatic skill runs | See heartbeats.ts — add your agent to the BullMQ queue |
| Share your skill in the marketplace | Call `ServiceRegistry.register(...)` |
| Add memory: store every translation | Use `memory.write` skill in your handler |

---

## Troubleshooting

**"ACCOUNT_FACTORY_ADDRESS not set"**  
→ Check your `.env.local` file. The address is in the table at Step 2.

**"insufficient funds"**  
→ Your wallet needs ≥ 0.1 0G. Visit https://faucet.0g.ai.

**"Policy validation failed"**  
→ The skill ID in your policy allowlist must match exactly. Re-run Step 4.

**Storage upload times out**  
→ The Aristotle indexer can take 30–120s on first upload. The reconciler
retries automatically every 60s. Check `/health` for `lastHeartbeat` timestamps.
