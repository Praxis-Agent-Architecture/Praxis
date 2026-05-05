---
description: Preview whole-document formatting edits.
argument-hint: documentUri, optional languageId, options.tabSize, options.insertSpaces, workspaceRoot, dryRun.
---

# code.lsp_formatDocument

## Use This Tool

Use this tool when you want the formatter’s proposed edits for an entire file, but you do not want the tool itself to write the file.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  languageId?: string;
  options?: {
    tabSize?: number;
    insertSpaces?: boolean;
    trimTrailingWhitespace?: boolean;
    insertFinalNewline?: boolean;
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
- Set `dryRun: false` for a real formatting preview.

## Optional Inputs

- `languageId` when detection may be ambiguous.
- `options.tabSize` and `options.insertSpaces`.
- `runtime.workspaceRoot` for relative paths.

## Runtime Behavior

- Preview-only tool: even with a real runtime call, it returns text edits, not file writes.
- Use a higher layer to apply edits if desired.
- Good for audit-first formatting workflows.

## Returns

- `edits` as formatter text edits.
- `providerCalled` and `dryRun` status.
- `appliesChanges` is always false in the runtime result.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/http/controller.ts",
  languageId: "typescript",
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

- Do not expect the file to be rewritten automatically.
- Do not pass invalid `tabSize` values.
- Do not use this for a small selection; use `code.lsp_formatRange`.
