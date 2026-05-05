---
description: Assemble shell executable, options, and positional values into an argv envelope.
argument-hint: "executable, options, positional"
---

# shell.argumentAssembly

## Use This Tool
Use this tool to build auditable argv material before command rendering.

## Call Shape
Call through the baseTool registry or handler:

```ts
shellArgumentAssemblyHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: { executable, options, positional, context },
});
```

## Required Inputs
`executable` is required and must be a non-empty string.

## Optional Inputs
`options`, `positional`, `context.grantedPermissions`, and `context.auditMetadata`.

## Runtime Behavior
Default `dryRun` uses the deterministic core and never calls a provider. `context.dryRun: false` is only a request for runtime-backed generation; it still does not execute shell. Provider-backed generation requires `context.guard.allowed === true` or `context.guard.accepted === true` plus an injected provider or `executor.shell.assembleArguments`. Missing guard returns `GOVERNANCE_REJECTED`; missing provider returns `PROVIDER_UNAVAILABLE`. Malformed runtime provider output is rejected as `PROVIDER_REJECTED`.

## Returns
Returns `ShellArgumentAssemblyOutput` with `argv`, `renderedTokens`, `redactedPreview`, `dryRun`, `providerCalled`, and audit events.

## Example
`{ "executable": "npm", "positional": ["test"] }`

## Avoid
Do not use this tool for execution, approval, sandboxing, sudo policy, process lifecycle, or hidden provider fallback.
