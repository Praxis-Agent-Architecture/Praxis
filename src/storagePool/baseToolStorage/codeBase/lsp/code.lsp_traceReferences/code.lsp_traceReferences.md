---
description: Find references for the symbol at a file position.
argument-hint: target.filePath, target.line, target.character, optional includeDeclaration, target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_traceReferences

## Use This Tool

Use this tool when you want all references to a symbol. This is the semantic equivalent of “find references”.

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
  includeDeclaration?: boolean;
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
- `context.dryRun: false` for a real reference search.

## Optional Inputs

- `includeDeclaration: true` when you want the declaration included in the returned reference list.
- `target.languageId` and `context.workspaceRoot`.

## Runtime Behavior

- Read-only query tool.
- Uses host executor first when available, then Praxis shared runtime.
- Will auto-prepare trusted managed dependencies when possible.

## Returns

- `output.references` as an array of locations.
- `output.includeDeclaration` reflects the final flag used.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/features/session.ts",
    line: 28,
    character: 14,
    languageId: "typescript"
  },
  includeDeclaration: true,
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not use this when you only need the declaration site; use `code.lsp_locateDefinition`.
- Do not expect sorted or deduplicated business semantics beyond what the LSP server returns.
