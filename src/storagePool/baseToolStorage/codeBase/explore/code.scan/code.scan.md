---
description: Scan code directories through storage-owned codeBase semantics and runtime filesystem support.
argument-hint: "{ \"directoryPath\": \"src\", \"depth\": 2, \"maxEntries\": 100 }"
---

# code.scan

## Use This Tool

Use `code.scan` for directory and code-structure scans. Prefer this over shell commands such as `ls`, `find`, or `tree`.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("code.scan").handler.invoke(...)` with `BaseToolInvokeRequest` fields: `toolCallId`, `runtimeId`, `sessionId`, `input`, and `executor`.

## Required Inputs

- `directoryPath`

## Optional Inputs

- `maxEntries`
- `depth`
- `offset`
- `includeGlobs`
- `excludeGlobs`
- `context.workspaceRoot`
- `context.allowedRoots`
- `context.dryRun`
- `preferredProvider`

## Runtime Behavior

`core.ts` owns directory path validation, scan planning, pagination, depth contract, include/exclude contract, and output shaping. Runtime only supplies directory listing support through `BaseToolExecutorPort.filesystem.list` or an injected scanner.

When `dryRun` is not `false`, no provider is called. When `dryRun: false` has no scanner/provider, the tool returns `SCANNER_NOT_INJECTED`.

## Returns

Returns `agentCore.basicTool.code.scan.output` with `entries`, `offset`, `maxEntries`, `truncated`, and `unsafeSideEffects: false`.

## Example

```ts
await handler.invoke({
  toolCallId: "scan-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    directoryPath: "src",
    depth: 2,
    context: { dryRun: false },
  },
  executor,
});
```

## Avoid

- Do not use shell to list files when `code.scan` is available.
- Do not put scan semantics in runtime; runtime only supports listing.
- Do not claim recursive/depth behavior is real unless the provider supports it.
