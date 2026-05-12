# ADR 0002 — BullMQ for Repeatable Heartbeat Jobs

**Status:** Accepted  
**Date:** 2026-05-10  
**Decider:** Francis Okafor

---

## Context

Three autonomous demo agents (Aurora, Vesper, Helix) need to execute skill
chains on fixed intervals (10/15/30 minutes) continuously, survive process
restarts, and never fire twice concurrently.

Options considered:

| Option | Pros | Cons |
|---|---|---|
| `setInterval` in Node.js | Simple | Lost on restart; no persistence; no concurrency guard |
| Node-cron (`node-cron`) | Familiar CRON syntax | In-process only; no job queue; harder to pause/resume |
| BullMQ repeatable jobs | Redis-backed persistence; repeatable with `every` ms; `concurrency: 1` worker | Requires Redis; slightly more complex setup |
| External CRON (Railway Cron) | Fully external | Adds infrastructure; no built-in concurrency lock per agent |

---

## Decision

Use BullMQ `queue.add(name, data, { repeat: { every: ms } })` with a dedicated
`Worker` at `concurrency: 1`. Clear stale repeatable job entries on startup so
job data is always fresh.

Three queues/workers in a single process:
- `heartbeats` queue — all three agents use the same queue, differentiated by
  `job.data.agentName`
- `heartbeat:aurora` — `every: 600_000` ms
- `heartbeat:vesper` — `every: 900_000` ms
- `heartbeat:helix` — `every: 1_800_000` ms

Pause/resume is controlled by `HEARTBEATS_PAUSED=true` env var checked at job
execution time (not schedule time) to avoid queue state mutations.

---

## Consequences

**Positive:**
- Jobs survive Railway restarts because BullMQ job state lives in Redis
- `concurrency: 1` ensures the same agent never runs two heartbeats at once
- `scheduleHeartbeats()` clears stale entries on startup — safe to deploy without
  manual queue cleanup

**Negative / watch:**
- Redis is a hard dependency; if Railway Redis is unavailable the workers fail
  to start
- BullMQ repeatable jobs accumulate in Redis if `removeOnComplete`/`removeOnFail`
  are not set (they are: 50/20)

**Verification:** `pnpm -F @apogee/runtime test` confirms worker registration;
`pnpm -F @apogee/runtime heartbeat:once Aurora` smoke command runs one Aurora
cycle without error.
