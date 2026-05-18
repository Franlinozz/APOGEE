# Apogee Edge API Reference

Base URL (production): `https://apogeeedge-production.up.railway.app`

Interactive docs (Swagger UI): `GET /docs/api`

---

## Authentication

### SIWE (Sign-In with Ethereum)

Apogee uses [Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361) for
authentication. On success, a short-lived JWT is issued as an httpOnly cookie.

```
POST /v1/auth/siwe/nonce
POST /v1/auth/siwe/verify
```

All protected routes require the `apogee-jwt` cookie **or** a `Bearer <token>`
header.

#### Flow

```
Client                        Edge API
  |                              |
  |--- GET /v1/auth/siwe/nonce ->|
  |<-- { nonce: "abc123..." } ---|
  |                              |
  | (user signs SIWE message)    |
  |                              |
  |-- POST /v1/auth/siwe/verify->|
  |   { message, signature }     |
  |<-- 200 { token, address } ---|
  |   Set-Cookie: apogee-jwt=... |
```

#### POST /v1/auth/siwe/nonce

Returns a one-time nonce for inclusion in the SIWE message.

**Response 200**
```json
{ "nonce": "dKj9mPqR..." }
```

#### POST /v1/auth/siwe/verify

**Request body**
```json
{
  "message": "<EIP-4361 SIWE message string>",
  "signature": "0x..."
}
```

**Response 200**
```json
{
  "token": "<JWT>",
  "address": "0xabc..."
}
```

**Response 401** — signature invalid or nonce mismatch

---

## Public Endpoints

No authentication required.

### GET /health

Returns service health, chain connectivity, and last heartbeat timestamps.

**Response 200**
```json
{
  "ok": true,
  "uptimeSec": 3600,
  "chain": {
    "aristotle": {
      "ok": true,
      "blockNumber": 123456,
      "latencyMs": 42
    }
  },
  "lastHeartbeat": {
    "aurora": "2026-05-12T10:00:00.000Z",
    "vesper": "2026-05-12T09:55:00.000Z",
    "helix": "2026-05-12T09:30:00.000Z"
  }
}
```

### GET /v1/proofs

Public ISR endpoint. Returns on-chain receipt data, demo agent state, and
storage proof samples. Used by `apps/web/proofs` page (30s ISR).

**Response 200**
```json
{
  "receipts": [
    {
      "receiptId": "0x...",
      "agentId": "aurora",
      "actionTag": "agent.heartbeat.analyze",
      "payloadHash": "0x...",
      "storageRoot": "0x...",
      "txHash": "0x...",
      "status": "confirmed",
      "createdAt": "2026-05-12T10:00:00.000Z"
    }
  ],
  "storageProofSample": [
    {
      "receiptId": "0x...",
      "agentId": "vesper",
      "actionTag": "agent.heartbeat.media",
      "payloadHash": "0x...",
      "storageRoot": "0x...",
      "storageTxHash": "0x...",
      "txHash": "0x...",
      "status": "confirmed",
      "createdAt": "2026-05-12T09:55:00.000Z"
    }
  ],
  "heatmap": [
    { "date": "2026-05-12", "hour": 10, "count": 3 }
  ],
  "demoAgents": [
    {
      "name": "Aurora",
      "tokenId": "1",
      "lastHeartbeat": "2026-05-12T10:00:00.000Z",
      "receiptCount": 144
    }
  ]
}
```

### GET /v1/services

List registered skill services.

**Response 200**
```json
{
  "services": [
    {
      "serviceId": "vesper.media",
      "name": "Vesper Media Service",
      "owner": "0x...",
      "priceWei": "200000000000000",
      "skills": ["image.generate", "storage.upload"]
    }
  ]
}
```

### POST /v1/quote

Request a payment quote for a skill run. No auth required; the quote is EIP-712
signed by the Edge service account.

**Request body**
```json
{
  "agentId": "42",
  "skillId": "image.generate",
  "input": { "prompt": "...", "size": "512x512" }
}
```

**Response 200**
```json
{
  "quoteId": "uuid-...",
  "agentId": "42",
  "skillId": "image.generate",
  "priceWei": "50000000000000",
  "expiresAt": "2026-05-12T10:05:00.000Z",
  "signature": "0x...",
  "paymentAddress": "0x..."
}
```

---

## Protected Endpoints

Require `apogee-jwt` cookie or `Authorization: Bearer <token>` header.

### Agents

#### GET /v1/agents

List agents owned by the authenticated address.

**Query params**
- `page` (default 1), `limit` (default 20, max 100)

**Response 200**
```json
{
  "agents": [
    {
      "agentId": "42",
      "name": "My Translator",
      "owner": "0x...",
      "policy": { "allowlistRoot": "0x..." },
      "createdAt": "2026-05-12T09:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1
}
```

#### POST /v1/agents

Deploy a new agent (mints iNFT via AgentIdentity contract).

