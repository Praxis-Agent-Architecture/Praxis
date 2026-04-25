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

This source priority is also the execution-practice decision chain:

```text
CLI implementation evidence
  -> Agent SDK implementation evidence
  -> API SDK implementation evidence
  -> Praxis-native fallback
```

For the three main provider families, the provider-practice files should make the best available source explicit:

- `anthropic.ts` should primarily learn from Claude Code when Claude Code has a real tool implementation.
- `openai.ts` should primarily learn from Codex when Codex has a real tool implementation.
- `deepmind.ts` should primarily learn from Gemini CLI when Gemini CLI has a real tool implementation.
- If a provider CLI does not expose the exact tool, use that provider's closest Agent SDK or API SDK practice, then document why Praxis routes through a shared host/runtime executor instead.

The provider-practice layer exists so Praxis can adapt to Codex, Claude Code, and Gemini CLI style differences without changing the stable `baseTools` entrypoint. Model/provider routing should choose a practice surface, but actual side effects still go through the Praxis runtime executor and governance chain.

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

Each provider practice file should answer three questions:

- Which upstream implementation or SDK convention is the source of the practice?
- Does that source support the tool directly, or is Praxis adapting the closest available execution pattern?
- Which Praxis runtime/provider dependency actually performs the work?

This keeps provider routing meaningful: the model-facing practice can follow Codex, Claude Code, or Gemini CLI conventions, while the real invocation remains mounted through the same `BaseToolHandler` and `BaseToolExecutorPort` path.

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

## First Shell Provider Practice Sample

`shell.commandExecution` is the first shell tool moved onto the provider-practice shape.

Current shape:

```text
src/storagePool/baseToolStorage/shellBase/_shared/baseToolAdapter.ts
src/storagePool/baseToolStorage/shellBase/shellExecution/shell.commandExecution/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  core.ts
  shell.commandExecution.md
```

Implementation notes:

- `baseTools/shellBase/shellExecution/shell.commandExecution.ts` is now a thin stable entrypoint that re-exports the storagePool implementation surface.
- `planShellCommandExecution` remains compatible with the existing dry-run plan contract.
- `executeShellCommand` is the new provider-backed primitive. It calls a provider only when `context.dryRun === false`.
- The shell tool does not own approval, sandbox, session, process lifecycle, or output ownership policy. Those stay in runtime governance and runtime execution surfaces.
- `bestPractice.ts` adapts `BaseToolExecutorPort.shell.run` into the command execution provider and exposes `shellCommandExecutionHandler`.
- `builtinBaseToolHandlers.ts` now registers `shell.commandExecution`, so `BaseToolRegistry.lookupHandler("shell.commandExecution")` resolves successfully.
- The shell practice contract now mirrors LSP more closely: provider practice files expose `createProvider(...)`, `selectShellCommandExecutionPractice(...)` returns `providerName`, `practice`, and `provider`, and dependency declarations use `satisfies readonly BaseToolDependencyDeclaration[]`.
- A registry-level invocation test verifies the unified mount path: `createBaseToolRegistry().lookupHandler("shell.commandExecution").handler.invoke(...)` can call a runtime-supplied `executor.shell.run`.

`shell.invocationExecution` and `shell.scriptExecution` now follow the same shell provider-practice standard.

Current shape:

```text
src/storagePool/baseToolStorage/shellBase/shellExecution/shell.invocationExecution/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  core.ts
  shell.invocationExecution.md

src/storagePool/baseToolStorage/shellBase/shellExecution/shell.scriptExecution/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  core.ts
  shell.scriptExecution.md
```

Implementation notes:

- Both `baseTools/shellBase/shellExecution/shell.invocationExecution.ts` and `shell.scriptExecution.ts` are now thin explicit re-export entrypoints.
- Both tools keep their old dry-run planner contracts and add provider-backed execution functions:
  - `executeShellInvocation`
  - `executeShellScript`
- Both tools register executable handlers in `builtinBaseToolHandlers.ts`, so the registry resolves:
  - `lookupHandler("shell.invocationExecution")`
  - `lookupHandler("shell.scriptExecution")`
