# agentCore baseTools construction memory

This folder records the current target and constraints for building `src/agentCore/agent_executionEngine/basic_toolLayer/baseTools` and `src/storagePool/baseToolStorage`.

## Target

- `baseTools/` is the stable entry layer for the 203 builtin base tools.
- `baseTools/` should hold tool entry contracts, registry lookup, toolSkill references, and the model-visible call boundary.
- `src/storagePool/baseToolStorage/` is where real tool practice implementations are accumulated.
- `src/storagePool/baseToolStorage/` should mirror the 203-tool structure, then replace placeholder tool files with provider practice modules and shared dependencies.
- `toolDependency/`, `storageLogic.ts`, and `baseTool_storagePlane.ts` keep their separate responsibilities:
  - `toolDependency/`: dependency declarations and dependency status management.
  - `storageLogic.ts`: storage write/reuse/expiry/isolation logic for tool materials and results.
  - `baseTool_storagePlane.ts`: governance, exposure, and presentation of storage state.

## Source Priority

When implementing a base tool, research source implementations in this order:

1. CLI source code first.
2. Agent SDK source code second.
3. API SDK source code third.
4. If none contain the needed practice, write a Praxis-native implementation using the official SDK/API conventions as the design language.

The goal is not to copy source code blindly. The goal is to extract the best practice and rewrite it as clean TypeScript in Praxis' own shape.

## Provider Practice Layout

For a given tool, provider differences should live under `src/storagePool/baseToolStorage`, not in the `baseTools` entry file.

Preferred shape for tools with meaningful provider differences:

```text
src/storagePool/baseToolStorage/<family>/<group>/<toolId>/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
```

If a shared dependency is common across providers, keep it in `dependencies.ts` instead of duplicating it in each provider implementation. Example: if OpenAI, Anthropic, and DeepMind variants all need LSP, LSP is a shared dependency, not three separate provider-owned implementations.

## Risk And Permissions

- Risk is intentionally coarse at this layer:
  - `normal`: read-only or non-destructive work.
  - `risky`: modifications, terminal commands, network calls, or state-changing operations.
  - `dangerous`: high-impact destructive actions, device access, credentials, force pushes, background/detached processes, or system-level actions.
- TAP will own finer-grained governance later.
- `permissionHints` are hints only. Do not treat them as the final Raxode permission model.
- Each toolSkill markdown should explicitly state the risk level.

## Registry And Custom Tools

- Builtin tools and custom tools must share the same registry path.
- The current standard layer is:
  - `baseTools/baseToolDefinition.ts`
  - `baseTools/baseToolExecutorPort.ts`
  - `baseTools/baseToolRegistry.ts`
- Custom tools should be allowed to register with `source: "custom"` and then flow through the same dependency, executor, storage, and result path as builtin tools.

## Current Implementation Status

- `baseToolRegistry.ts` currently discovers 203 builtin tools.
- Every discovered builtin tool points at a matching markdown toolSkill document.
- Every discovered builtin tool currently has a coarse risk level and dependency declaration.
- `inputSchema` and `outputSchema` are still `pending-schema` placeholders. Real schemas should be filled while implementing each tool.
- Most current 203 tool files still expose dry-run plans. Real execution should be added through `BaseToolHandler.invoke()` plus `BaseToolExecutorPort`, not by embedding ungoverned side effects directly in each entry file.

## First Provider Practice Sample

`code.lsp_locateDefinition` is the first sample tool moved onto the provider practice shape.

Current shape:

```text
src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  code.lsp_locateDefinition.md
```

Implementation notes:

- `baseTools/codeBase/lsp/code.lsp_locateDefinition.ts` is now a thin stable entrypoint that re-exports the storagePool implementation surface.
- `bestPractice.ts` selects provider practice in Anthropic -> OpenAI -> DeepMind order unless a preferred provider is supplied.
- Anthropic currently has direct CLI evidence from Claude Code 2.1.88 LSPTool.
- OpenAI/Codex and DeepMind/Gemini do not currently expose direct LSP definition tools in the local CLI sources; their practice files route through the shared Praxis host LSP executor.
- Shared LSP dependency declarations live in `dependencies.ts`.
- `BaseToolExecutorPort` now includes `lsp.locateDefinition`, so a host can provide LSP execution directly.
- `src/storagePool/baseToolStorage/codeBase/lsp/_shared/runtime.ts` provides the storagePool-owned stdio JSON-RPC LSP runtime for real fallback execution when no injected provider or host executor is supplied.
- The shared runtime consumes `toolDependency/lspDependencyResolver.ts` instead of owning a separate language-server map.
- The storagePool implementation skill document lives at `src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/code.lsp_locateDefinition.md`.
- `lspLocateDefinitionHandler` adapts `BaseToolInvokeRequest` into the bestPractice layer and returns a standard `BaseToolInvokeResult`.

The first LSP runtime batch is now connected to the shared stdio JSON-RPC runtime:

