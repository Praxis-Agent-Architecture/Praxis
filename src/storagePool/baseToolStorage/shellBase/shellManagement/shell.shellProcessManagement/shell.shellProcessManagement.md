---
description: Manage shell process envelopes through runtime-owned providers.
argument-hint: "{ target: { action, sessionId?, processId?, signal?, priority?, reason? }, context? }"
---

# shell.shellProcessManagement

## Use This Tool
Use this tool to inspect, signal, reap, or reprioritize shell-managed processes through the runtime.

## Call Shape
Call the handler with a JSON object containing `target` and optional `context`. Malformed top-level requests such as `null`, arrays, strings, or numbers return `INVALID_REQUEST`. Use `context.dryRun: false` only after runtime governance approves real process management.

## Required Inputs
`target.action` is required. Most actions require `target.sessionId` or `target.processId`. `signal` requires `target.signal`; `prioritize` requires `target.priority`.

## Optional Inputs
`target.reason`, `context.allowedSessionIds`, `context.allowedProcessIds`, `context.grantedPermissions`, `context.approval`, and `preferredProvider` are optional. `context.approval` is audit metadata only; TAP/runtime owns approval policy.

## Runtime Behavior
Dry-run returns an audited process-management plan. Real dispatch requires `context.runtimeId`, an affirmative `context.guard`, and a runtime provider. Providers receive a normalized target; baseTools do not add a second action-specific approval gate.

## Verification
Covered by the shellManagement real smoke test, which inspects, prioritizes, and sends `SIGTERM` to a real runtime-owned Node shell process through `BaseToolExecutorPort.shell.manageProcess`.

## Returns
Returns a public-safe process-management envelope. Missing providers return `PROVIDER_UNAVAILABLE`; provider failures return `PROVIDER_REJECTED`.

## Example
`{ "target": { "action": "signal", "processId": 1234, "signal": "SIGTERM" }, "context": { "dryRun": true } }`

## Avoid
Do not send signals, reap processes, or adjust priority from baseTools directly. Runtime/TAP owns those side effects.
