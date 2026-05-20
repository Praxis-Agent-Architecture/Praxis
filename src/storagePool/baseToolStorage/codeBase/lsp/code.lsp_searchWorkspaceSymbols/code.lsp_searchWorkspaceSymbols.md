---
description: Search semantic symbols across the workspace.
argument-hint: query, optional limit, context.workspaceRoot, optional runtime.workspaceLanguageId or runtime.workspaceFilePathHint, context.dryRun.
---

# code.lsp_searchWorkspaceSymbols

## Use This Tool

Use this tool when you know a symbol name or prefix but do not know the exact file yet. This is the semantic workspace-wide lookup tool.

## Call Shape

Pass one object with this shape:

```ts
{
  query: string;
  limit?: number;
  context?: {
    workspaceRoot?: string;
    dryRun?: boolean;
    invocationId?: string;
  };
  runtime?: {
    workspaceRoot?: string;
    workspaceLanguageId?: string;
    workspaceFilePathHint?: string;
    resolvedServerPath?: string;
    server?: {
      command: string;
      args: readonly string[];
      languageId: string;
      fileExtensions: readonly string[];
    };
  };
  preferredProvider?: "anthropic" | "openai" | "deepmind" | "praxis-native";
}
```

## Required Inputs

- `query` must be non-empty.
- `context.workspaceRoot` or `runtime.workspaceRoot` should point at the workspace root.
- `context.dryRun: false` for a real workspace search.

## Optional Inputs

- `limit` to cap results.
- `runtime.workspaceLanguageId` to help server selection when the workspace contains mixed languages.
- `runtime.workspaceFilePathHint` if you want to bias selection toward one language/project shape.

## Runtime Behavior

- Read-only query tool.
- Normal execution no longer requires explicit `runtime.server`.
- The runtime will infer the LSP server from workspace markers and dependency resolution.

## Returns

- `output.symbols` as workspace symbol results.
- `output.limit` as the final cap used.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  query: "UserService",
  limit: 20,
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  },
  runtime: {
    workspaceLanguageId: "typescript"
  }
}
```

## Avoid

- Do not use this when you already have a precise file+position; use locate/trace tools instead.
- Do not pass a blank query.
