---
description: Resolve the type-definition location for the symbol at a file position.
argument-hint: target.filePath, target.line, target.character, optional target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_locateTypeDefinition

## Use This Tool

Use this tool when you want the type-definition target rather than the direct implementation definition. Typical cases are interfaces, aliases, generic types, and declared types.

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

- `target.filePath`, `target.line`, and `target.character`.
- `context.dryRun: false` for a real call.

## Optional Inputs

- `target.languageId` and `context.workspaceRoot`.
- `preferredProvider` when you want to bias strategy selection.

## Runtime Behavior

- Runs through host executor when available; otherwise uses the shared Praxis LSP runtime.
- Automatically resolves the language server from file path or language id.
- Read-only; no file mutation.

## Returns

- `output.locations` for type-definition locations.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/domain/user.ts",
    line: 17,
    character: 9,
    languageId: "typescript"
  },
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not use this as a generic replacement for locateDefinition.
- Do not pass unresolved workspace-relative paths without `context.workspaceRoot`.
