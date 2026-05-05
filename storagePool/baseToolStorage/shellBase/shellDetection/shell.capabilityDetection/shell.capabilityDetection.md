---
description: Detect shell capability support through dry-run inference or a runtime-owned probe.
argument-hint: "{ target: { shellExecutable, requestedCapabilities? }, context: { runtimeId?, dryRun?, guard? } }"
---

# shell.capabilityDetection

## Use This Tool

Use this tool when runtime needs a governed baseTool envelope for shell capability support such as pipelines, job control, script execution, or signal handling.

## Call Shape

Call `executeShellCapabilityDetection({ target, context, provider? })` or invoke the registered `shellCapabilityDetectionHandler`.

## Required Inputs

- `target.shellExecutable`: shell executable path or command name.

## Optional Inputs

- `target.shellKind`, `target.reportedVersion`, `target.requestedCapabilities`
- `context.runtimeId`, `context.invocationId`, `context.dryRun`, `context.guard`
- `preferredProvider` for best-practice selection

## Runtime Behavior

Dry-run mode infers from supplied shell hints and never calls a provider. Real probing requires `dryRun: false` and `context.guard.allowed === true` or `context.guard.accepted === true`; otherwise it returns `GOVERNANCE_REJECTED`. The host provider calls `BaseToolExecutorPort.shell.run` with the requested shell and a read-only probe script, then normalizes stdout into capability findings for command execution, script execution, pipelines, environment expansion, interactive mode, job control, and POSIX signal support. If no runtime provider exists, it returns `PROVIDER_UNAVAILABLE`. Unsafe shell executable tokens containing NUL, newlines, or control characters are rejected before provider dispatch.

## Returns

Returns capability findings, required permissions, audit events, and whether the result came from dry-run or a runtime provider.

## Example

```ts
await shellCapabilityDetectionHandler.invoke({
  toolCallId: "capability-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: { target: { shellExecutable: "/bin/bash" } },
  executor,
});
```

## Avoid

Do not run shell probes directly inside baseTools. Approval, sandboxing, and process ownership belong to runtime and TAP.
