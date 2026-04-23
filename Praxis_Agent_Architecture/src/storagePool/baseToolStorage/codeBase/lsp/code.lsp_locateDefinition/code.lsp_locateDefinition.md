---
description: 使用 Praxis 内置 LSP runtime 定位符号定义位置。
argument-hint: target.filePath、line、character、workspaceRoot、languageId、可选 runtime.server。
---

# code.lsp_locateDefinition

## 摘要

这个 skill 描述 `code.lsp_locateDefinition` 的真实执行方式：根据一个源码位置，通过 LSP 的 `textDocument/definition` 请求返回符号定义位置。

它属于 `src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition` 的真实工具实践层，不是 `docs/agentCore/.../baseTools/...` 里的 model-facing toolSkill。baseTools 入口只负责稳定暴露工具；本目录负责 provider practice、共享依赖、LSP runtime 和 bestPractice 选择。

## 参数填写指南

调用时优先提供这些字段：

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

填写规则：

- `target.filePath` 必填，可以是绝对路径，也可以相对 `workspaceRoot`。
- `target.line` 和 `target.character` 必填，使用 LSP 原生 0-based 坐标。
- `target.languageId` 可选；如果提供，它优先于文件扩展名。
- `context.workspaceRoot` 或 `runtime.workspaceRoot` 用于确定 workspace 和相对路径。
- `context.dryRun !== false` 时只返回 dry-run envelope，不调用 provider/runtime。
- `runtime.server` 用于测试或高级覆盖；正常情况下应让 toolDependency 解析目标语言并提供 server。

## 正文

执行优先级：

```text
injected provider
-> host executor.lsp.locateDefinition
-> storagePool 内置 stdio LSP runtime
```

真实 runtime 会启动语言服务器进程，通过 stdio JSON-RPC 执行：

```text
initialize
initialized
textDocument/didOpen
textDocument/definition
shutdown
exit
```

依赖判断不由本文件硬编码。默认 server 选择来自：

```text
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.ts
```

依赖源和安装计划来自：

```text
src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts
```

也就是说，工具处理的目标文件决定需要哪个 LSP：

```text
target.languageId
-> target.filePath extension
-> workspace markers
-> shebang/content hints
```

如果缺少对应 LSP server，正常路径是由 `toolDependency` 生成 Praxis managed install plan。可信内置源安装到 Praxis managed directory 时不需要 TAP 审批；只有 system-global、custom-source、sudo、shell profile 修改等越界场景才进入治理确认。

## Provider Practice

本工具保留三家 provider practice 文件：

```text
openai.ts
anthropic.ts
deepmind.ts
dependencies.ts
bestPractice.ts
runtime.ts
```

当前结论：

- Anthropic/Claude Code 2.1.88 是直接 LSP 实践来源，尤其是 `tools/LSPTool/` 与 `services/lsp/`。
- Codex Rust 提供 registry、handler、runtime boundary 的实践。
- Gemini CLI 提供 model-facing declaration 与 concrete execution 分离的实践。
- Praxis 不搬运三家源码，而是提炼实践后重写成自己的 TypeScript runtime。

## 返回结果

成功时返回标准 LSP 工具 envelope：

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

失败时返回 public-safe error，常见类型包括：

- `MISSING_FILE_PATH`
- `INVALID_POSITION`
- `SCOPE_REJECTED`
- `GOVERNANCE_REJECTED`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_REJECTED`

## 验证命令

```bash
node --import tsx --test test/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.test.ts
npm run typecheck
```
