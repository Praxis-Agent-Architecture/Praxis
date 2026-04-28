# git.removeTrackedFile

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.removeTrackedFile.ts`
> 对应实现：`Praxis_Agent_Architecture/src/storagePool/baseToolStorage/gitBase/file/git.removeTrackedFile/`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/gitBase/file`。
- 当前入口文件：`git.removeTrackedFile.ts`。
- storage 实现目录：`src/storagePool/baseToolStorage/gitBase/file/git.removeTrackedFile/`。
- runtime 入口：`BaseToolExecutorPort.git.runGit`。

## 2. 文件职责

`git.removeTrackedFile` 提供 Git 基础工具 / Git 文件操作 中的“移除已跟踪文件”基础能力原语。

它的职责是把“从 Git index 和可选工作树中移除一个 tracked file”做成 fixed-action baseTool：入口层只暴露稳定类型、planner、handler 和 definition；storage core 负责 JSON 校验、固定 argv、scope/permission/governance 检查、risk metadata、provider 调用和结果解析；runtime 负责真实本机 Git 进程。

该工具不是 `git.execute`。模型不能提供任意 Git 子命令，也不能把文件移除请求改走 `shell.commandExecution`。TAP 仍然可以在上层继续包装审批、风险提示和高级工具编排。

## 2.1 文件名语义拆解

- `git`：所属 baseTool family。
- `file`：Git 文件操作分组。
- `RemoveTrackedFile`：通过固定 `git rm` 动作移除已跟踪文件。
- 工程含义：上层通过统一 `BaseToolHandler.invoke()` 调用，底层只允许 `git rm [--cached] [--force] -- <filePath>` 的固定动作。

## 3. 目录语义

- `baseTools/gitBase/file/git.removeTrackedFile.ts`：稳定公开入口，保持薄 re-export。
- `storagePool/baseToolStorage/gitBase/file/git.removeTrackedFile/core.ts`：契约、校验、固定 argv、治理、provider dispatch 和解析。
- `bestPractice.ts`：把 `BaseToolInvokeRequest` 适配到 storage core。
- `dependencies.ts`：声明并创建 runtime git provider。
- `anthropic.ts`、`openai.ts`、`deepmind.ts`：记录三家实践映射，统一落到 fixed-action gitBase。
- `git.removeTrackedFile.md`：operational toolSkill 文档。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 文件操作。
- 核心目的：提供 Git 基础工具 / Git 文件操作 中的“移除已跟踪文件”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 支持移除一个已跟踪文件。
- 固定真实 Git argv：`git rm [--cached] [--force] -- <filePath>`。
- 支持 `keepWorkingTree`，即 `--cached`，只从 index 移除并保留工作树文件。
- 支持 `force`，即 `--force`。
- 返回 `runtimeEntry`、`gitArgs`、`commandPreview`、`risk`、`permissionsRequired`、`providerCalled`、`removesTrackedFile` 和 `resultEnvelope`。
- 保留 TAP 可继续包装的审批、审计、权限和风险字段。

## 6. 输入边界

调用形状：

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "filePath": "src/obsolete.ts",
    "keepWorkingTree": false,
    "force": false
  },
  "context": {
    "dryRun": false,
    "guard": { "allowed": true, "accepted": true },
    "grantedPermissions": ["git:read", "git:write", "filesystem:read", "filesystem:write"],
    "allowedRepositoryRoots": ["/repo"]
  }
}
```

- `target.repositoryPath` 必填，并受 `allowedRepositoryRoots` 限制。
- `target.filePath` 必填，必须是仓库相对路径，禁止绝对路径、`..` 和 NUL。
- `target.keepWorkingTree` 为 `true` 时只需 `filesystem:read`，否则还需要 `filesystem:write`。
- `dryRun:false` 必须带 affirmative guard。

## 7. 输出边界

- `kind` 固定为 `agentCore.basicTool.git.removeTrackedFile`。
- `runtimeEntry.port` 固定为 `BaseToolExecutorPort.git.runGit`。
- `runtimeEntry.allowedSubcommand` 固定为 `rm`。
- `gitArgs` 是 storage core 生成的固定参数，不接收模型拼接。
- `risk` 标明 index mutation、working-tree mutation、是否保留工作树文件。
- `resultEnvelope` 包含 file path、cached-only mode、line counts、removed paths、cached-only paths 和 fallback 计数。

## 8. 错误边界

- `MISSING_REPOSITORY_PATH`：缺少仓库路径。
- `MISSING_FILE_PATH`：缺少目标文件路径。
- `INVALID_CONTEXT`：context、guard、permissions 或 audit metadata 形状不合法。
- `UNSAFE_FILE_PATH`：file path 不是仓库相对路径，或包含路径逃逸。
- `SCOPE_REJECTED`：仓库不在允许 root 中。
- `PERMISSION_DENIED`：缺少 Git 或 filesystem 权限。
- `GOVERNANCE_REJECTED`：真实执行缺少 affirmative guard。
- `PROVIDER_UNAVAILABLE`：runtime 没有挂载 `executor.git.runGit`。
- `PROVIDER_REJECTED`：runtime provider 失败，错误信息保持 public-safe。

## 9. 依赖对象

- `BaseToolExecutorPort.git.runGit`：runtime 拥有真实 Git 进程执行。
- `runtime.governancePlane.toolInvocationGrant`：真实 mutation 执行前的治理授权。
- `git` host binary：由 runtime 解析和执行，storage 不直接 spawn。
- `BaseToolHandler.invoke()`：上层统一调用入口。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("git.removeTrackedFile")`。
- `scripts/agentCore_Agent_Test/agentcore_tool_lab.ts` 的 mounted gitBase runner。
- 未来 TAP 高级工具、mainLoop、stateEngine 和事件暴露层。

## 11. 不应该做什么

- 不应该暴露 `git.execute` 或让模型拼任意子命令。
- 不应该通过 `shell.commandExecution` 代替该工具。
- 不应该在 storage core 中直接 spawn Git。
- 不应该在缺少 guard 时执行 mutation。
- 不应该接受绝对路径、`..` 路径逃逸或 NUL。

## 12. 最小实现建议

- 入口文件保持薄 re-export。
- storage core 先做 JSON、scope、permission、governance 校验。
- dry-run 只返回 fixed argv plan，不调用 provider。
- 真实执行只调用 `BaseToolExecutorPort.git.runGit`，argv 固定为 `rm [--cached] [--force] -- <filePath>`。
- provider failure 只返回 public-safe error，不泄漏 raw path、命令或堆栈。

## 13. 最小测试建议

- dry-run 不调用 provider，并返回固定 argv。
- malformed JSON 不泄漏 `TypeError`。
- unsafe path、scope、permission 都有稳定错误码。
- `dryRun:false` 无 guard 返回 `GOVERNANCE_REJECTED`。
- 有 guard 但无 provider 返回 `PROVIDER_UNAVAILABLE`。
- fake provider 收到精确真实 argv，并解析 stdout。
- lab/runtime-chain 走 registry handler，不落入任意 Git fallback。

## 14. 与系统链路的关系

```text
model tool_call JSON
  -> lab/runtime adapter
  -> createBaseToolRegistry().lookupHandler("git.removeTrackedFile")
  -> BaseToolHandler.invoke()
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.git.runGit
  -> host git process
  -> BaseToolInvokeResult
```

真实调用本质上在 runtime。工具层提供词典、固定动作入口、输入输出契约、风险元数据和 provider 调用形状；runtime 才拥有本机 Git 进程。