- `shell.invocationExecution` normalizes a structured invocation object, including argv, cwd, timeout, stdin, and env metadata. `stdin` must be a string when supplied; malformed runtime JSON is rejected before provider dispatch.
- The v1 host executor path for `shell.invocationExecution` rejects env overrides as `PROVIDER_UNAVAILABLE` because `BaseToolExecutorPort.shell.run` does not yet expose an `env` field. Injected custom providers may still support env overrides directly.
- `shell.scriptExecution` maps scripts into the existing v1 shell executor shape:
  - `sh`, `bash`, `zsh`, and `fish` use `<language> -c <script>`.
  - `unknown` uses `sh -c <script>`.
  - `powershell` uses `pwsh -NoProfile -Command <script>`.
  - `stdin` must be a string when supplied; malformed runtime JSON is rejected before provider dispatch.
- Both tools keep approval, sandbox, sudo, session, background process, and output-stream ownership out of baseTools. Runtime and TAP still own those policies.
- Real smoke has verified both tools through the unified registry handler path with a runtime-supplied executor around `printf`.

The first shell generation batch now follows the same provider-practice standard:

```text
src/storagePool/baseToolStorage/shellBase/shellGeneration/shell.argumentAssembly/
src/storagePool/baseToolStorage/shellBase/shellGeneration/shell.commandGeneration/
src/storagePool/baseToolStorage/shellBase/shellGeneration/shell.executionGuard/
src/storagePool/baseToolStorage/shellBase/shellGeneration/shell.invocationConstruction/
src/storagePool/baseToolStorage/shellBase/shellGeneration/shell.scriptGeneration/
```

Implementation notes:

- All five `baseTools/shellBase/shellGeneration/shell.*.ts` entry files are thin explicit re-export surfaces.
- All five storage folders include `core.ts`, `bestPractice.ts`, `dependencies.ts`, provider-practice metadata files, and practical toolSkill markdown.
- The batch is registered in `builtinBaseToolHandlers.ts`:
  - `shell.argumentAssembly`
  - `shell.commandGeneration`
  - `shell.executionGuard`
  - `shell.invocationConstruction`
  - `shell.scriptGeneration`
- These generation tools are pure/dry-run primitives. They do not own approval, sandbox, sudo policy, process lifecycle, or shell execution.
- Runtime JSON boundary hardening was added for malformed executable, argv, command, generatedCommand, guard, commands, and environment shapes so bad input returns classified errors instead of raw `TypeError`.
- A shellGeneration registry test verifies `createBaseToolRegistry().lookupHandler(...).handler.invoke(...)` for the full generation chain.
- The batch is now provider-backed in the same architectural sense as shellExecution/LSP, while remaining side-effect free:
  - `dependencies.ts` defines provider/dependency/practice contracts.
  - `anthropic.ts`, `openai.ts`, and `deepmind.ts` expose `createProvider(...)`.
  - `bestPractice.ts` selects `providerName + practice + provider` and invokes the selected provider.
  - injected providers are tested and called through the bestPractice layer.
  - default provider functions route to the deterministic Praxis core implementation.
- CLI-first evidence is now represented in provider metadata:
  - Anthropic practices reference Claude Code BashTool and its shell permission/safety flow.
  - OpenAI practices reference Codex Rust shell payload, handler, sandboxing, and approval flow.
  - DeepMind practices reference Gemini CLI shell invocation, shell-utils, and confirmation/policy flow.
- Additional regression tests cover provider selection, injected provider calls, registry-level malformed JSON handling, and core malformed JSON no-throw cases.

Shell baseTool rollout standard:

- Shell tools should mirror the LSP provider-practice layout unless there is a documented reason not to:

```text
src/storagePool/baseToolStorage/shellBase/<group>/<toolId>/
  openai.ts
  anthropic.ts
  deepmind.ts
  dependencies.ts
  bestPractice.ts
  core.ts
  <toolId>.md
```

- The matching `baseTools/shellBase/<group>/<toolId>.ts` file should stay as the stable model/runtime entrypoint and explicitly re-export:
  - public core types and descriptors
  - the dry-run compatibility function if one already exists
  - the provider-backed best-practice function
  - `BaseToolDefinition`
  - `BaseToolHandler`
  - the provider practice selection type/function
