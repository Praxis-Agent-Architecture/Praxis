---
description: Monitor shell execution state supplied or read by the runtime shell interaction port.
argument-hint: target.sessionId or processId, optional observation/staleAfterMs, context.dryRun, context.guard.
---

# shell.executionMonitoring

## Use This Tool

Use this tool when the runtime has already selected and owns the shell session/process, and the baseTool layer needs to shape, validate, audit, and dispatch a shell.executionMonitoring request.

This is the interactive-session observation primitive. It must not be confused with `shellBase/executionMonitoring` tools such as `shell.runtimeObservation` and `shell.processStatusTracking`, which consume already-published execution records.

## Call Shape

```ts
{
  target: { sessionId?: string; processId?: number };
  context?: {
    runtimeId?: string;
    invocationId?: string;
    dryRun?: boolean;
    guard?: { allowed?: boolean; accepted?: boolean; reason?: string };
    allowedSessionIds?: readonly string[];
    grantedPermissions?: readonly string[];
  };
  preferredProvider?: "anthropic" | "openai" | "deepmind" | "praxis-native";
}
```

## Required Inputs

- `target.sessionId` or `target.processId` identifies a runtime-owned shell session/process.
- For real dispatch, runtime provides `BaseToolExecutorPort.shell.monitorExecution`.
- Real dispatch requires `context.dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`.

## Optional Inputs

- `observation` can carry a runtime-provided state snapshot for dry-run normalization.
- `staleAfterMs` controls healthy vs stalled classification.
- `preferredProvider` only selects practice metadata/provider order. It does not bypass governance.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `context.allowedSessionIds`, when supplied, must be a string array and is checked before provider dispatch.
- Real dispatch uses an injected provider or `BaseToolExecutorPort.shell.monitorExecution`.
- Real provider output must contain a valid runtime-owned target, observation, health value, and `realProcessReadBlocked === false`.
- If real dispatch has no provider, the tool returns `PROVIDER_UNAVAILABLE`.
- If the provider throws, rejects, or returns malformed output, the tool returns stable public-safe `PROVIDER_REJECTED`.
- Approval, sandbox, sudo policy, session/process lifecycle, stdin stream ownership, prompt loop ownership, and output stream ownership remain runtime/TAP responsibilities.
- The baseTool must not spawn, retain, read from, or write to a local shell process or fd by itself.

## Returns

- `output.observation` and `output.health` from core/runtime normalization.
- `output.realProcessReadBlocked === false` only after runtime provider supplies a real observation.
- All public errors are safe for runtime inspection and do not expose internal details.

## Example

```ts
{
  target: { sessionId: "shell-session-1" },
  staleAfterMs: 300000,
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } }
}
```

## Avoid

- Do not use this baseTool as a shell session/process owner.
- Do not perform hidden local shell operations from inside the baseTool.
- Do not read or write process stdio directly from `core.ts` or `bestPractice.ts`.
- Do not set `dryRun: false` without an affirmative runtime governance grant.
