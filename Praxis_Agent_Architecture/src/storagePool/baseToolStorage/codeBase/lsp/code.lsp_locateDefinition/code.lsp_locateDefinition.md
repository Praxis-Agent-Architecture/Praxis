---
description: Locate a symbol definition through the Praxis shared LSP runtime.
argument-hint: target.filePath, line, character, workspaceRoot, languageId, optional runtime.server.
---

# code.lsp_locateDefinition

## Summary

Use this skill when an agent needs the definition location for the symbol at a source position. It sends `textDocument/definition` through the Praxis shared stdio LSP runtime.

This file is the storagePool implementation skill for `src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition`. The baseTools entrypoint exposes the stable tool surface, while this storagePool directory is the model-visible skill source and owns provider practice, shared dependencies, and bestPractice selection.

## Parameters

Prefer this input shape:

```ts
{
  target: {
    filePath: string;
    line: number;
    character: number;
    languageId?: string;
  };
  context?: {
    workspaceRoot?: string;
    dryRun?: boolean;
    invocationId?: string;
    allowedFilePaths?: readonly string[];
  };
  runtime?: {
    workspaceRoot?: string;
    resolvedServerPath?: string;
    server?: {
      command: string;
      args: readonly string[];
      languageId: string;
      fileExtensions: readonly string[];
    };
  };
}
```

Rules:

- `target.filePath` is required and may be absolute or relative to `workspaceRoot`.
- `target.line` and `target.character` are required 0-based LSP coordinates.
- `target.languageId` is optional and overrides file-extension inference.
- `context.workspaceRoot` or `runtime.workspaceRoot` resolves workspace-relative paths.
- When `context.dryRun !== false`, return only a dry-run envelope.
- `runtime.server` is for tests and advanced overrides; normal execution should let `toolDependency` resolve the language server.

## Body

Execution priority:

```text
injected provider
-> host executor.lsp.locateDefinition
-> storagePool shared stdio LSP runtime
```

The shared runtime starts a language-server process and speaks stdio JSON-RPC:

```text
initialize
initialized
textDocument/didOpen
textDocument/definition
shutdown
exit
```

Dependency resolution is not hard-coded in this skill. Default server selection comes from:

```text
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.ts
```

Dependency source and install-plan governance comes from:

```text
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts
```

The target file decides which LSP server is needed:

```text
target.languageId
-> target.filePath extension
-> workspace markers
-> shebang/content hints
```

If the matching LSP server is missing, `toolDependency` should generate a Praxis-managed install plan. Trusted built-in sources installed into the Praxis managed directory do not require TAP approval; system-global installs, custom sources, sudo, shell-profile edits, or other boundary-crossing actions require governance confirmation.

## Provider Practice

This tool keeps provider-practice files:

```text
openai.ts
anthropic.ts
deepmind.ts
dependencies.ts
bestPractice.ts
../_shared/runtime.ts
```

Current practice source:

- Anthropic / Claude Code 2.1.88 provides the strongest direct LSP practice through `tools/LSPTool/` and `services/lsp/`.
- Codex Rust contributes the registry, handler, and runtime-boundary practice.
- Gemini CLI contributes the model-facing declaration versus concrete execution split.
- Praxis does not copy provider source. It extracts the practice and rewrites it as Praxis TypeScript.

## Result

Success returns a standard LSP tool envelope:

```ts
{
  ok: true,
  toolId: "code.lsp_locateDefinition",
  output: {
    kind: "agentCore.basicTool.lsp.locateDefinition",
    target,
    locations,
    dryRun,
    providerCalled,
    permissionsRequired: ["workspace:read", "lsp:read"],
    unsafeSideEffects: false
  },
  audit,
  events
}
```

Common public-safe failures:

- `MISSING_FILE_PATH`
- `INVALID_POSITION`
- `SCOPE_REJECTED`
- `GOVERNANCE_REJECTED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_REJECTED`

## Verification

```bash
node --import tsx --test test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.test.ts
npm run typecheck
```
