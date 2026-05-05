---
description: Validate shell execution paths against runtime sandbox policy.
argument-hint: "command, workingDirectory, policy.sandboxRoots, optional requestedPaths/accessIntents"
---

# shell.sandboxEnforcement

## Use This Tool
Use this tool to check whether a shell command stays inside runtime-provided sandbox roots.

## Call Shape
Call `shellSandboxEnforcementHandler.invoke({ input: { command, workingDirectory, requestedPaths, accessIntents, policy, context } })`.

## Required Inputs
Provide `command`, `workingDirectory`, and at least one `policy.sandboxRoots` value.

## Optional Inputs
`requestedPaths`, `accessIntents`, `policy.allowNetwork`, `policy.allowHostEnvironment`, `policy.maxPathCount`, `context`, and `preferredProvider`.

## Runtime Behavior
By default this tool returns a dry-run sandbox decision. It validates scope material and marks write/network/host exposure requests as requiring TAP approval.

When `context.dryRun` is `false`, real dispatch requires a non-conflicting affirmative runtime guard (`allowed === true` or `accepted === true`, with neither flag explicitly `false`) plus a runtime shell guard provider, usually `BaseToolExecutorPort.shell.enforceSandbox`. Missing, malformed, conflicting, or denied governance returns `GOVERNANCE_REJECTED`; missing runtime provider returns `PROVIDER_UNAVAILABLE`.

The decision is a sandbox envelope, not proof that this baseTool created an OS sandbox. `baseToolAppliedSandbox` is always `false`; runtime owns host isolation.

Provider results are treated as runtime judgment material, not as a replacement request. The provider receives normalized `workingDirectory`, `sandboxRoots`, and `requestedPaths`; the baseTool keeps those scope identity fields, `kind`, `unsafeSideEffects`, and sandbox boundary fields fixed in the returned output.

## Returns
Returns `ShellSandboxEnforcementOutput` with sandbox roots, requested paths, access intents, decision, reasons, `dryRun`, `providerCalled`, `runtimeGuardRequired`, `baseToolAppliedSandbox`, and audit events.

## Example
`{ "command": "npm test", "workingDirectory": "/repo/app", "policy": { "sandboxRoots": ["/repo"] } }`

## Avoid
Do not create OS sandboxes or execute shell commands in this tool. Runtime owns host isolation; this tool adapts and audits sandbox enforcement requests.
