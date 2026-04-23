---
description: Return code-action suggestions for a file range without applying them.
argument-hint: target.filePath, target.range, optional diagnostics, only, target.languageId, context.workspaceRoot, context.dryRun.
---

# code.lsp_suggestCodeActions

## Use This Tool

Use this tool when you want fix-it, quick fix, or refactor suggestions for a range, but you do not want to apply edits yet.

## Call Shape

Pass one object with this shape:

```ts
{
  target: {
    filePath: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    languageId?: string;
  };
  diagnostics?: readonly {
    message: string;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    severity?: "error" | "warning" | "information" | "hint";
    code?: string;
    source?: string;
  }[];
  only?: readonly string[];
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

- `target.filePath` and `target.range`.
- `context.dryRun: false` for a real suggestion request.

## Optional Inputs

- `diagnostics` to give the LSP server extra context.
- `only` to narrow action kinds, for example quickfix or refactor.*.
- `target.languageId` and `context.workspaceRoot`.

## Runtime Behavior

- Preview-only tool: it suggests actions but does not apply them.
- Real execution still returns suggestions, not file mutations.
- Use this before `code.lsp_applyCodeAction` if you need to inspect the available choices.

## Returns

- `output.actions` as suggested code actions.
- `output.diagnostics` and `output.only` echo the final filtering context.
- `output.providerCalled` and `output.dryRun` status.

## Example

```ts
{
  target: {
    filePath: "src/service/user.ts",
    range: {
      start: { line: 33, character: 4 },
      end: { line: 33, character: 22 }
    },
    languageId: "typescript"
  },
  only: ["quickfix"],
  context: {
    workspaceRoot: "/absolute/workspace",
    dryRun: false
  }
}
```

## Avoid

- Do not expect this tool to write edits.
- Do not pass an invalid range with end before start.
