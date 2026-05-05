---
description: Execute a one-shot shell command through the runtime-provided shell executor.
argument-hint: command, optional args, cwd, timeoutMs, stdin, context.dryRun, context.guard.
---

# shell.commandExecution

## Use This Tool

Use this tool when runtime has already decided that a one-shot shell command should be dispatched through the baseTool layer.

This is the shell equivalent of a primitive “run command” operation. It is not a shell session manager, approval engine, sandbox policy, or background process controller.

## Call Shape

Pass one object with this shape:

```ts
{
  command: string;
  args?: readonly string[];
  cwd?: string;
  shellType?: string;
  timeoutMs?: number;
  stdin?: string;
  context?: {
    runtimeId?: string;
    sessionId?: string;
    invocationId?: string;
    dryRun?: boolean;
    guard?: {
      allowed?: boolean;
      accepted?: boolean;
      reason?: string;
    };
    requestedScopes?: readonly string[];
    allowedScopes?: readonly string[];
  };
  preferredProvider?: "anthropic" | "openai" | "deepmind" | "praxis-native";
}
```

## Required Inputs

- `command` is the executable or command token to run.
- `context.runtimeId` is required for the lower-level dry-run planner.
- Set `context.dryRun: false` only when runtime has already approved real dispatch.
- For real dispatch, runtime must provide `BaseToolExecutorPort.shell.run` or an injected provider.

## Optional Inputs

- `args` are passed as argv-style arguments.
- `cwd` is the runtime-selected working directory.
- `timeoutMs` defaults to 30000 and must be between 1 and 600000.
- `stdin` is passed to the runtime shell executor for one-shot command input.
- `preferredProvider` only biases practice metadata; it does not bypass runtime execution.

## Runtime Behavior

- Dry-run is the default. Dry-run returns a command envelope and does not call any provider.
- Real execution order is: injected provider -> host runtime `executor.shell.run`.
- If `context.guard.allowed === false` or `context.guard.accepted === false`, the provider is not called.
- If `context.dryRun === false` and no runtime shell executor/provider exists, the tool returns `PROVIDER_UNAVAILABLE`.
- Approval, sandbox, session ownership, process lifecycle, and output-stream policy remain runtime responsibilities.

## Returns

- `output.exitCode`, `output.stdout`, and `output.stderr` from the runtime shell executor.
- `output.providerCalled` to tell whether a real executor/provider was used.
- `output.dryRun` to tell whether this was only a preview call.
- `metadata.audit` when invoked through `shellCommandExecutionHandler`.

## Example

```ts
{
  command: "npm",
  args: ["test"],
  cwd: "/absolute/workspace",
  timeoutMs: 120000,
  context: {
    runtimeId: "runtime-1",
    invocationId: "shell-test-1",
    dryRun: false,
    guard: { allowed: true }
  }
}
```

## Avoid

- Do not use this tool for interactive shell sessions; add a session-oriented shell tool instead.
- Do not put approval, sandbox, sudo, or background-process policy in this tool.
- Do not pass shell operators as a substitute for runtime orchestration.
- Do not call real execution without a runtime-provided shell executor.
