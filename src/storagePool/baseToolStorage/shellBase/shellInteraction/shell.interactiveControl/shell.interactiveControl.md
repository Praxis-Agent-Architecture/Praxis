---
description: Control a runtime-owned interactive shell session through a governed runtime port.
argument-hint: target.sessionId/action/input/signal/terminalSize, context.dryRun, context.guard.
---

# shell.interactiveControl

## Use This Tool

Use this tool when the runtime has already selected and owns the shell session/process, and the baseTool layer needs to shape, validate, audit, and dispatch a shell.interactiveControl request.

## Call Shape

```ts
{
  target: { sessionId: string; action: "send-input" | "interrupt" | "terminate" | "resize" | "resume"; input?: string; signal?: "SIGINT" | "SIGTERM"; terminalSize?: { columns: number; rows: number } };
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
- `target.action` selects the runtime control operation.
- For real dispatch, runtime provides `BaseToolExecutorPort.shell.controlInteractive`.
- Real dispatch requires `context.dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`.

## Optional Inputs

- `target.input` is required for `send-input`.
- `target.terminalSize` is required for `resize`.
- `interrupt` and `terminate` require TAP approval metadata in addition to runtime guard.
- `preferredProvider` only selects practice metadata/provider order. It does not bypass governance.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `context.allowedSessionIds`, when supplied, must be a string array and is checked before provider dispatch.
- Real dispatch uses an injected provider or `BaseToolExecutorPort.shell.controlInteractive`.
- Real provider output must explicitly confirm `controlBlocked === false`.
- If real dispatch has no provider, the tool returns `PROVIDER_UNAVAILABLE`.
- If the provider throws, rejects, or returns malformed output, the tool returns stable public-safe `PROVIDER_REJECTED`.
- Approval, sandbox, sudo policy, session/process lifecycle, stdin stream ownership, prompt loop ownership, and output stream ownership remain runtime/TAP responsibilities.
- The baseTool must not spawn, retain, read from, or write to a local shell process or fd by itself.

## Returns

- `output.controlBlocked === true` in dry-run.
- `output.controlBlocked === false` only after runtime accepts the control operation.
- All public errors are safe for runtime inspection and do not expose internal details.

## Example

```ts
{
  target: { sessionId: "shell-session-1", action: "send-input", input: "exit\n" },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } }
}
```

## Avoid

- Do not use this baseTool as a shell session/process owner.
- Do not perform hidden local shell operations from inside the baseTool.
- Do not read or write process stdio directly from `core.ts` or `bestPractice.ts`.
- Do not set `dryRun: false` without an affirmative runtime governance grant.
