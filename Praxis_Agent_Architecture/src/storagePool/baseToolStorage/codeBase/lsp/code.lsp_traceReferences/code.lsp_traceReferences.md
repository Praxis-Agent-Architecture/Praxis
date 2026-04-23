---
description: Find references for a symbol through the Praxis shared LSP runtime.
argument-hint: target.filePath, line, character, includeDeclaration, workspaceRoot, languageId.
---

# code.lsp_traceReferences

## Summary

Use this skill when an agent needs all references for the symbol at a source position. It sends `textDocument/references` through the shared Praxis stdio LSP runtime.

## Parameters

- `target.filePath`, `target.line`, `target.character`: required symbol position.
- `includeDeclaration`: include the symbol declaration when supported.
- `target.languageId`: optional language override.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.

## Body

Resolve dependencies through `toolDependency`, then call `traceLspReferences`. The tool is read-only and returns reference locations only.
