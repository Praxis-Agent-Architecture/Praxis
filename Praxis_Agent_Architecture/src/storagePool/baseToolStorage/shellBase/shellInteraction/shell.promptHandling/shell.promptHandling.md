---
description: Handle an observed shell prompt through runtime-owned prompt policy and stdin wiring.
argument-hint: target.sessionId/promptText/action/responseText, context.dryRun, context.guard.
---

# shell.promptHandling

## Use This Tool

Use this tool when the runtime has already selected and owns the shell session/process, and the baseTool layer needs to shape, validate, audit, and dispatch a shell.promptHandling request.

## Call Shape

```ts
{
  target: { sessionId: string; promptText: string; promptKind?: "confirmation" | "password" | "sudo" | "selection" | "generic"; action?: "observe" | "respond" | "escalate"; responseText?: string; options?: readonly string[] };
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
- `target.promptText` is the prompt text observed by runtime.
- For real dispatch, runtime provides `BaseToolExecutorPort.shell.handlePrompt`.
- Real dispatch requires `context.dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`.

## Optional Inputs

- `action` defaults to `observe`.
- `responseText` is required for `respond`.
- Password/sudo responses require TAP approval and are redacted in previews.
- `preferredProvider` only selects practice metadata/provider order. It does not bypass governance.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `context.allowedSessionIds`, when supplied, must be a string array and is checked before provider dispatch.
- `target.options`, when supplied, must be a safe string array; malformed options block provider dispatch.
- Real dispatch uses an injected provider or `BaseToolExecutorPort.shell.handlePrompt`.
- Real provider output must match the requested action: `respond` confirms `stdinWriteBlocked === false`; `observe` and `escalate` keep stdin blocked.
- If real dispatch has no provider, the tool returns `PROVIDER_UNAVAILABLE`.
- If the provider throws, rejects, or returns malformed output, the tool returns stable public-safe `PROVIDER_REJECTED`.
- Approval, sandbox, sudo policy, session/process lifecycle, stdin stream ownership, prompt loop ownership, and output stream ownership remain runtime/TAP responsibilities.
- The baseTool must not spawn, retain, read from, or write to a local shell process or fd by itself.

## Returns

- Prompt classification, redacted previews, response byte count, and whether stdin writing stayed blocked.
- `stdinWriteBlocked === false` only after runtime handles a real `respond` action.
- All public errors are safe for runtime inspection and do not expose internal details.

## Example

```ts
{
  target: { sessionId: "shell-session-1", promptText: "Continue?", action: "observe" },
  context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } }
}
```

## Avoid

- Do not use this baseTool as a shell session/process owner.
- Do not perform hidden local shell operations from inside the baseTool.
- Do not read or write process stdio directly from `core.ts` or `bestPractice.ts`.
- Do not set `dryRun: false` without an affirmative runtime governance grant.
