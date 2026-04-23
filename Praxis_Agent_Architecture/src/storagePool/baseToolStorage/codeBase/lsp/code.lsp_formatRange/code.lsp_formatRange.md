---
description: Preview formatting edits for a specific range.
argument-hint: documentUri, range.start, range.end, optional languageId, formatting options, workspaceRoot, dryRun.
---

# code.lsp_formatRange

## Use This Tool

Use this tool when you want formatter edits for one specific region instead of the whole file.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  languageId?: string;
  options?: {
    tabSize?: number;
    insertSpaces?: boolean;
  };
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
- `range.start` and `range.end`.
- `dryRun: false` for a real formatting preview.

## Optional Inputs

- `languageId`.
- `options.tabSize` and `options.insertSpaces`.

## Runtime Behavior

- Preview-only tool: it returns text edits only.
- Best when the user wants to reformat a block, function, or pasted region.
- Uses host executor or shared runtime depending on availability.

## Returns

- `edits` as range formatting text edits.
- `providerCalled` and `dryRun` status.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/http/controller.ts",
  range: {
    start: { line: 12, character: 0 },
    end: { line: 28, character: 1 }
  },
  options: {
    tabSize: 2,
    insertSpaces: true
  },
  dryRun: false,
  runtime: {
    workspaceRoot: "/absolute/workspace"
  }
}
```

## Avoid

- Do not pass an inverted range.
- Do not use this when you want the entire file formatted.
