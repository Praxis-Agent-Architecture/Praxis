---
description: Preview the workspace edits required to rename a symbol.
argument-hint: target.filePath, target.line, target.character, newName, optional target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_renameSymbol

## Use This Tool

Use this tool when you want the semantic rename edit plan for a symbol. It returns a workspace edit preview and never applies the change directly.

## Call Shape

Pass one object with this shape:

```ts
{
  target: {
    filePath: string;
    line: number;
    character: number;
    languageId?: string;
  };
  newName: string;
  applyChanges?: false;
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

- `target.filePath`, `target.line`, `target.character`.
- `newName`.
- `context.dryRun: false` for a real preview from the LSP server.

## Optional Inputs

- `target.languageId` and `context.workspaceRoot`.

## Runtime Behavior

- Preview-only tool: even with a real runtime call, it returns workspace edit previews only.
- Use a higher layer to actually apply the returned edit plan.
- Good fit when you need semantic rename safety but do not want direct file mutation.

## Returns

- `output.workspaceEdit.changes` as file/range/newText preview edits.
- `output.appliedChanges` is always false.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/models/user.ts",
    line: 14,
    character: 9,
    languageId: "typescript"
  },
  newName: "AccountUser",
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not set `applyChanges: true`; this tool intentionally blocks direct mutation.
- Do not use this as a plain text search-and-replace tool.
