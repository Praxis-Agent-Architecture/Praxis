---
description: Suggest LSP code actions through the Praxis shared LSP runtime without applying edits.
argument-hint: target.filePath, range, diagnostics, only, workspaceRoot, languageId.
---

# code.lsp_suggestCodeActions

## Summary

Use this skill when an agent needs available LSP code actions for a range. It sends `textDocument/codeAction` through the shared Praxis stdio LSP runtime.

## Parameters

- `target.filePath`: required source file.
- `target.range`: required LSP range.
- `diagnostics`: optional diagnostic context.
- `only`: optional action kind filters.
- `target.languageId`: optional language override.

## Body

This tool must not apply edits or commands. It returns action suggestions with `appliesChanges: false`.
