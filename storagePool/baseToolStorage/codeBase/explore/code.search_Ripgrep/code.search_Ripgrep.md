---
description: Search code text through storage-owned ripgrep semantics and runtime search support.
argument-hint: "{ \"query\": \"needle\", \"directoryPath\": \"src\", \"fileGlob\": \"**/*.ts\" }"
---

# code.search_Ripgrep

## Use This Tool

Use `code.search_Ripgrep` for precise code text search. Prefer this over shell commands such as `rg` or `grep`.

## Call Shape

Call through `createBaseToolRegistry().lookupHandler("code.search_Ripgrep").handler.invoke(...)` with `BaseToolInvokeRequest` fields: `toolCallId`, `runtimeId`, `sessionId`, `input`, and `executor`.

## Required Inputs

- `query`
- `directoryPath`

## Optional Inputs

- `pattern`
- `fileGlob`
- `maxMatches`
- `literal`
- `caseSensitive`
- `includeHidden`
- `multiline`
- `contextLines`
- `context.workspaceRoot`
- `context.allowedRoots`
- `context.dryRun`
- `preferredProvider`

## Runtime Behavior

`core.ts` owns query validation, path validation, rg command envelope construction, result normalization, and failure mapping. Runtime only supplies ripgrep-style execution through `BaseToolExecutorPort.search.ripgrep` or an injected executor.

When `dryRun` is not `false`, no provider is called. When `dryRun: false` has no executor/provider, the tool returns `EXECUTOR_NOT_INJECTED`.

## Returns

Returns `agentCore.basicTool.code.search_Ripgrep.output` with `matches`, `exitCode`, optional `stderr`, `truncated`, and `unsafeSideEffects: false`.

## Example

```ts
await handler.invoke({
  toolCallId: "rg-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    query: "createBaseToolRegistry",
    directoryPath: "src",
    fileGlob: "**/*.ts",
    context: { dryRun: false },
  },
  executor,
});
```

## Avoid

- Do not ask shell to run `rg` when this tool is available.
- Do not leak raw provider errors or stack traces.
- Do not treat runtime search support as the tool brain; storage owns the search contract.
