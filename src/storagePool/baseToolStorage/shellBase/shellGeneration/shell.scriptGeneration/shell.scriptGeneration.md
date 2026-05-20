---
description: Generate a guarded shell script plan.
argument-hint: "target.commands, target.shell"
---

# shell.scriptGeneration

## Use This Tool
Use this tool to create auditable shell script text before any runtime execution primitive is invoked.

## Call Shape
Call through the baseTool registry or handler:

```ts
shellScriptGenerationHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: { target, context },
});
```

## Required Inputs
`target.commands` must contain at least one command.

## Optional Inputs
`target.shell`, `scriptName`, `workingDirectory`, `environment`, `notes`, and `context`.

## Runtime Behavior
Default `dryRun` creates script text with the deterministic core and does not call a provider. `context.dryRun: false` is only a request for runtime-backed script generation; it still does not write a file, chmod, or execute shell. Provider-backed generation requires an affirmative runtime guard plus an injected provider or `executor.shell.generateScript`. Missing guard returns `GOVERNANCE_REJECTED`; missing provider returns `PROVIDER_UNAVAILABLE`. Malformed runtime provider output is rejected as `PROVIDER_REJECTED`.

## Returns
Returns `ShellScriptGenerationOutput` with script text, preview commands, line count, `dryRun`, `providerCalled`, and audit events.

## Example
`{ "target": { "shell": "bash", "commands": ["npm test"] } }`

## Avoid
Do not use this tool for file writes, chmod, spawning, background jobs, runtime approval, sandboxing, or process lifecycle.
