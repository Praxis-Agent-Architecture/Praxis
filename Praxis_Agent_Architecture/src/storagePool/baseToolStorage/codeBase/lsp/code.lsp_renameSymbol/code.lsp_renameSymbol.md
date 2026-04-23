---
description: Preview an LSP rename workspace edit through the Praxis shared LSP runtime.
argument-hint: target.filePath, line, character, newName, workspaceRoot, languageId.
---

# code.lsp_renameSymbol

## Summary

Use this skill when an agent needs an LSP rename plan. It sends `textDocument/rename` through the shared Praxis stdio LSP runtime and returns a workspace edit preview.

## Parameters

- `target.filePath`, `target.line`, `target.character`: required symbol position.
- `newName`: required new symbol name.
- `target.languageId`: optional language override.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.

## Body

This tool must not apply edits directly. It returns an auditable workspace edit plan with `appliedChanges: false`.
