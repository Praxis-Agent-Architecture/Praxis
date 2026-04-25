---
description: Classify a runtime-owned shell execution exit observation.
argument-hint: "{ executionId, exitCode?, signal?, timedOut?, policy?, context? }"
---

# shell.exitCodeChecking

## Use This Tool

Use this tool when runtime already owns a shell execution and Praxis needs a stable classification for its exit code, termination signal, or timeout.

## Call Shape

Call `executeShellExitCodeChecking({ executionId, command?, exitCode?, signal?, timedOut?, policy?, context? })`.

## Required Inputs

- `executionId`: runtime shell execution id.
- Dry-run path requires at least one observation: `exitCode`, `signal`, or `timedOut: true`.

## Optional Inputs

- `command`: display/audit command label.
- `policy.allowedExitCodes`: exit codes that count as allowed failures.
- `policy.treatSignalAsFailure`: when false, a signal is classified as `unknown`.
- `context.guard`: required for `dryRun: false` provider dispatch.

## Runtime Behavior

Dry-run classifies supplied material only and never calls a provider. Real dispatch calls a runtime-provided provider, normally `BaseToolExecutorPort.shell.monitorExecution`, and consumes the runtime envelope fields `observation.exitCode`, `observation.signal`, and `observation.timedOut` when present. Approval, sandbox, process lifecycle, output streams, and session ownership stay in runtime/TAP.

## Returns

Returns status `success`, `allowed-failure`, `failed`, `terminated`, or `unknown`, plus reasons, audit events, and provider metadata.

Public-safe failures include `MISSING_EXIT_OBSERVATION`, `INVALID_EXIT_CODE`, `INVALID_SIGNAL`, `GOVERNANCE_REJECTED`, `PROVIDER_UNAVAILABLE`, and `PROVIDER_REJECTED`. Provider exceptions are mapped to stable public errors without exposing internal stack details.

## Example

```ts
await executeShellExitCodeChecking({
  executionId: "exec-1",
  exitCode: 2,
  policy: { allowedExitCodes: [0, 2] },
});
```

## Avoid

- Do not probe the OS process table here.
- Do not read stdout/stderr or own output stream state here.
- Do not treat `dryRun: false` as approval.
- Do not leak provider internals in public errors.
