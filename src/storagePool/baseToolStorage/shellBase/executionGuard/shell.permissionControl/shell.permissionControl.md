---
description: Resolve shell execution permissions against runtime governance material.
argument-hint: "command, requestedPermissions, optional workingDirectory/riskLevel/context"
---

# shell.permissionControl

## Use This Tool
Use this tool to decide whether a shell command has the permissions needed before any execution request is made.

## Call Shape
Call `shellPermissionControlHandler.invoke({ input: { command, requestedPermissions, riskLevel, context } })`.

## Required Inputs
Provide a non-empty `command` and at least one `requestedPermissions` value.

## Optional Inputs
`workingDirectory`, `riskLevel`, `context`, and `preferredProvider`.

## Runtime Behavior
By default this tool returns a dry-run permission decision. It checks granted permissions, scope material, and high-risk approval material.

When `context.dryRun` is `false`, real dispatch requires a non-conflicting affirmative runtime guard (`allowed === true` or `accepted === true`, with neither flag explicitly `false`) plus a runtime shell guard provider, usually `BaseToolExecutorPort.shell.controlPermission`. Missing, malformed, conflicting, or denied governance returns `GOVERNANCE_REJECTED`; missing runtime provider returns `PROVIDER_UNAVAILABLE`.

The decision is a permission-control envelope, not final execution authorization. `finalAuthorizationGranted` is always `false`; runtime/TAP owns final authorization and policy persistence.

Provider results are treated as runtime judgment material, not as a replacement request. The provider receives normalized `command`, `workingDirectory`, and `requestedPermissions`; the baseTool keeps those identity fields, `kind`, `unsafeSideEffects`, and final authorization fields fixed in the returned output.

## Returns
Returns `ShellPermissionControlOutput` with granted/missing permissions, decision, approval id, `dryRun`, `providerCalled`, `runtimeGuardRequired`, `finalAuthorizationGranted`, and audit events.

## Example
`{ "command": "npm test", "requestedPermissions": ["shell:validate", "shell:execute"] }`

## Avoid
Do not mutate permission state or execute the command in this tool. Runtime/TAP owns final approval and policy persistence.
