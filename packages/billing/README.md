# @apogee/billing

Billing owns quote issuance, settlement helpers, and `ReceiptMinter`.

## Receipt storage notes

`ReceiptMinter.mint()` accepts an optional `storageRoot`. Callers that already uploaded their audit payload to 0G Storage should pass this value so the on-chain `ReceiptBook.emitReceipt()` event anchors the real storage root directly.

Pilot chat (`actionTag: PILO`) pre-uploads its final audit payload in `apps/edge/src/index.ts` using the same `StorageClient.uploadBytes()` path used by the Runtime heartbeat stack, then passes the returned root to `ReceiptMinter.mint()`. See `docs/DECISIONS.md` entry `2026-05-18 — PILO receipts: mirror Aurora's storage upload path`.

The local fallback serializer is bigint-safe so payloads containing `bigint` values can still be written and anchored if storage upload fails.
