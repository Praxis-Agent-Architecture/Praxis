---
description: Normalize a runtime-owned shell process status snapshot.
argument-hint: "{ executionId, snapshot?, expectedStatuses?, staleAfterMs?, context? }"
---

# shell.processStatusTracking

## Use This Tool

Use this tool to normalize a shell process snapshot supplied by runtime and compare it with expected process states.

## Call Shape

Call `executeShellProcessStatusTracking({ executionId, command?, snapshot?, expectedStatuses?, staleAfterMs?, context? })`.

## Required Inputs

- `executionId`: runtime shell execution id.
- Dry-run path requires `snapshot`.

## Optional Inputs

- `snapshot.pid`, `snapshot.status`, `snapshot.exitCode`, `snapshot.signal`.
- `snapshot.startedAt`, `snapshot.observedAt`, `snapshot.lastOutputAt`.
- `expectedStatuses`: statuses that should count as expected.
- `staleAfterMs`: marks a runtime snapshot as stale when `observedAt` is older than this limit.
- `context.guard`: required for `dryRun: false` provider dispatch.

## Runtime Behavior

Dry-run normalizes supplied snapshots only and never calls a provider. Real dispatch calls `BaseToolExecutorPort.shell.monitorExecution` or an injected provider, then consumes runtime envelope fields such as `target.processId`, `observation.state`, `observation.exitCode`, `observation.signal`, `observation.startedAtMs`, `observation.observedAtMs`, and `observation.lastActivityAtMs`. Signal-only exited envelopes normalize to `terminated`. Runtime owns process lifecycle, status collection, output stream state, and session/process ownership.

## Returns

Returns normalized status, optional pid/exit/signal/timestamps, `matchesExpectedStatus`, `stale`, audit events, and provider metadata.

Public-safe failures include `MISSING_PROCESS_SNAPSHOT`, `INVALID_PID`, `INVALID_STATUS`, `INVALID_EXIT_CODE`, `INVALID_TIMESTAMP`, `INVALID_STALE_AFTER_MS`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_REJECTED`.

## Example

```ts
await executeShellProcessStatusTracking({
  executionId: "exec-1",
  snapshot: { status: "running", pid: 1234 },
  expectedStatuses: ["running"],
  staleAfterMs: 30000,
});
```

## Avoid

- Do not spawn, stop, or poll processes in this baseTool.
- Do not infer status from host globals.
- Do not own process lifecycle, session state, or output buffers.
- Do not dispatch a provider without a runtime guard.
