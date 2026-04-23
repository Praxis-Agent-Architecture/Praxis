---
description: Resolve the definition location for the symbol at a file position.
argument-hint: target.filePath, target.line, target.character, optional target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_locateDefinition

## Use This Tool

Use this tool when you already know a file path and cursor position and you want the symbol definition. This is the direct semantic equivalent of “go to definition”.

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
    workspaceFacts?: {
      markerFiles?: readonly string[];
      fileContentSample?: string;
    };
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

- `target.filePath` points to the source file.
- `target.line` and `target.character` are 0-based LSP coordinates.
- Set `context.dryRun: false` when you want a real LSP/runtime call instead of a dry-run envelope.

## Optional Inputs

- `target.languageId` when file extension is ambiguous.
- `context.workspaceRoot` when `filePath` is relative.
- `runtime.server` only for tests or hard overrides.
- `preferredProvider` only when you want to bias provider strategy selection.

## Runtime Behavior

- Execution order is: injected provider -> host executor -> Praxis shared runtime.
- If no matching LSP dependency is present, toolDependency will try to prepare a trusted managed dependency automatically.
- This tool is read-only. It never edits files.

## Returns

- `output.locations` as definition locations.
- `output.providerCalled` to tell you whether a real provider/runtime was used.
- `output.dryRun` to tell you whether this was only a preview call.

## Example

```ts
{
  target: {
    filePath: "src/server/router.ts",
    line: 41,
    character: 12,
    languageId: "typescript"
  },
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not pass 1-based line numbers.
- Do not use this when you only have a symbol name and no position; use `code.lsp_searchWorkspaceSymbols` first.
- Do not force `runtime.server` unless normal dependency resolution is the wrong choice.
