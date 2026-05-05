---
description: Detect shell type from supplied hints or a runtime-owned probe.
argument-hint: "{ shellPath? | executableName? | envShell?, context: { runtimeId, dryRun?, guard? } }"
---

# shell.typeDetection

## Use This Tool

Use this tool to classify shell identity such as bash, zsh, fish, PowerShell, cmd, sh, or unknown.

## Call Shape

Call `executeShellTypeDetection({ shellPath, executableName, envShell, context, provider? })` or invoke the registered `shellTypeDetectionHandler`.

## Required Inputs

- `context.runtimeId`
- one of `shellPath`, `executableName`, or `envShell`

## Optional Inputs

- `platform`
- `context.requestedScopes`, `context.allowedScopes`
- `context.dryRun`, `context.guard`

## Runtime Behavior

Dry-run mode classifies supplied hints without host probing. Real probing requires `dryRun: false` and an affirmative guard before provider dispatch. The host provider calls `BaseToolExecutorPort.shell.run` with the hinted shell and a read-only identity probe that reports `$0`, `$SHELL`, and `$-`, then feeds the observed shell name back through the same normalizer used by dry-run mode. Unsafe hints containing NUL, newlines, or control characters are rejected before provider dispatch.

## Returns

Returns detected shell type, confidence, normalized shell name, source hint, accepted scopes, required permissions, and audit metadata. Dry-run reports `shell:detect:dry-run`; real provider probes report `shell:detect`.

## Example

```ts
await shellTypeDetectionHandler.invoke({
  toolCallId: "type-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: { shellPath: "/bin/zsh", context: { runtimeId: "runtime-1" } },
  executor,
});
```

## Avoid

Do not probe shells directly without runtime guard approval and a runtime-owned provider.
