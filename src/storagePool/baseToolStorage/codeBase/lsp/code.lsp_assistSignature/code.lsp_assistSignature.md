---
description: Return signature help at a cursor position.
argument-hint: documentUri, position.line, position.character, optional triggerCharacter, workspaceRoot, dryRun.
---

# code.lsp_assistSignature

## Use This Tool

Use this tool when the cursor is inside a call expression and you want parameter and signature help.

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

- `documentUri`.
- `position.line` and `position.character`.
- `dryRun: false` for a real signature lookup.

## Optional Inputs

- `triggerCharacter` when the call was triggered by a character such as `(` or `,`.
- `workspaceRoot`.

## Runtime Behavior

- Returns signature help only; does not edit files.
- Best when the cursor position is already inside or near a function call.
- Uses automatic dependency preparation when needed.

## Returns

- `signatureHelp.signatures` with labels and parameter info.
- `providerCalled` and `dryRun` status.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/api/client.ts",
  position: {
    line: 23,
    character: 31
  },
  triggerCharacter: "(",
  workspaceRoot: "/absolute/workspace",
  dryRun: false
}
```

## Avoid

- Do not use this for general symbol explanation; use `code.lsp_explainSymbol`.
- Do not expect argument validation beyond what the language server provides.
