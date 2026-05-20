---
description: Return hover text plus optional definition/reference hints for a symbol.
argument-hint: documentUri, position.line, position.character, optional includeDefinitionHint, includeReferencesHint, workspaceRoot, dryRun.
---

# code.lsp_explainSymbol

## Use This Tool

Use this tool when you want the semantic explanation of a symbol at a cursor position: hover text first, optional definition hints second, optional references third.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  position: {
    line: number;
    character: number;
  };
  includeDefinitionHint?: boolean;
  includeReferencesHint?: boolean;
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
- `dryRun: false` for a real explanation result.

## Optional Inputs

- `includeDefinitionHint` to include definition targets.
- `includeReferencesHint` to include reference locations.
- `workspaceRoot`.

## Runtime Behavior

- Read-only semantic inspection tool.
- Useful when you want one call that gives hover text and a bit of navigation context.
- Does not modify files.

## Returns

- `hover` as the main explanation payload.
- `definitions` and `references` when requested.
- `providerCalled` and `dryRun` status.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/domain/order.ts",
  position: {
    line: 44,
    character: 16
  },
  includeDefinitionHint: true,
  includeReferencesHint: false,
  workspaceRoot: "/absolute/workspace",
  dryRun: false
}
```

## Avoid

- Do not use this when you need only completion or signature help.
- Do not rely on it for natural-language summarization beyond the LSP hover payload.
