# Decisions

## 2026-05-08 — Prompt 1 complete
- Deployed and verified all 9 Prompt 1 contracts on 0G Galileo testnet; `packages/contracts/deployments/galileo.json` contains addresses, tx hashes, block numbers, and `verified: true` for each entry.
- Contract addresses: PolicyEngine=0xa8933d96A27BDfFac07C0d7467f3213cb340f550; ReceiptBook=0xD0B08e262D27aFE3C01ED849Cf155D33b95bff53; AgentIdentity=0xC6060a0f261cc50B903E37fA7d1E923bfAf08ff3; ServiceRegistry=0x47438d9169FD5dCC0C5DA06511b7F61Fb6BdD5Ad; RevenueSplitter=0x1E32A89B6815a492Ad30f71a5E35280EF7399b74; PaymentRouter=0xDafcdb130596cd0cD555F722c8a8547ccE2B4D0c; EscrowVault=0x3c0879852e8956cfFCD8C9a2fa8b078b06DB2767; AccountFactory=0xABc44aF98e6d873C0700c9B687fbf3Be560cba90; AgentAccount=0xc18eD4e075a23A66505744A353eeFE91340F924d.
- Verification gates: `pnpm install`, `pnpm -F @apogee/contracts compile`, `pnpm -F @apogee/contracts test`, and coverage all passed; coverage report is 84% branch overall.
- Gas snapshot: local Hardhat gas reporter output from `pnpm -F @apogee/contracts test` / `coverage` in this run.
- Deviation: `RevenueSplitter` is deployed before `PaymentRouter` because `PaymentRouter` requires its address in the constructor; no mainnet deployment was performed.
