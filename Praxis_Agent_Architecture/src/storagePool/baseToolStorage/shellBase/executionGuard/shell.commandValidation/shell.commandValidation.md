---
description: Classify shell command safety before runtime shell execution.
argument-hint: "command plus optional shell, policy, and context"
---

# shell.commandValidation

## Use This Tool
Use this tool before shell execution to classify a command as allowed, approval-required, or blocked.

## Call Shape
Call `shellCommandValidationHandler.invoke({ input: { command, shell, policy, context } })`.

## Required Inputs
Provide a non-empty `command`.

## Optional Inputs
`workingDirectory`, `shell`, `policy`, `context`, and `preferredProvider`.

## Runtime Behavior
By default this tool returns a dry-run validation envelope and does not execute shell commands.

When `context.dryRun` is `false`, real dispatch requires a non-conflicting affirmative runtime guard (`allowed === true` or `accepted === true`, with neither flag explicitly `false`) plus a runtime shell guard provider, usually `BaseToolExecutorPort.shell.validateCommand`. Missing, malformed, conflicting, or denied governance returns `GOVERNANCE_REJECTED`; missing runtime provider returns `PROVIDER_UNAVAILABLE`.

The verdict is a validation signal, not execution approval. `finalApprovalGranted` is always `false`; runtime/TAP owns final approval.

Provider results are treated as runtime judgment material, not as a replacement request. The provider receives the normalized command envelope, and the baseTool keeps `command`, `shell`, `kind`, `unsafeSideEffects`, and approval boundary fields fixed in the returned output.

## Returns
Returns `ShellCommandValidationOutput` with verdict, reasons, required permission, approval signal, `dryRun`, `providerCalled`, `runtimeGuardRequired`, `finalApprovalGranted`, and audit events.

## Example
`{ "command": "echo a && echo b", "shell": "bash" }`

## Avoid
Do not put process execution in this tool. Final approval and host policy remain runtime/TAP owned; this tool only adapts and audits command validation.
