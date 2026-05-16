# ADR 0003 — SIWE + httpOnly JWT for Authentication

**Status:** Accepted  
**Date:** 2026-05-10  
**Decider:** Francis Okafor

---

## Context

The Apogee web app needs authentication for protected API routes. Developers
who use Apogee already have Ethereum wallets; requiring a separate email/password
or OAuth flow creates unnecessary friction and ties the product to a Web2
identity provider.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| OAuth (GitHub/Google) | Familiar | Web2 identity; requires OAuth app registration |
| Email + password | Simple | Requires email verification, password storage |
| Wallet-native JWT (custom) | Wallet-native | Non-standard; requires custom signature scheme |
| **SIWE + JWT** | Standard (EIP-4361); wallet-native; no shared secret | Requires nonce management; slightly more complex client flow |

---

## Decision

Implement Sign-In with Ethereum (EIP-4361) + short-lived JWT:

1. Client requests a nonce from `GET /v1/auth/siwe/nonce`
2. Client constructs a SIWE message including the nonce and signs it with wagmi
3. Client POSTs `{ message, signature }` to `POST /v1/auth/siwe/verify`
4. Edge API recovers the signing address, validates the nonce, issues a 24h JWT
5. JWT stored as `httpOnly; SameSite=Lax` cookie named `apogee-jwt`
6. Next.js API routes (`/api/auth/siwe/*`) proxy the SIWE calls server-side so
   the browser never needs to know the Edge API URL (eliminates CORS complexity)

Signature recovery uses `@apogee/chain-client.verifyMessage()` (ethers v6
`verifyMessage`) — no separate SIWE library required.

---

## Consequences

**Positive:**
- Zero Web2 identity dependency
- JWT in httpOnly cookie is immune to XSS-based token theft
- Same-origin proxy means CORS is not needed for auth endpoints
- Works with any EIP-1193 wallet (MetaMask, Rabby, WalletConnect)

**Negative / watch:**
- `apogee-jwt` cookie is `SameSite=Lax` — cross-site embedding would require
  `SameSite=None; Secure`, which is a future consideration
- JWT expiry is 24h; refresh token / silent re-auth not yet implemented
- Nonce store is in-memory (Redis store is a follow-up); single-replica Railway
  deployment means this is safe for now

**Verification:** Live at https://apogeeprotocol.vercel.app — SIWE sign-in confirmed
working on Vercel production with Railway Edge API as of 2026-05-10.
