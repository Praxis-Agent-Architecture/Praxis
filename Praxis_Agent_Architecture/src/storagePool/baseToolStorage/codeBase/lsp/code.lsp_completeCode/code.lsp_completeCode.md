---
description: Return semantic completion items for a cursor position.
argument-hint: documentUri, position.line, position.character, optional triggerCharacter, maxItems, workspaceRoot, dryRun.
---

# code.lsp_completeCode

## Use This Tool

Use this tool when you want LSP-backed completion candidates at a cursor position. It returns candidates only; it does not insert them into the file.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  position: {
    line: number;
    character: number;
  };
  triggerCharacter?: string;
  maxItems?: number;
  workspaceRoot?: string;
  dryRun?: boolean;
  runtime?: {
    workspaceRoot?: string;
    workspaceLanguageId?: string;
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

- `documentUri` as an absolute path or `file://` URI.
- `position.line` and `position.character` as 0-based coordinates.
- Set `dryRun: false` for a real completion query.

## Optional Inputs

- `triggerCharacter` when the completion should emulate a typed trigger.
- `maxItems` to cap result size.
- `workspaceRoot` if `documentUri` is relative.

## Runtime Behavior

- Real execution returns completion items only; it does not write to the file.
- Host executor is preferred when present; otherwise the shared runtime is used.
- Dependencies are prepared automatically when possible.

## Returns

- `items` as completion candidates.
- `providerCalled` and `dryRun` status.
- `kind` tells you whether this is a preview envelope or a real runtime result.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/server/router.ts",
  position: {
    line: 52,
    character: 18
  },
  triggerCharacter: ".",
  maxItems: 20,
  workspaceRoot: "/absolute/workspace",
  dryRun: false
}
```

## Avoid

- Do not expect inserted text to be applied automatically.
- Do not pass 1-based positions.
- Do not use this when you need hover/definition information instead of completion.
