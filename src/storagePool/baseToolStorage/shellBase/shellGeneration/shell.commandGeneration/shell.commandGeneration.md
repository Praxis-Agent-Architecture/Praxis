---
description: Render an argv vector into a shell command envelope.
argument-hint: "argv or assembledArguments"
---

# shell.commandGeneration

## Use This Tool
Use this tool after argument assembly to create an audit-ready command line.

## Call Shape
Call through the baseTool registry or handler:

```ts
shellCommandGenerationHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: { argv, assembledArguments, shell, workingDirectory, environmentKeys, context },
});
```

## Required Inputs
Provide either `argv` or `assembledArguments.argv`.

## Optional Inputs
`shell`, `workingDirectory`, `environmentKeys`, and `context`.

## Runtime Behavior
Default `dryRun` renders command text with the deterministic core and does not call a provider. `context.dryRun: false` is only a request for runtime-backed generation; it still does not spawn a process. Provider-backed generation requires an affirmative runtime guard plus an injected provider or `executor.shell.generateCommand`. Missing guard returns `GOVERNANCE_REJECTED`; missing provider returns `PROVIDER_UNAVAILABLE`. Malformed runtime provider output is rejected as `PROVIDER_REJECTED`.

## Returns
Returns `ShellCommandGenerationOutput` with `commandLine`, `argv`, shell, working directory, `dryRun`, `providerCalled`, and audit events.

## Example
`{ "argv": ["npm", "test"], "shell": "bash" }`

## Avoid
Do not treat `dryRun: false` as approval or execution; use `shell.commandExecution`, `shell.invocationExecution`, or `shell.scriptExecution` for real runtime calls.
