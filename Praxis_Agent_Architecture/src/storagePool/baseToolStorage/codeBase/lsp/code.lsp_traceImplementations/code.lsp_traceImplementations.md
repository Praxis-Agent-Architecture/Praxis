---
description: Find implementations for a symbol through the Praxis shared LSP runtime.
argument-hint: target.filePath, line, character, workspaceRoot, languageId.
---

# code.lsp_traceImplementations

## Summary

Use this skill when an agent needs implementations for an interface, abstract method, trait, or symbol. It sends `textDocument/implementation` through the shared Praxis stdio LSP runtime.

## Parameters

- `target.filePath`, `target.line`, `target.character`: required source position.
- `target.languageId`: optional language override.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.

## Body

Resolve the language server via `toolDependency`, then call `traceLspImplementations`. The tool is read-only and returns implementation locations only.
