---
description: Build a runtime-visible shell invocation envelope.
argument-hint: "generatedCommand, executionGuard"
---

# shell.invocationConstruction

## Use This Tool
Use this tool after command generation and guard classification to create an invocation envelope.

## Call Shape
Call through the baseTool registry or handler:

```ts
shellInvocationConstructionHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  executor,
  input: { generatedCommand, executionGuard, invocationId, runtimeId, sessionId, metadata, context },
});
```

## Required Inputs
`generatedCommand` and `executionGuard` are required.

## Optional Inputs
`invocationId`, `runtimeId`, `sessionId`, `metadata`, and `context`.

## Runtime Behavior
Default `dryRun` builds a runtime-visible invocation envelope with the deterministic core and does not call a provider. `context.dryRun: false` is only a request for runtime-backed envelope construction; it still does not execute the invocation. Provider-backed construction requires an affirmative runtime guard plus an injected provider or `executor.shell.constructInvocation`. Missing guard returns `GOVERNANCE_REJECTED`; missing provider returns `PROVIDER_UNAVAILABLE`. `generatedCommand` and `executionGuard` are validated as delegated contracts, and malformed runtime provider output is rejected as `PROVIDER_REJECTED`.

## Returns
Returns a `ShellInvocationEnvelope` through the handler output, including `dryRun`, `providerCalled`, guard verdict, and approval status.

## Example
`{ "generatedCommand": { ... }, "executionGuard": { "verdict": "allowed", ... } }`

## Avoid
Do not execute the invocation, bypass the execution guard, create approval state, or own process/session lifecycle.