- Do not leave the entrypoint as a bare `export *`; it must show the intended public surface the same way the directoryized LSP entries do.
- `dependencies.ts` owns the provider-practice contract for that tool:
  - `PracticeProviderName`
  - `Dependencies`
  - `ProviderPractice`
  - dependency declarations using `satisfies readonly BaseToolDependencyDeclaration[]`
  - helper functions that adapt `BaseToolExecutorPort` into the tool provider
- Each `anthropic.ts`, `openai.ts`, and `deepmind.ts` practice file should export provider metadata plus `createProvider(...)`.
- `bestPractice.ts` should select practices in Anthropic -> OpenAI -> DeepMind order unless `preferredProvider` is supplied, and its selection result should include:
  - `providerName`
  - `practice`
  - `provider`
- `core.ts` owns primitive normalization, dry-run compatibility, provider dispatch, public-safe errors, audit events, and provider-called output flags.
- `core.ts` must defensively validate runtime JSON input shapes instead of trusting TypeScript-only types. Malformed model/runtime inputs must return public-safe classified errors, not throw raw `TypeError`s.
- When one tool wraps or delegates to another primitive, harden both layers. Example: `shell.invocationExecution` delegates command/argv/cwd validation to `shell.commandExecution`, so the shared command core also needs malformed JSON regression tests.
- Runtime JSON regression tests should include non-string scalar fields, null objects, non-array argv values, malformed env entries, invalid cwd values, invalid stdin values, and invalid timeout values where the tool accepts those fields.
- `core.ts` must not implement approval, sandbox, sudo policy, long-running session ownership, background process management, or output-stream ownership. Those are runtime/TAP responsibilities.
- Real shell execution is allowed only through runtime-supplied providers such as `BaseToolExecutorPort.shell.run`, or through injected test providers.
- If `context.dryRun !== false`, provider dispatch must not happen.
- If runtime guard says denied, provider dispatch must not happen.
- If `context.dryRun === false` and no provider exists, return a public-safe provider-unavailable error instead of falling back to hidden local execution.
- The storage toolSkill markdown should follow the LSP practical style:
  - frontmatter with `description` and `argument-hint`
  - `Use This Tool`
  - `Call Shape`
  - `Required Inputs`
  - `Optional Inputs`
  - `Runtime Behavior`
  - `Returns`
  - `Example`
  - `Avoid`

Shell baseTool acceptance tests:

- Keep the old dry-run planner tests passing when replacing a flat shell file with a directoryized implementation.
- Add direct core tests for dry-run no-provider-call, provider call when `dryRun: false`, provider unavailable, governance denial, and provider failure mapping.
- Add a handler test that invokes the exported `shellXxxHandler` through `BaseToolInvokeRequest` and a fake `executor.shell`.
- Add a registry-level test that calls `createBaseToolRegistry().lookupHandler(toolId).handler.invoke(...)`.
- Add at least one non-mutating live smoke when practical, using the registry handler and a runtime-supplied executor around a harmless command such as `printf`.
- After each shell conversion, run:

```bash
npm run typecheck
node --import tsx --test test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/<group>/<toolId>.test.ts
find test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase -type f -name '*.test.ts' -print0 | xargs -0 node --import tsx --test
npm run test:agentCore
```

Rollout order for the remaining shell tools:

1. Pure/near-pure guard and generation tools:
   - `shell.commandValidation`
   - `shell.executionGuard`
   - `shell.invocationConstruction`
2. Observation/result tools that consume runtime-provided material:
   - `shell.outputCapture`
   - `shell.exitCodeChecking`
   - `shell.runtimeObservation`
3. Foreground process primitives:
   - `shell.processSpawning`
   - `shell.foregroundExecution`
4. Stateful or high-risk shell tools:
   - background execution
   - detached execution
   - interactive control
   - stdin feeding
   - prompt handling
   - session/process/resource management

Stateful or high-risk shell tools should wait until the runtime-side session/process/output ownership contracts are ready. Do not make baseTools invent those policies locally.

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
