---
description: Feed stdin to a runtime-owned shell session through a governed runtime port.
argument-hint: target.sessionId/input/mode/appendNewline, context.dryRun, context.guard.
---

# shell.stdinFeeding

## Use This Tool

Use this tool when the runtime has already selected and owns the shell session/process, and the baseTool layer needs to shape, validate, audit, and dispatch a shell.stdinFeeding request.

## Call Shape

```ts
{
  target: { sessionId: string; input: string; mode?: "text" | "control-sequence"; appendNewline?: boolean; sensitive?: boolean };
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

- `target.sessionId` identifies a runtime-owned interactive session.
- `target.input` is the exact stdin material requested.
- For real dispatch, runtime provides `BaseToolExecutorPort.shell.feedStdin`.
- Real dispatch requires `context.dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`.

## Optional Inputs

- `appendNewline` asks runtime to append `\n`.
- `mode: "control-sequence"` and `sensitive: true` require TAP approval.
- `preferredProvider` only selects practice metadata/provider order. It does not bypass governance.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `context.allowedSessionIds`, when supplied, must be a string array and is checked before provider dispatch.
- Real dispatch uses an injected provider or `BaseToolExecutorPort.shell.feedStdin`.
- Real provider output must explicitly confirm `stdinWriteBlocked === false`, `resultEnvelope.planned === false`, and non-negative `bytesWritten`.
- If real dispatch has no provider, the tool returns `PROVIDER_UNAVAILABLE`.
- If the provider throws, rejects, or returns malformed output, the tool returns stable public-safe `PROVIDER_REJECTED`.
- Approval, sandbox, sudo policy, session/process lifecycle, stdin stream ownership, prompt loop ownership, and output stream ownership remain runtime/TAP responsibilities.
- The baseTool must not spawn, retain, read from, or write to a local shell process or fd by itself.

## Returns

- Dry-run preview and byte count.
- Runtime provider may return `resultEnvelope.bytesWritten`; baseTool never writes to a stream directly.
- All public errors are safe for runtime inspection and do not expose internal details.

## Example

```ts
{
  target: { sessionId: "shell-session-1", input: "alpha", appendNewline: true },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } }
}
```

## Avoid

- Do not use this baseTool as a shell session/process owner.
- Do not perform hidden local shell operations from inside the baseTool.
- Do not read or write process stdio directly from `core.ts` or `bestPractice.ts`.
- Do not set `dryRun: false` without an affirmative runtime governance grant.
