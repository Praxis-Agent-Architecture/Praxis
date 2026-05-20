---
description: Detect shell session shape through supplied hints or a runtime-owned provider.
argument-hint: "{ target: { sessionId?, processId?, tty?, shellExecutable? }, context: { runtimeId?, dryRun?, guard? } }"
---

# shell.sessionDetection

## Use This Tool

Use this tool to classify whether shell session material looks interactive, non-interactive, or unknown while keeping process reads under runtime control.

## Call Shape

Call `executeShellSessionDetection({ target, context, provider? })` or invoke the registered `shellSessionDetectionHandler`.

## Required Inputs

At least one of `target.sessionId`, `target.processId`, `target.tty`, or `target.shellExecutable`.

## Optional Inputs

- `target.knownInteractive`
- `context.allowedSessionIds`, `context.allowedProcessIds`
- `context.runtimeId`, `context.invocationId`, `context.dryRun`, `context.guard`

## Runtime Behavior

Dry-run mode classifies only supplied hints. Real session detection requires `dryRun: false`, an affirmative guard, and a runtime provider. The host provider calls `BaseToolExecutorPort.shell.run` with a read-only session probe that reports `$$`, `PPID`, `tty`, `$-`, and `$0`, then normalizes process id, tty presence, interactive state, and shell kind. Missing provider returns `PROVIDER_UNAVAILABLE`. Unsafe shell executable tokens containing NUL, newlines, or control characters are rejected before provider dispatch.

## Returns

Returns normalized target data, session kind, tty presence, shell kind, required permissions, and audit events.

## Example

```ts
await shellSessionDetectionHandler.invoke({
  toolCallId: "session-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: { target: { shellExecutable: "/bin/zsh", tty: "/dev/pts/1" } },
  executor,
});
```

## Avoid

Do not inspect arbitrary processes from baseTools. Process ownership and session lifecycle stay with runtime/TAP.
