---
description: Execute a short shell script through the Praxis runtime shell executor.
argument-hint: "{ script, language?, cwd?, timeoutMs?, context: { dryRun, guard } }"
---

# shell.scriptExecution

## Use This Tool

Use `shell.scriptExecution` when the input is intentionally script-shaped, such as `sh -c` or `bash -c` work, and runtime governance has already decided whether execution is allowed.

This tool turns a script into an executable plus argument vector and forwards it to the runtime shell executor. It does not approve the script, select a sandbox, manage background processes, or own output streams.

## Call Shape

```ts
shellScriptExecutionHandler.invoke({
  toolCallId,
  runtimeId,
  sessionId,
  input: {
    context: {
      dryRun: false,
      guard: { allowed: true },
    },
    script: "printf praxis",
    language: "sh",
    timeoutMs: 1000,
  },
  executor,
});
```

## Required Inputs

- `script`: the script body to execute.
- `context.runtimeId`: runtime identity for audit. Handler calls inject this from `BaseToolInvokeRequest` when omitted.
- `context.dryRun: false` plus an allowed runtime guard are required for real provider dispatch.

## Optional Inputs

- `language`: `sh`, `bash`, `zsh`, `fish`, `powershell`, or `unknown`. Defaults to `sh`.
- `cwd`: runtime-selected working directory.
- `timeoutMs`: timeout in milliseconds, capped at `600000`.
- `stdin`: optional one-shot stdin string.
- `preferredProvider`: `anthropic`, `openai`, `deepmind`, or `praxis-native`.

## Runtime Behavior

- Dry-run is the default and never calls a provider.
- `sh`, `bash`, `zsh`, and `fish` map to `<language> -c <script>`.
- `unknown` maps to `sh -c <script>`.
- `powershell` maps to `pwsh -NoProfile -Command <script>`.
- Real execution only calls the selected provider when `context.dryRun === false`.
- Runtime denial through `guard.allowed === false` or `guard.accepted === false` stops before provider dispatch.
- Without an injected provider or `executor.shell.run`, real execution returns `PROVIDER_UNAVAILABLE`.

## Returns

The output includes:

- `scriptPreview`, `scriptLineCount`, and `scriptBytes`
- normalized `language`, `command`, `args`, `cwd`, and `timeoutMs`
- `dryRun`
- `providerCalled`
- `exitCode`, `stdout`, and `stderr` when a provider ran
- `unsafeSideEffects: false`, meaning this tool layer did not bypass runtime to create side effects

## Example

```ts
const result = await shellScriptExecutionHandler.invoke({
  toolCallId: "call-shell-script",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    context: { dryRun: false, guard: { allowed: true } },
    script: "printf praxis-script-ok",
    language: "sh",
    timeoutMs: 1000,
  },
  executor: {
    shell: {
      run: async (request) => ({
        ok: true,
        output: { exitCode: 0, stdout: `${request.command} ${request.args?.join(" ")}`, stderr: "" },
      }),
    },
  },
});
```

## Avoid

- Do not use this tool for long-running, background, detached, or interactive processes.
- Do not compute approval, sandbox policy, sudo policy, or session ownership here.
- Do not use it for a single executable plus argument vector; use `shell.commandExecution` or `shell.invocationExecution` instead.