- `code.lsp_locateDefinition`
- `code.lsp_locateTypeDefinition`
- `code.lsp_traceReferences`
- `code.lsp_traceImplementations`
- `code.lsp_scanDocumentSymbols`
- `code.lsp_searchWorkspaceSymbols`
- `code.lsp_renameSymbol` as a preview-only workspace edit plan
- `code.lsp_suggestCodeActions` as a non-applying action suggestion surface

The full 16-tool LSP category is now directoryized under the provider-practice layout. The remaining second batch also has `openai.ts`, `anthropic.ts`, `deepmind.ts`, `dependencies.ts`, `bestPractice.ts`, and an English `code.lsp_xxx.md` skill file:

- `code.lsp_applyCodeAction` as a preview-only code action application plan.
- `code.lsp_assistSignature` with shared runtime support for `textDocument/signatureHelp`.
- `code.lsp_completeCode` with shared runtime support for `textDocument/completion`.
- `code.lsp_explainSymbol` with shared runtime support for hover-style symbol context.
- `code.lsp_formatDocument` with shared runtime support for `textDocument/formatting` edit previews.
- `code.lsp_formatRange` with shared runtime support for `textDocument/rangeFormatting` edit previews.
- `code.lsp_inspectDiagnostics` with shared runtime support for capturing `textDocument/publishDiagnostics` notifications.
- `code.lsp_inspectSymbol` with document-symbol snapshot support and shared runtime building blocks.

For these tools, baseTools entry files are thin re-export surfaces and concrete runtime work lives in `src/storagePool/baseToolStorage/codeBase/lsp`.

The LSP category is no longer only a directory/layout sample. It now has a real executable path:

- `baseTools/baseToolRegistry.ts` can now attach builtin `BaseToolHandler`s as well as metadata definitions.
- `baseTools/builtinBaseToolHandlers.ts` currently registers the full 16 LSP handlers as the first executable builtin batch.
- The LSP handlers now expose storagePool skill paths from `src/storagePool/baseToolStorage/.../code.lsp_xxx.md` instead of deriving only from legacy `docs/...`.
- `BaseToolRegistry.lookupHandler(toolId)` now distinguishes:
  - tool not registered
  - tool registered but handler not implemented yet
- All 16 LSP tools now have `BaseToolHandler` coverage:
  - the first 8 read/query tools adapt the existing `LspToolResult`-style core implementations;
  - the second 8 plan-only tools now have handler-level runtime execution paths, while keeping the old dry-run preview/snapshot contracts for compatibility.
- `BaseToolExecutorPort.lsp` now includes a wider LSP host-executor surface:
  - definitions
  - type definitions
  - references
  - implementations
  - document/workspace symbols
  - rename/code action/format previews
  - completion
  - signature help
  - hover-style explainSymbol
  - diagnostics/symbol inspection

`toolDependency/` also moved from plan-only to install-capable for trusted managed dependencies:

- `dependencyInstaller.ts` can now:
  - probe managed bin first
  - probe PATH second
  - execute a trusted managed install recipe
  - re-probe after install
  - persist managed dependency state
- `dependencyManagedState.ts` stores dependency install/probe state under the Praxis managed root.
- `_shared/runtime.ts` now calls `ensureDependencyAvailable(...)` before spawning the selected LSP server.
- workspace-level requests no longer require an explicit `runtime.server`; they can infer the server from workspace markers plus dependency availability.

Each completed LSP tool now has a provider-practice folder:

```text
code.lsp_xxx/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  code.lsp_xxx.md
```

The old flat `code.lsp_xxx.ts` files are currently kept as compatibility/core implementation files while `bestPractice.ts` acts as the new folder-level entry. A later cleanup can move those core implementations into each folder once all LSP tools are converted.

Verification performed:

```bash
node --import tsx --test test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.test.ts
find test/agentCore/agent_executionEngine/basic_toolLayer -type f -name '*.test.ts' -print0 | xargs -0 node --import tsx --test
npm run typecheck
```

## Tool Dependency Source Governance

`toolDependency/` now owns dependency source governance for LSP-style tool dependencies.

Current additions:

```text
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.ts
```

Design decisions:

- Trusted built-in dependency sources installed into the Praxis managed directory do not require TAP approval.
- TAP/governance is only needed for system-global installs, custom sources, sudo, shell profile edits, project-file mutation, or unknown/manual-review recipes.
- `dependencySourceRegistry.ts` records source safety, package manager, executable names, version probes, and managed install recipes.
- `lspDependencyResolver.ts` decides which LSP server is needed from `target.languageId`, `target.filePath`, workspace markers, and shebang/content hints.
- LSP language support is registry-driven and includes TypeScript/JavaScript, Python, Rust, Go, C#, Java, C/C++, Kotlin, Swift, PHP, Shell, YAML, and Markdown.
- `dependencyChecker.ts` can plan probes in Praxis managed bin before PATH.
- `dependencyIterationManager.ts` attaches trusted managed install plans to missing/stale registered dependencies.
- `_shared/runtime.ts` now consumes the LSP resolver for default server selection; explicit `runtime.server` remains available for tests and advanced overrides.
- `_shared/runtime.ts` also exposes runtime helpers for completion, signature help, hover, document formatting, range formatting, code actions, and diagnostics notification capture.
