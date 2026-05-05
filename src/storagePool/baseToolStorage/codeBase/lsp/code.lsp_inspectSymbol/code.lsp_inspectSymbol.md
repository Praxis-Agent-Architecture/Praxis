---
description: Inspect symbol metadata in one file by position or exact symbol name.
argument-hint: documentUri, target.position or target.symbolName, workspaceRoot, dryRun.
---

# code.lsp_inspectSymbol

## Use This Tool

Use this tool when you want a precise symbol snapshot inside one file: the matching symbol, its kind, range, and related candidates.

## Call Shape

Pass one object with this shape:

```ts
{
  documentUri: string;
  target: {
    position?: {
      line: number;
      character: number;
    };
    symbolName?: string;
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
- At least one of `target.position` or `target.symbolName`.
- `dryRun: false` for a real runtime-based inspection.

## Optional Inputs

- Both `target.position` and `target.symbolName` together to narrow results further.
- `runtime.workspaceRoot`.

## Runtime Behavior

- Read-only symbol inspection.
- Internally this is built on document symbol data.
- Good when you need the exact symbol shape before a rename or explanation step.

## Returns

- `candidates` as matching symbol entries.
- `providerCalled` and `dryRun` status.
- The exact target echoed back in `target`.

## Example

```ts
{
  documentUri: "/absolute/workspace/src/domain/user.ts",
  target: {
    position: {
      line: 18,
      character: 7
    }
  },
  dryRun: false,
  runtime: {
    workspaceRoot: "/absolute/workspace"
  }
}
```

## Avoid

- Do not call this with neither `position` nor `symbolName`.
- Do not use this for workspace-wide name search.
