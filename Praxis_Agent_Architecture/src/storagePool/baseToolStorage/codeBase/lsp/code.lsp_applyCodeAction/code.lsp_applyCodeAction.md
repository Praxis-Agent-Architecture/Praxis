---
description: Preview matching code actions for a document and selected action title.
argument-hint: documentUri, actionTitle, optional actionKind, optional actionId for preview metadata, workspaceRoot, dryRun.
---

# code.lsp_applyCodeAction

## Use This Tool

Use this tool when you already know which action you want and you want the exact matching action payload or preview. This is still preview-only: no edit is applied here.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  actionTitle?: string;
  actionId?: string;
  actionKind?: string;
  editPreview?: {
    filesTouched?: readonly string[];
    diagnosticsResolved?: readonly string[];
    summary?: string;
  };
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
- `actionTitle` for real runtime filtering.
- Set `dryRun: false` to query the runtime instead of returning only the planning envelope.

## Optional Inputs

- `actionKind` to narrow the match.
- `actionId` only when you want to preserve an external identifier in the preview/planning layer. Do not rely on it as the runtime selector.
- `editPreview` when you want to attach higher-level intent context.
- `workspaceRoot`.

## Runtime Behavior

- Preview-only tool: it never applies edits directly.
- Use after `code.lsp_suggestCodeActions` when you want to narrow to one action.
- In the current implementation, real runtime filtering is based on `actionTitle` and `actionKind`. `actionId` is not a runtime filter.
- This tool is intentionally audit-first and mutation-free.

## Returns

- `matchingActions` as filtered code actions.
- `providerCalled` and `dryRun` status.
- `appliesChanges` is always false.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/server/router.ts",
  actionTitle: "Add missing import",
  actionKind: "quickfix",
  workspaceRoot: "/absolute/workspace",
  dryRun: false
}
```

## Avoid

- Do not treat this as the final edit application step.
- Do not rely on `actionId` to select a runtime action today.
- Do not omit `actionTitle` when you want a real filtered runtime result.
