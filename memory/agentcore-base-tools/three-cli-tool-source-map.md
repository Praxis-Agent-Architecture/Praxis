# Three CLI tool source map

Local source root:

```text
/home/proview/Desktop/three
```

Use this map when extracting CLI-first best practices for `src/storagePool/baseToolStorage`.

## Claude Code 2.1.88

Root:

```text
/home/proview/Desktop/three/claude_code_2_1_88
```

Important tool locations:

- `tools/`: concrete tool implementations, usually one folder per tool.
- `tools/*/*Tool.ts` or `tools/*/*Tool.tsx`: primary tool entry implementations.
- `tools/*/prompt.ts`: model-facing tool instructions and prompt text.
- `tools/*/UI.tsx`: CLI/TUI rendering for tool use and results.
- `services/tools/toolExecution.ts`: core tool execution path; finds tool by name, validates input with schema, checks permission, executes, maps result.
- `services/tools/StreamingToolExecutor.ts`: streaming tool execution orchestration.
- `services/tools/toolOrchestration.ts`: batches/parallelizes/sequences tool use.
- `services/tools/toolHooks.ts`: pre/post tool hooks and permission-related flow.
- `services/tools/permissions.ts` or permission helpers under tool folders: approval behavior.
- `services/lsp/`: LSP service layer.
- `services/mcp/` and `tools/MCPTool`, `tools/ListMcpResourcesTool`, `tools/ReadMcpResourceTool`, `tools/McpAuthTool`: MCP practices.
- `tools/BashTool/`: shell execution, shell permission, sandbox/security/path/read-only validation.
- `tools/PowerShellTool/`: PowerShell-specific execution and permission handling.
- `tools/FileReadTool`, `tools/FileEditTool`, `tools/FileWriteTool`: file read/edit/write practices.
- `tools/GlobTool`, `tools/GrepTool`: filesystem search practices.
- `tools/LSPTool`: LSP tool practices.
- `tools/WebFetchTool`, `tools/WebSearchTool`: web fetch/search practices.
- `tools/AgentTool`, `tasks/*`, `tools/shared/spawnMultiAgent.ts`: subagent and multi-agent practices.
- `tools/SkillTool`, `skills/`, `components/skills`: skill invocation and skill UX practices.

Observed design signals:

- Tool files commonly expose a schema, name, prompt/description, permission checks, result mapping, and UI rendering.
- Claude Code is a strong source for shell/file/search/LSP/MCP/agent tool execution flow because the implementation is TypeScript and close to our target runtime shape.
- Use it as the first source for Anthropic practice, but rewrite into Praxis TS instead of copying internal structure wholesale.

## Codex Rust 0.123.0

Root:

```text
/home/proview/Desktop/three/codex_rust_0_123_0
```

Important tool locations:

- `codex-rs/core/src/tools/`: primary Codex tool system.
- `codex-rs/core/src/tools/spec.rs`: model-facing tool spec construction.
- `codex-rs/core/src/tools/registry.rs`: handler registry.
- `codex-rs/core/src/tools/router.rs`: tool routing.
- `codex-rs/core/src/tools/orchestrator.rs`: orchestration around tool execution.
- `codex-rs/core/src/tools/context.rs`: tool context.
- `codex-rs/core/src/tools/events.rs`: tool event structures.
- `codex-rs/core/src/tools/handlers/`: concrete handlers.
  - `shell.rs`: shell handler.
  - `apply_patch.rs`: patch application.
  - `list_dir.rs`: directory listing.
  - `mcp.rs`, `mcp_resource.rs`: MCP calls and resource access.
  - `request_user_input.rs`, `request_permissions.rs`: user input and permission flows.
  - `view_image.rs`: image view behavior.
  - `tool_search.rs`, `tool_suggest.rs`: tool discovery/suggestion.
  - `multi_agents*`: multi-agent tools.
  - `js_repl.rs`: JS REPL handler.
  - `unified_exec.rs`: unified execution handler.
- `codex-rs/core/src/tools/runtimes/`: runtime backends.
  - `runtimes/shell.rs`
  - `runtimes/shell/zsh_fork_backend.rs`
  - `runtimes/shell/unix_escalation.rs`
  - `runtimes/apply_patch.rs`
  - `runtimes/unified_exec.rs`
