---
description: Classify a generated shell command before invocation construction.
argument-hint: "generatedCommand or command plus argv"
---

# shell.executionGuard

## Use This Tool
Use this tool to produce guard material for a generated command before creating an invocation envelope.

## Call Shape
Call through the baseTool registry or handler:

```ts
shellExecutionGuardHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: { generatedCommand, command, argv, workingDirectory, policy, context },
});
```

## Required Inputs
Provide `generatedCommand` or a non-empty `command`.

## Optional Inputs
`argv`, `workingDirectory`, `policy`, and `context`.

## Runtime Behavior
Default `dryRun` classifies command material with the deterministic core and does not call a provider. `context.dryRun: false` is only a request for runtime-backed guard generation; it still does not approve, sandbox, sudo, or execute shell. Provider-backed generation requires an affirmative runtime guard plus an injected provider or `executor.shell.buildExecutionGuard`. Missing guard returns `GOVERNANCE_REJECTED`; missing provider returns `PROVIDER_UNAVAILABLE`. Malformed `generatedCommand` material is rejected instead of falling back to loose command input, and malformed runtime provider output is rejected as `PROVIDER_REJECTED`.

## Returns
Returns `ShellExecutionGuardOutput` with verdict, reasons, required permissions, `dryRun`, `providerCalled`, and audit events.

## Example
`{ "command": "echo a && echo b", "argv": ["echo", "a", "&&", "echo", "b"] }`

## Avoid
Do not put final approval, sandbox enforcement, sudo handling, process execution, or lifecycle ownership in this tool.
