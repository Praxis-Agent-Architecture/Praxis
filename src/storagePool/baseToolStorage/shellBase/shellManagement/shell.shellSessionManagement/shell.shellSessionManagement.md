---
description: Manage shell session envelopes through runtime-owned providers.
argument-hint: "{ target: { action, sessionId?, sessionName?, shellType?, workingDirectory?, reason? }, context? }"
---

# shell.shellSessionManagement

## Use This Tool
Use this tool to inspect, create, attach, detach, or close runtime-owned shell sessions.

## Call Shape
Call the handler with a JSON object containing `target` and optional `context`. Malformed top-level requests such as `null`, arrays, strings, or numbers return `INVALID_REQUEST`. Use `context.dryRun: false` only after runtime governance approves real session management.

## Required Inputs
Existing-session actions require `target.sessionId`. `create` may omit it because the runtime owns the actual session handle.

## Optional Inputs
`target.action` defaults to `inspect` when omitted; unsupported actions return `INVALID_ACTION` before provider dispatch. `target.sessionName`, `target.shellType`, `target.workingDirectory`, `target.reason`, `context.allowedSessionIds`, `context.grantedPermissions`, and `preferredProvider` are optional.

## Runtime Behavior
Dry-run returns a session envelope and keeps runtime state unchanged. Real dispatch requires `context.runtimeId`, an affirmative `context.guard`, and a runtime provider. Providers receive the normalized target, not the raw model JSON.

## Verification
Covered by the shellManagement real smoke test, which inspects, detaches, and attaches a real runtime-owned shell session through `BaseToolExecutorPort.shell.manageSession`.

## Returns
Returns a public-safe session-management envelope. Missing providers return `PROVIDER_UNAVAILABLE`; provider failures return `PROVIDER_REJECTED`.

## Example
`{ "target": { "action": "attach", "sessionId": "shell-1" }, "context": { "dryRun": true } }`

## Avoid
Do not own shell session state or attachment policy in baseTools. Runtime/TAP owns session handles and cleanup.