- `codex-rs/core/src/tools/sandboxing.rs`: sandbox-related behavior.
- `codex-rs/core/src/tools/network_approval.rs`: network approval behavior.
- `codex-rs/exec/src/exec_events.rs`: JSONL event shape for command/MCP/collab tool calls.
- `codex-rs/exec/src/*`: noninteractive exec event processing and output formats.
- `codex-rs/mcp-server/src/tool_handlers/`: MCP server-side tool handler entry.
- `codex-rs/app-server-protocol/schema/typescript` and `schema/json`: generated protocol/schema artifacts.
- `codex-rs/apply-patch/`, `codex-rs/file-search/`, `codex-rs/git-utils/`, `codex-rs/shell-command/`: standalone utilities relevant to specific baseTool families.

Observed design signals:

- Codex is the best OpenAI CLI source for tool spec generation, registry/router separation, shell/runtime separation, sandboxing, approval, MCP/deferred tool handling, and JSONL event surfaces.
- It is Rust-first. Praxis should translate the design into TypeScript rather than trying to mirror Rust module structure.
- Codex is especially useful for shell, apply_patch, MCP, multi-agent, permission request, user input, image viewing, sandbox/network approval, and event/result envelope design.

## Gemini CLI 0.39.0

Root:

```text
/home/proview/Desktop/three/gemini_cli_0_39_0
```

Important tool locations:

- `packages/core/src/tools/`: primary Gemini CLI tool implementation layer.
- `packages/core/src/tools/tools.ts`: common tool abstractions.
- `packages/core/src/tools/tool-registry.ts`: registry.
- `packages/core/src/tools/definitions/`: model-facing function declarations and tool set resolution.
  - `definitions/coreTools.ts`
  - `definitions/base-declarations.ts`
  - `definitions/resolver.ts`
  - `definitions/types.ts`
  - `definitions/model-family-sets/*`
- `packages/core/src/tools/read-file.ts`, `write-file.ts`, `edit.ts`, `ls.ts`, `glob.ts`, `grep.ts`, `ripGrep.ts`: filesystem/code tools.
- `packages/core/src/tools/shell.ts`, `shellBackgroundTools.ts`: shell and background shell tools.
- `packages/core/src/tools/web-fetch.ts`, `web-search.ts`: web tools.
- `packages/core/src/tools/mcp-client.ts`, `mcp-tool.ts`, `mcp-client-manager.ts`: MCP discovery and callable tool wrappers.
- `packages/core/src/tools/confirmation-policy.test.ts` and related confirmation flow: permission/confirmation practices.
- `packages/core/src/sandbox/`: sandbox implementations.
- `packages/core/src/policy/`: policy layer.
- `packages/core/src/context/`: context and context pipeline.
- `packages/core/src/skills/` and `packages/core/src/skills/builtin`: skill system.
- `packages/cli/src/commands`, `packages/cli/src/commands/mcp`, `packages/cli/src/commands/skills`: CLI command surface.
- `packages/sdk/src`: SDK-facing entry layer.

Observed design signals:

- Gemini CLI is the strongest DeepMind/Gemini source for TypeScript tool classes, model-family tool declarations, tool registry, MCP discovery, confirmation policy, shell background handling, and filesystem tools.
- The `definitions/` subtree is important because it separates model-facing declarations from concrete tool execution.
- Use Gemini CLI first for DeepMind practice, before falling back to Agent SDK or API SDK.

## Praxis Mapping Notes

- CLI source has priority over Agent SDK and API SDK.
- For each Praxis tool, compare CLI practice first:
  1. Claude Code for Anthropic.
  2. Codex Rust for OpenAI.
  3. Gemini CLI for DeepMind.
- If a CLI lacks the needed pattern, fall back to that provider's Agent SDK, then API SDK.
- Shared dependencies belong in `dependencies.ts` under the tool's `baseToolStorage` folder.
- Provider-specific implementations should only contain provider-specific practice logic.
- `bestPractice.ts` should choose the best current implementation or fallback order after comparing provider practices.
- `baseTools/` entry files should remain stable entrypoints that call the selected `bestPractice`, not accumulate provider-specific code.
