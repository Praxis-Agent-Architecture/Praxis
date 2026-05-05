---
description: Execute a structured shell invocation through the Praxis runtime shell executor.
argument-hint: "{ invocation: { executable, args?, cwd?, env?, timeoutMs? }, context: { dryRun, guard } }"
---

# shell.invocationExecution

## Use This Tool

Use `shell.invocationExecution` when an upper layer has already built a structured invocation object and runtime governance has decided whether it may run.

This tool normalizes the invocation shape and forwards real execution to the runtime-provided shell executor. It does not approve commands, choose a sandbox, manage sessions, or own process lifetime.

## Call Shape

```ts
shellInvocationExecutionHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  input: {
    context: {
      dryRun: false,
      guard: { allowed: true },
    },
    invocation: {
      invocationId: "call-1",
      executable: "printf",
      args: ["hello"],
      cwd: "/workspace",
      timeoutMs: 1000,
    },
  },
  executor,
});
```

## Required Inputs

- `invocation.executable`: single executable token to run.
- `context.runtimeId`: runtime identity for audit. Handler calls inject this from `BaseToolInvokeRequest` when omitted.
- `context.dryRun: false` plus an allowed runtime guard are required for real provider dispatch.

## Optional Inputs

- `invocation.invocationId`: stable audit id. Handler calls fall back to `toolCallId`.
- `invocation.args`: argument vector passed without shell-string joining.
- `invocation.cwd`: runtime-selected working directory.
- `invocation.env`: invocation-scoped environment entries. Injected custom providers may support this; the v1 host executor path rejects env overrides because `BaseToolExecutorPort.shell.run` has no env field.
- `invocation.timeoutMs`: timeout in milliseconds, capped at `600000`.
- `invocation.stdin`: optional one-shot stdin string.
- `preferredProvider`: `anthropic`, `openai`, `deepmind`, or `praxis-native`.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- Real execution only calls the selected provider when `context.dryRun === false`.
- Runtime denial through `guard.allowed === false` or `guard.accepted === false` stops before provider dispatch.
- Without an injected provider or `executor.shell.run`, real execution returns `PROVIDER_UNAVAILABLE`.
- Provider failures become public-safe `PROVIDER_REJECTED` errors.

## Returns

The output includes:

- normalized `invocationId`, `executable`, `args`, `cwd`, `env`, and `timeoutMs`
- `dryRun`
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when a provider ran
- `unsafeSideEffects: false`, meaning this tool layer did not bypass runtime to create side effects

## Example

```ts
const result = await shellInvocationExecutionHandler.invoke({
  toolCallId: "call-shell-invocation",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    context: { dryRun: false, guard: { allowed: true } },
    invocation: {
      executable: "printf",
      args: ["praxis"],
      timeoutMs: 1000,
    },
  },
  executor: {
    shell: {
      run: async (request) => ({
        ok: true,
        output: { exitCode: 0, stdout: request.args?.join(" ") ?? "", stderr: "" },
      }),
    },
  },
});
```

## Avoid

- Do not use this tool to compute approval, sandbox policy, sudo policy, or session ownership.
- Do not pass env overrides to the default host executor path until the runtime port supports env explicitly.
- Do not concatenate shell strings here; use `shell.scriptExecution` when the input is intentionally a script.
