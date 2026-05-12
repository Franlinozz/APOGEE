# ADR 0001 — Migrate to @0gfoundation/0g-ts-sdk

**Status:** Accepted  
**Date:** 2026-05-12  
**Decider:** Francis Okafor

---

## Context

`packages/storage-client` originally wrapped `@0glabs/0g-ts-sdk@0.3.3`. On
2026-05-12, storage uploads to Aristotle mainnet began failing with:

```
Error: cannot estimate gas; transaction may fail
  code: UNPREDICTABLE_GAS_LIMIT
  reason: execution reverted
```

Investigation showed the Flow contract on Aristotle (deployed 2026-04-28)
expects the `submit()` ABI selector `0xbc8c11f8` — the new
`Submission{SubmissionData data, address submitter}` struct signature. The old
SDK emits selector `0xef3e12dc` which the Aristotle contract rejects.

0G Foundation published `@0gfoundation/0g-ts-sdk@1.2.8` as the official
replacement SDK targeting the Aristotle contract ABI.

---

## Decision

Replace `@0glabs/0g-ts-sdk@0.3.3` with `@0gfoundation/0g-ts-sdk@1.2.8` in
`packages/storage-client/package.json`. Update the import path accordingly.

Add explicit null-checks for `tree.rootHash()` since the new SDK can return
`null` when the Merkle tree is empty. Add union-type narrowing for the `upload()`
return type.

---

## Consequences

**Positive:**
- Storage uploads succeed on Aristotle mainnet
- The new SDK is officially maintained by 0G Foundation
- `storageTxHash` is now accessible via the upload result

**Negative / watch:**
- The `@0gfoundation` package is on npm but the import path
  changes from `@0glabs/0g-ts-sdk` to `@0gfoundation/0g-ts-sdk`
- If 0G Foundation releases a breaking 1.3.x change, we must re-test

**Verification:** `pnpm -F @apogee/storage-client build` passes; `storage:once`
smoke command confirms upload + Merkle root on Aristotle.
