# APOGEE Protocol

> The autonomous-agent runtime layer for 0G: smart accounts, programmable policy, identity, payments, receipts, encrypted memory, and paid skills.

APOGEE gives developers building autonomous agents on 0G a Stripe + AWS + Linear-quality runtime for money, memory, identity, billing, and proof.

## Architecture

Architecture diagram: _placeholder — to be added in `/docs/architecture.md`._

## Quick Start

_Quick Start placeholder — Prompt 2 will add the runtime and API boot flow._

## Contracts

| Contract | Address | Purpose |
| --- | --- | --- |
| PolicyEngine | `0xa8933d96A27BDfFac07C0d7467f3213cb340f550` | Spending and execution policy checks |
| ReceiptBook | `0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53` | On-chain audit log |
| AgentIdentity | `0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3` | ERC-7857 / ERC-8004-style agent identity |
| ServiceRegistry | `0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad` | Agent service marketplace registry |
| PaymentRouter | `0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c` | Quote settlement |
| EscrowVault | `0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767` | Verifiable task escrow |
| AccountFactory | `0xABc44aF98e6d873C0700c9B687fbf3Be560cba90` | CREATE2 account deployer |
| AgentAccount | `0xc18eD4e075a23A66505744A353eeFE91340F924d` | Minimal smart account implementation |
| RevenueSplitter | `0x1E32A89B6815a492Ad30f71a5E35280EF7399b74` | Per-agent revenue distribution |
