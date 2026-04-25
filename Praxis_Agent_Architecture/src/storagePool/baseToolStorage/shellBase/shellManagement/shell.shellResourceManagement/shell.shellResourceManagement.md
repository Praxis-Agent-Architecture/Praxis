---
description: Manage shell resource envelopes through runtime-owned providers.
argument-hint: "{ target: { action, resourceKind, resourceId?, amount?, limitName?, limitValue? }, context? }"
---

# shell.shellResourceManagement

## Use This Tool
Use this tool to inspect, reserve, release, or adjust limits for shell resources such as PTYs, process slots, directories, environments, or IO buffers.

## Call Shape
Call the handler with a JSON object containing `target` and optional `context`. Malformed top-level requests such as `null`, arrays, strings, or numbers return `INVALID_REQUEST`. Use `context.dryRun: false` only when runtime governance approves the real resource operation.

## Required Inputs
`target.resourceKind` is required. `adjust-limit` also requires `target.limitName` and `target.limitValue`.

## Optional Inputs
`target.action` defaults to `inspect` when omitted; unsupported actions return `INVALID_ACTION` before provider dispatch. `target.resourceId`, `target.amount`, `context.allowedResourceIds`, `context.grantedPermissions`, and `preferredProvider` are optional.

## Runtime Behavior
Dry-run returns a resource envelope. Real dispatch requires `context.runtimeId`, an affirmative `context.guard`, and a runtime provider. Providers receive the normalized target, not the raw model JSON.

## Verification
Covered by the shellManagement real smoke test, which reserves and releases a PTY resource record through `BaseToolExecutorPort.shell.manageResource`.

## Returns
Returns a public-safe resource-management envelope. Missing providers return `PROVIDER_UNAVAILABLE`; denied guards return `GOVERNANCE_REJECTED`.

## Example
`{ "target": { "action": "reserve", "resourceKind": "pty", "resourceId": "pty-1", "amount": 1 }, "context": { "dryRun": true } }`

## Avoid
Do not allocate resources, change limits, or enforce quotas in baseTool code. Runtime/TAP owns resource policy.
