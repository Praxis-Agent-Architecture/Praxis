---
description: Find implementation locations for the symbol at a file position.
argument-hint: target.filePath, target.line, target.character, optional target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_traceImplementations

## Use This Tool

Use this tool when the symbol is an interface, abstract method, trait, protocol, or declaration with concrete implementations elsewhere.

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
- `context.dryRun: false` for a real implementation lookup.

## Optional Inputs

- `target.languageId` and `context.workspaceRoot`.

## Runtime Behavior

- Read-only query tool.
- Resolves implementations via host executor or shared runtime.
- Dependency preparation is automatic for trusted managed sources.

## Returns

- `output.implementations` as implementation locations.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/contracts/cache.ts",
    line: 9,
    character: 18,
    languageId: "typescript"
  },
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not use this for plain text grep over method names; this tool is semantic, not lexical.
- Do not expect every language server to support implementation search equally well.
