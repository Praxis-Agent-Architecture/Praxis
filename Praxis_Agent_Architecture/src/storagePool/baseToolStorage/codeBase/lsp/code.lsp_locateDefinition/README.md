# code.lsp_locateDefinition storage practice

## 目标

这个目录承载 `code.lsp_locateDefinition` 的真实工具实践，不是 model-facing 的 toolSkill。

`baseTools` 入口只负责稳定暴露工具；这里负责 provider practice、共享依赖、真实 LSP runtime 和最佳实践选择。

## 当前结构

```text
openai.ts
anthropic.ts
deepmind.ts
dependencies.ts
bestPractice.ts
runtime.ts
README.md
```

## 来源判断

当前实现不是直接搬运 CLI 源码，也不是 SDK 封装。

实际采用方式：

- 从 Claude Code 2.1.88 的 `tools/LSPTool/` 和 `services/lsp/` 提炼 LSP 实践。
- 从 Codex Rust 提炼 registry / handler / runtime boundary 的边界思想。
- 从 Gemini CLI 提炼 model-facing declaration 与 concrete execution 分离的思想。
- 用 Praxis 自己的 TypeScript 写成 storagePool practice。

Claude Code 是这里唯一有直接 LSP definition 能力的 CLI 来源，因此默认 bestPractice 顺序优先 Anthropic practice。

## 真实可用性

现在这个工具具备真实执行能力。

非 dry-run 调用时，执行顺序是：

```text
injected provider
-> host executor.lsp.locateDefinition
-> storagePool 内置 stdio LSP runtime
```

也就是说：

- 如果上层注入 provider，就使用注入 provider。
- 如果宿主提供 `executor.lsp.locateDefinition`，就走 host executor。
- 如果二者都没有，就走本目录的 `runtime.ts`。

`runtime.ts` 会真实启动语言服务器进程，通过 stdio JSON-RPC 调用：

```text
initialize
initialized
textDocument/didOpen
textDocument/definition
shutdown
exit
```

## 默认支持的语言服务器

内置 runtime 按文件扩展名选择下列 server：

```text
.ts/.tsx/.mts/.cts -> typescript-language-server --stdio
.js/.jsx/.mjs/.cjs -> typescript-language-server --stdio
.py -> pyright-langserver --stdio
.rs -> rust-analyzer
.go -> gopls
```

这些二进制必须已经存在于宿主 PATH 中。否则非 dry-run 调用会返回 provider/runtime 错误。

调用方也可以通过 `runtime.server` 显式传入自定义 LSP server。

## 输入坐标

`line` 和 `character` 使用 LSP 原生的 0-based 坐标。

`target.filePath` 可以是绝对路径，也可以是相对 `workspaceRoot` 的路径。

## 依赖边界

共享依赖集中在 `dependencies.ts`：

- `workspace.read`
- `lsp.server.forTargetLanguage`
- `node.child_process.stdioJsonRpc`
- `host.executor.lsp.locateDefinition`

provider 文件不复制 LSP 进程管理逻辑。真实 stdio runtime 是共享依赖。

## 为什么说明书放在这里

`docs/agentCore/.../baseTools/.../code.lsp_locateDefinition.md` 是 toolSkill / baseTools 入口说明，服务模型可见能力和 agentCore 契约。

本文件说明的是 storagePool 内部真实实践，包括 provider 来源、runtime 选择和依赖条件，所以应放在：

```text
src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/README.md
```

## 验证

当前测试覆盖：

- dry-run 不调用 provider。
- injected provider 能工作。
- host executor 能工作。
- 内置 stdio LSP runtime 能通过一个临时假 LSP server 完整跑通 JSON-RPC 链路。

验证命令：

```bash
node --import tsx --test test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.test.ts
npm run typecheck
```
