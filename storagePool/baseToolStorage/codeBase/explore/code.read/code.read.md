---
description: Read code files through storage-owned codeBase semantics and runtime filesystem support.
argument-hint: "{ \"targetPath\": \"src/index.ts\", \"range\": { \"startLine\": 1, \"endLine\": 40 } }"
---

# code.read

## Use This Tool

Use `code.read` for small range reads, whole-file reads, and multi-file code reads. Prefer this over shell commands such as `cat`, `sed`, or `awk` when the agent needs file content.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("code.read").handler.invoke(...)` with `BaseToolInvokeRequest` fields: `toolCallId`, `runtimeId`, `sessionId`, `input`, and `executor`.

## Required Inputs

- `targetPath`, `targetPaths`, or `targets`.

## Optional Inputs

- `range.startLine` and `range.endLine`
- `maxBytes`, `maxBytesPerFile`, `maxTotalBytes`
- `encoding`
- `includeLineNumbers`
- `context.workspaceRoot`
- `context.allowedRoots`
- `context.dryRun`
- `preferredProvider`

## Runtime Behavior

`core.ts` owns path validation, read planning, multi-file output shaping, byte limits, line-number formatting, and truncation metadata. Runtime only supplies the actual text read through `BaseToolExecutorPort.filesystem.readText` or an injected reader.

When `dryRun` is not `false`, no provider is called. When `dryRun: false` has no reader/provider, the tool returns `READER_NOT_INJECTED`.

## Returns

Returns `agentCore.basicTool.code.read.output` with `content`, `files`, `bytes`, `truncated`, and `unsafeSideEffects: false`.

## Example

```ts
await handler.invoke({
  toolCallId: "read-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    targetPath: "src/index.ts",
    range: { startLine: 1, endLine: 20 },
    context: { dryRun: false },
  },
  executor,
});
```

## Avoid

- Do not use shell to read files when `code.read` is available.
- Do not move range, truncation, or multi-file semantics into runtime.
- Do not allow hidden local filesystem reads inside storage; use injected providers.
