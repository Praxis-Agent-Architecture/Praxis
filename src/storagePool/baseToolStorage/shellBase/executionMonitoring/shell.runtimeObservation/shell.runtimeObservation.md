---
description: Summarize runtime-owned shell execution events.
argument-hint: "{ executionId, events?, maxEvents?, context? }"
---

# shell.runtimeObservation

## Use This Tool

Use this tool to summarize runtime-supplied shell lifecycle/output events into an operational status.

## Call Shape

Call `executeShellRuntimeObservation({ executionId, command?, events?, maxEvents?, context? })`.

## Required Inputs

- `executionId`: runtime shell execution id.
- Dry-run path requires at least one event.

## Optional Inputs

- `events[].type`, `events[].observedAt`, `events[].severity`.
- `maxEvents`: upper bound for retained/summarized events.
- `context.guard`: required for `dryRun: false` provider dispatch.

## Runtime Behavior

Dry-run summarizes supplied events only and never calls a provider. Real dispatch calls `BaseToolExecutorPort.shell.monitorExecution` or an injected provider, then consumes runtime-provided `events[]` or derives observation events from a runtime envelope such as `observation.state`, `observation.stdout`, `observation.stderr`, `observation.stdoutBytes`, `observation.stderrBytes`, and `observation.exitCode`. Runtime owns event streams, output buffers, process lifecycle, and session state. Malformed runtime observation fields are returned as stable public-safe errors instead of being silently ignored.

## Returns

Returns status `quiet`, `active`, `warning`, or `errored`, severity counts, retained event identities, audit events, and provider metadata.

Public-safe failures include `MISSING_EVENTS`, `INVALID_EVENT`, `INVALID_RUNTIME_OBSERVATION`, `INVALID_SEVERITY`, `INVALID_TIMESTAMP`, `EVENT_LIMIT_EXCEEDED`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_REJECTED`.

## Example

```ts
await executeShellRuntimeObservation({
  executionId: "exec-1",
  events: [{ type: "stdout", severity: "debug" }],
});
```

## Avoid

- Do not read live streams directly from baseTools.
- Do not substitute output capture policy here.
- Do not own process lifecycle or output stream state.
- Do not dispatch a provider without a runtime guard.
