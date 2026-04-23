---
description: Search workspace symbols through the Praxis shared LSP runtime.
argument-hint: query, limit, workspaceRoot, optional runtime.server.
---

# code.lsp_searchWorkspaceSymbols

## Summary

Use this skill when an agent needs symbols across the current workspace. It sends `workspace/symbol` through the shared Praxis stdio LSP runtime.

## Parameters

- `query`: required search query.
- `limit`: optional result cap.
- `context.workspaceRoot` or `runtime.workspaceRoot`: workspace root.
- `runtime.server`: currently required for workspace-level runtime calls.

## Body

Resolve dependencies through `toolDependency`, then call `searchLspWorkspaceSymbols`. The tool is read-only and returns workspace symbol data only.
