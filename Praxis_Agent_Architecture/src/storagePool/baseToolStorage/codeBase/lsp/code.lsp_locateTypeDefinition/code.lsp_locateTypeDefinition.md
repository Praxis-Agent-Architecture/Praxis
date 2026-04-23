---
description: Locate the type definition for a symbol through the Praxis shared LSP runtime.
argument-hint: target.filePath, line, character, workspaceRoot, languageId, optional runtime.server.
---

# code.lsp_locateTypeDefinition

## Summary

Use this skill when an agent needs the type definition of the symbol at a source position. It sends `textDocument/typeDefinition` through the shared Praxis stdio LSP runtime.

## Parameters

- `target.filePath`: required source file.
- `target.line` and `target.character`: required 0-based LSP position.
- `target.languageId`: optional language override.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.
- `runtime.server`: optional explicit LSP server override.

## Body

Resolve the target language through `toolDependency/lspDependencyResolver.ts`, ensure the matching LSP server is available through `toolDependency`, then call `locateLspTypeDefinition`.

The tool is read-only and returns locations. It must not mutate files.
