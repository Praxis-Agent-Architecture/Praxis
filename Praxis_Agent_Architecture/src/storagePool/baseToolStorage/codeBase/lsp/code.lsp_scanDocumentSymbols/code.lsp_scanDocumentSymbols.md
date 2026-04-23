---
description: List semantic symbols declared in one file.
argument-hint: target.filePath, optional target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_scanDocumentSymbols

## Use This Tool

Use this tool when you want the semantic symbol tree for one file: classes, functions, methods, variables, enums, and nested symbols.

## Call Shape

Pass one object with this shape:

```ts
{
  target: {
    filePath: string;
    languageId?: string;
  };
  context?: {
    workspaceRoot?: string;
    dryRun?: boolean;
    invocationId?: string;
    allowedFilePaths?: readonly string[];
  };
  runtime?: {
    workspaceRoot?: string;
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

- `target.filePath`.
- `context.dryRun: false` for a real symbol scan.

## Optional Inputs

- `target.languageId` when extension-based detection is ambiguous.
- `context.workspaceRoot` for relative paths.

## Runtime Behavior

- Read-only query tool.
- Returns document symbols only, not workspace-wide results.
- Good first step before `inspectSymbol` if you do not yet know the exact symbol target.

## Returns

- `output.symbols` as the document symbol tree.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/http/controller.ts",
    languageId: "typescript"
  },
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not use this for workspace-wide fuzzy lookup; use `code.lsp_searchWorkspaceSymbols`.
- Do not expect file content text; this returns semantic symbol metadata.
