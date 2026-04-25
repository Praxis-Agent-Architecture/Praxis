---
description: Manage shell lifecycle envelopes through runtime-owned providers.
argument-hint: "{ target: { action, sessionId?, shellType?, workingDirectory?, idleTimeoutMs? }, context? }"
---

# shell.shellLifecycleManagement

## Use This Tool
Use this tool to ask the runtime to create, attach, suspend, resume, or close a shell lifecycle handle.

## Call Shape
Call the handler with a JSON object containing `target` and optional `context`. Malformed top-level requests such as `null`, arrays, strings, or numbers return `INVALID_REQUEST`. Set `context.dryRun: false` only when runtime governance has already approved the real lifecycle action.

## Required Inputs
`target.action` is required. Existing-session actions require `target.sessionId`.

## Optional Inputs
`target.shellType`, `target.workingDirectory`, `target.idleTimeoutMs`, `context.allowedSessionIds`, `context.allowedWorkingDirectories`, `context.grantedPermissions`, `context.approval`, and `preferredProvider` are optional. `context.approval` is audit metadata only; TAP/runtime owns approval policy.

## Runtime Behavior
Dry-run returns a lifecycle plan and never changes a shell session. Real dispatch requires `context.runtimeId`, `context.guard.allowed === true` or `context.guard.accepted === true`, and an injected/runtime provider. Providers receive a normalized target; baseTools do not add a second action-specific approval gate.

## Verification
Covered by the shellManagement real smoke test, which creates a runtime-owned Node shell process through the registry and exercises create, suspend, resume, and close through `BaseToolExecutorPort.shell.manageLifecycle`.

## Returns
Returns a public-safe plan or provider-backed lifecycle envelope. Missing providers return `PROVIDER_UNAVAILABLE`; denied guards return `GOVERNANCE_REJECTED`.

## Example
`{ "target": { "action": "create", "shellType": "zsh", "workingDirectory": "/tmp/project" }, "context": { "dryRun": true } }`

## Avoid
Do not use this tool to bypass TAP approval, own PTY handles inside baseTools, or silently close sessions without runtime governance.
