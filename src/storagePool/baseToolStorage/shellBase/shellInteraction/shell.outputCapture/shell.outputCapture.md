---
description: Capture output from a runtime-owned shell session through a governed runtime port.
argument-hint: target.sessionId/streams/maxBytes/chunks, context.dryRun, context.guard.
---

# shell.outputCapture

## Use This Tool

Use this tool when the runtime has already selected and owns the shell session/process, and the baseTool layer needs to shape, validate, audit, and dispatch a shell.outputCapture request.

## Call Shape

```ts
{
  target: { sessionId: string; streams?: readonly ("stdout" | "stderr" | "combined")[]; maxBytes?: number; chunks?: readonly { stream: "stdout" | "stderr" | "combined"; text: string; receivedAtMs?: number }[]; redactionPatterns?: readonly string[] };
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

- `target.sessionId` identifies a runtime-owned shell session.
- For real dispatch, runtime provides `BaseToolExecutorPort.shell.captureOutput`.
- Real dispatch requires `context.dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`.

## Optional Inputs

- `streams` defaults to stdout and stderr.
- `chunks` are runtime-provided material for dry-run normalization.
- `redactionPatterns` are applied only to provided chunks.
- `preferredProvider` only selects practice metadata/provider order. It does not bypass governance.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `context.allowedSessionIds`, when supplied, must be a string array and is checked before provider dispatch.
- `target.redactionPatterns`, when supplied, must be a string array of valid regex patterns; malformed redaction material blocks provider dispatch.
- Real dispatch uses an injected provider or `BaseToolExecutorPort.shell.captureOutput`.
- Real provider output must contain runtime-owned chunks with safe stream/text/byte metadata and `realBufferReadBlocked === false`.
- If real dispatch has no provider, the tool returns `PROVIDER_UNAVAILABLE`.
- If the provider throws, rejects, or returns malformed output, the tool returns stable public-safe `PROVIDER_REJECTED`.
- Approval, sandbox, sudo policy, session/process lifecycle, stdin stream ownership, prompt loop ownership, and output stream ownership remain runtime/TAP responsibilities.
- The baseTool must not spawn, retain, read from, or write to a local shell process or fd by itself.

## Returns

- Captured chunks, byte count, truncation status, and stream list.
- `realBufferReadBlocked === false` only after runtime provider reads its own output buffer.
- All public errors are safe for runtime inspection and do not expose internal details.

## Example

```ts
{
  target: { sessionId: "shell-session-1", streams: ["stdout"], maxBytes: 64000 },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } }
}
```

## Avoid

- Do not use this baseTool as a shell session/process owner.
- Do not perform hidden local shell operations from inside the baseTool.
- Do not read or write process stdio directly from `core.ts` or `bestPractice.ts`.
- Do not set `dryRun: false` without an affirmative runtime governance grant.