**Request body**
```json
{
  "name": "My Agent",
  "metadataUri": "ipfs://..."
}
```

**Response 201**
```json
{
  "agentId": "43",
  "txHash": "0x...",
  "accountAddress": "0x..."
}
```

#### GET /v1/agents/:agentId

Get agent detail including recent receipts and memory summary.

#### DELETE /v1/agents/:agentId

Revoke agent iNFT (owner only).

---

### Receipts

#### GET /v1/receipts

List receipts for the authenticated owner's agents.

**Query params**
- `agentId`, `page`, `limit`, `from`, `to` (ISO dates), `status`

**Response 200**
```json
{
  "receipts": [ { ...ReceiptIndexRow } ],
  "total": 42,
  "page": 1
}
```

#### GET /v1/receipts/:receiptId

Single receipt detail.

---

### Memory

#### GET /v1/memory/:agentId

List memory entries for an agent.

**Response 200**
```json
{
  "entries": [
    {
      "key": "aurora/news/1715500800000",
      "tags": ["news", "heartbeat"],
      "storedAt": "2026-05-12T10:00:00.000Z",
      "storageRoot": "0x..."
    }
  ]
}
```

#### GET /v1/memory/:agentId/:key

Read a single memory entry (decrypts on-demand).

#### POST /v1/memory/:agentId/search

Semantic search over an agent's memory.

**Request body**
```json
{ "query": "latest blockchain news", "limit": 5 }
```

**Response 200**
```json
{
  "results": [
    { "key": "...", "score": 0.94, "value": { ... } }
  ]
}
```

#### DELETE /v1/memory/:agentId/:key

Delete a memory entry.

---

### Skills

#### GET /v1/skills

List available marketplace skills with pricing and verified-live metadata. Results are ordered by `live` first, then skill id.

**Response 200**
```json
[
  {
    "id": "chat.completion",
    "name": "Chat Completion",
    "version": "1.0.0",
    "description": "LLM chat via 0G Compute",
    "category": "AI",
    "tier": "free",
    "pricePerCallWei": "0",
    "tags": ["ai", "compute"],
    "live": false
  }
]
```

#### POST /v1/skills/:skillId/invoke

Invoke a live 0G Compute-backed skill. The compute response is returned immediately; receipt minting happens asynchronously and failures are logged without poisoning the user response.

Supported live skill ids: `chat.completion`, `text.summarize`, `text.translate`, `text.sentiment`, `text.entities`, `code.review`.

**Request body examples**
```json
{ "text": "Apogee makes AI work verifiable.", "maxWords": 20 }
```

```json
{ "code": "function add(a,b){return a-b}", "language": "JavaScript" }
```

**Response 200**
```json
{
  "skillId": "text.summarize",
  "output": { "summary": "Apogee makes AI work verifiable." },
  "compute": { "chatId": "...", "model": "...", "provider": "0g" },
  "latencyMs": 1234
}
```

---

### Billing

#### POST /v1/settle

Settle a previously issued quote.

**Request body**
```json
{
  "quoteId": "uuid-...",
  "txHash": "0x..."
}
```

#### POST /v1/refund

Request a refund for a failed skill run.

**Request body**
```json
{ "receiptId": "0x...", "reason": "skill_timeout" }
```

---

## WebSocket

### WS /v1/ws

Real-time receipt events. Authenticate by passing the JWT as a query param:
`wss://apogeeedge-production.up.railway.app/v1/ws?token=<jwt>`

**Incoming event shape**
```json
{
  "type": "receipt",
  "data": {
    "receiptId": "0x...",
    "agentId": "aurora",
    "actionTag": "agent.heartbeat.analyze",
    "txHash": "0x...",
    "status": "confirmed",
    "createdAt": "2026-05-12T10:00:00.000Z"
  }
}
```

### SSE /v1/pilot/chat

Server-sent events for Apogee Pilot chat streaming.

**Request** `POST /v1/pilot/chat`
```json
{
  "messages": [{ "role": "user", "content": "What agents are running?" }]
}
```

**Event stream**
```
event: token
data: {"text": "Currently"}

event: token
data: {"text": " three"}

event: done
data: {"receiptId": "0x..."}
```

---

## Rate Limits

| Route group | Limit |
|---|---|
| POST /v1/auth/siwe/* | 10 req / 5 min per IP |
| GET /v1/proofs, /health | 120 req / min per IP |
| POST /v1/quote | 30 req / min per IP |
| POST /v1/pilot/chat (guest) | 5 req / 10 min per IP |
| Authenticated routes | 200 req / min per JWT |

All limits return `HTTP 429` with `Retry-After` header on breach.

---

## Error Format (RFC 7807)

```json
{
  "type": "https://apogee.dev/errors/not-found",
  "title": "Agent not found",
  "status": 404,
  "detail": "No agent with id 99 owned by 0xabc...",
  "instance": "/v1/agents/99"
}
```

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-05-16 | Initial hackathon release |
