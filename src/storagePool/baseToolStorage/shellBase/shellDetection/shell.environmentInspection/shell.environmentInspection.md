---
description: Inspect shell environment material from a provided snapshot or runtime-owned shell provider.
argument-hint: "{ target: { workingDirectory, environment?, variablesToInspect? }, context: { runtimeId?, dryRun?, guard? } }"
---

# shell.environmentInspection

## Use This Tool

Use this tool to summarize environment variables, PATH entries, and redacted secret-like values through a governed shell baseTool.

## Call Shape

Call `executeShellEnvironmentInspection({ target, context, provider? })` or invoke the registered `shellEnvironmentInspectionHandler`.

## Required Inputs

- `target.workingDirectory`: directory scope for the inspection.

## Optional Inputs

- `target.shellExecutable`
- `target.environment`: provided environment snapshot for dry-run
- `target.variablesToInspect`
- `context.runtimeId`, `context.invocationId`, `context.dryRun`, `context.guard`

## Runtime Behavior

Dry-run mode only inspects the provided snapshot and never reads the host process environment. Real inspection requires `dryRun: false` plus an affirmative guard; provider access is routed through `BaseToolExecutorPort.shell.run`. If `target.shellExecutable` is present, the provider runs that shell with `-c env`; otherwise it runs `env` in the requested working directory, parses stdout, redacts secret-like names, DSN/database URL/cookie/session/private/PAT carriers, userinfo URLs, and returns PATH entries. Unsafe shell executable tokens containing NUL, newlines, or control characters are rejected before provider dispatch.

## Returns

Returns variable reports, redaction flags, PATH entries, required permissions, and audit events. Redacted variables never include raw values or previews.

## Example

```ts
await shellEnvironmentInspectionHandler.invoke({
  toolCallId: "env-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: { target: { workingDirectory: "/workspace", variablesToInspect: ["PATH"] } },
  executor,
});
```

## Avoid

Do not expose raw secrets. Do not read process environment directly from storagePool without a runtime provider.
