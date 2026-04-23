---
description: List symbols in a document through the Praxis shared LSP runtime.
argument-hint: target.filePath, workspaceRoot, languageId.
---

# code.lsp_scanDocumentSymbols

## Summary

Use this skill when an agent needs classes, functions, variables, and other symbols declared in a file. It sends `textDocument/documentSymbol` through the shared Praxis stdio LSP runtime.

## Parameters

- `target.filePath`: required source file.
- `target.languageId`: optional language override.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.

## Body

Resolve dependencies through `toolDependency`, then call `scanLspDocumentSymbols`. The tool is read-only and returns document symbol data only.
