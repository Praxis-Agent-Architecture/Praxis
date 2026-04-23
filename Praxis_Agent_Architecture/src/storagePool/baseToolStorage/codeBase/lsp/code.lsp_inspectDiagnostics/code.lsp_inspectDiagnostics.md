---
description: Inspect LSP diagnostics captured from publishDiagnostics notifications or supplied snapshots.
argument-hint: workspaceRoot, documentUri or target.filePath, optional severities/filter.
---

# code.lsp_inspectDiagnostics

## Summary

Inspect LSP diagnostics captured from publishDiagnostics notifications or supplied snapshots. Use this tool when an agent needs LSP-backed semantic information while keeping the baseTool boundary stable and auditable.

## Parameters

- Provide the workspace root and target document. Prefer a concrete file path when the runtime must open a file.
- Provide the position, range, action, filters, or formatting options required by this tool.
- Pass `languageId` when extension-based detection may be ambiguous.
- Keep write-like operations as preview-only unless a higher layer explicitly applies the returned edit plan.

## Body

Resolve the target language through `toolDependency/lspDependencyResolver.ts`. The shared runtime consumes the resolved executable from `toolDependency` and talks to the language server over stdio JSON-RPC. Provider files in this folder record the OpenAI, Anthropic, and DeepMind practice sources; `bestPractice.ts` exposes the Praxis-selected entry point.

## Result

Return normalized LSP data, an edit preview, or a guarded plan. Do not write files directly from this skill. Surface dependency gaps as install/probe work for `toolDependency` instead of silently falling back to system-global behavior.

## Verification

Verify that the target file is inside the allowed workspace, that the required LSP dependency is registered, and that the result reports whether it was a dry-run, provider/runtime call, or preview-only edit plan.
