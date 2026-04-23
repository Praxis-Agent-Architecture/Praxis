---
description: Inspect diagnostics for a file.
argument-hint: documentUri, optional severities, workspaceRoot, dryRun.
---

# code.lsp_inspectDiagnostics

## Use This Tool

Use this tool when you want compiler or language-server diagnostics for one file: errors, warnings, hints, and summary counts.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  severities?: readonly ("error" | "warning" | "information" | "hint")[];
  dryRun?: boolean;
  runtime?: {
    workspaceRoot?: string;
    workspaceLanguageId?: string;
    waitMs?: number;
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
- Set `dryRun: false` for a real runtime diagnostics fetch.

## Optional Inputs

- `severities` to filter the returned diagnostics.
- `runtime.waitMs` to give the server more time before diagnostics are collected.
- `runtime.workspaceRoot`.

## Runtime Behavior

- In preview mode this tool works on a supplied diagnostics snapshot; in real mode the handler can fetch live diagnostics through the runtime.
- Read-only inspection only; no file mutation.
- Useful before code actions or formatting.

## Returns

- `diagnostics` as diagnostic items.
- `providerCalled` and `dryRun` status.
- Severity-filtered results when `severities` is provided.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/server/router.ts",
  severities: ["error", "warning"],
  dryRun: false,
  runtime: {
    workspaceRoot: "/absolute/workspace",
    waitMs: 250
  }
}
```

## Avoid

- Do not use this for semantic hover or symbol lookup.
- Do not expect diagnostics from languages whose LSP server is only detect-only and missing locally.
