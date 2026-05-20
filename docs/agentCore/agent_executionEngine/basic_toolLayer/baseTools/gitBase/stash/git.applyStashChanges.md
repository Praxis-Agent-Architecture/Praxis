# git.applyStashChanges

> 对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/gitBase/stash/git.applyStashChanges.ts`
> 对应实现：`src/storagePool/baseToolStorage/gitBase/stash/git.applyStashChanges/`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/gitBase/stash`。
- 当前入口文件：`git.applyStashChanges.ts`。
- storage 实现目录：`src/storagePool/baseToolStorage/gitBase/stash/git.applyStashChanges/`。
- runtime 入口：`BaseToolExecutorPort.git.runGit`。

## 2. 文件职责

`git.applyStashChanges` 提供 Git 基础工具 / stash 操作 中的“应用 stash”基础能力原语。

它的职责是把“把已有 stash 应用回工作区”做成 fixed-action baseTool：入口层只暴露稳定类型、planner、handler 和 definition；storage core 负责 JSON 校验、固定 argv、scope/permission/governance 检查、risk metadata、provider 调用和结果解析；runtime 负责真实本机 Git 进程。

该工具不是 `git.execute`。模型不能提供任意 Git 子命令，也不能把 stash apply 请求改走 `shell.commandExecution`。

## 2.1 文件名语义拆解

- `git`：所属 baseTool family。
- `stash`：Git stash 能力分组。
- `Changes`：应用指定 stash entry 到工作区。
- 工程含义：上层通过统一 `BaseToolHandler.invoke()` 调用，底层只允许 `git stash apply` 的固定动作。

## 3. 目录语义

- `baseTools/gitBase/stash/git.applyStashChanges.ts`：稳定公开入口，保持薄 re-export。
- `storagePool/baseToolStorage/gitBase/stash/git.applyStashChanges/core.ts`：契约、校验、固定 argv、治理、provider dispatch 和解析。
- `bestPractice.ts`：把 `BaseToolInvokeRequest` 适配到 storage core。
- `dependencies.ts`：声明并创建 runtime git provider。
- `anthropic.ts`、`openai.ts`、`deepmind.ts`：记录三家实践映射，统一落到 fixed-action gitBase。
- `git.applyStashChanges.md`：operational toolSkill 文档。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / stash 操作。
- 核心目的：提供 Git 基础工具 / stash 操作 中的“应用 stash”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 支持把已有 stash entry 应用到当前工作区。
- 固定真实 Git argv：`git stash apply [--index] <stashRef>`。
- 支持默认 `stash@{0}`，也支持安全的显式 `stashRef`。
- 支持 `reinstateIndex`，通过 `--index` 恢复 index 状态。
- 返回 `runtimeEntry`、`gitArgs`、`commandPreview`、`risk`、`permissionsRequired`、`providerCalled` 和 `resultEnvelope`。
- 保留 TAP 可继续包装的审批、审计、权限和风险字段。

## 6. 输入边界

调用形状：

```json
{
  "target": {
    "repositoryPath": "/repo/project",
    "stashRef": "stash@{0}",
    "reinstateIndex": false
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
- `target.stashRef` 默认为 `stash@{0}`，禁止空白、NUL 和 leading dash。
- `target.reinstateIndex` 为 true 时追加 `--index`。
- `context.grantedPermissions` 如存在，必须覆盖 `git:read`、`git:write`、`filesystem:read`、`filesystem:write`。
- `dryRun:false` 必须同时带 affirmative guard。

## 7. 输出边界

- 成功 dry-run：只返回命令计划，`providerCalled:false`，`executionBlocked:true`。
- 成功真实执行：返回 `dryRun:false`、`providerCalled:true`、`exitCode`、`stdout`、`stderr`。
- `resultEnvelope` 至少包含 stashRef、reinstateIndex、stdout/stderr 行数和 `appliedHint`。
- 输出只暴露 public-safe 字段，不要求上层读取 provider 原始结构。

## 8. 错误边界

- `MISSING_REPOSITORY_PATH`：缺少仓库路径。
- `INVALID_CONTEXT` / `INVALID_STASH_REF` / `INVALID_TIMEOUT`：输入形状错误。
- `SCOPE_REJECTED`：仓库 scope 越界。
- `PERMISSION_DENIED`：权限不足。
- `GOVERNANCE_REJECTED`：真实执行缺少 guard。
- `PROVIDER_UNAVAILABLE`：runtime 没有提供 `BaseToolExecutorPort.git.runGit`。
- `PROVIDER_REJECTED`：provider 失败并被映射为 public-safe error。

## 9. 依赖对象

- `runtime.execEngine.git.runGit`：真实 Git 进程执行端口。
- `runtime.governancePlane`：guard、权限、scope 和审计上下文。
- `runtime.contractSurface`：稳定 `BaseToolInvokeRequest -> BaseToolInvokeResult` 契约。
- TAP approval/governance bridge：更上层用户审批和风险呈现。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("git.applyStashChanges")`。
- `BaseToolHandler.invoke()`。
- `scripts/agentCore_Agent_Test/agentcore_tool_lab.ts` 的 `runMountedGitBaseTool(...)`。
- 后续 TAP 高级工具系统可基于该原语组合 stash 保存/应用/弹出工作流。

## 11. 不应该做什么

- 不要新增大而全 `git.execute`。
- 不要在 lab/runtime 根据模型输入自行拼 `git stash apply`。
- 不要绕开 `BaseToolExecutorPort.git.runGit` 直接启动 host process。
- 不要无 guard 执行真实 workspace mutation。
- 不要把 stash pop 混入本工具；pop 会在成功后删除 stash entry，应作为独立 fixed-action 工具推进。

## 12. 最小实现建议

- 入口文件保持显式 re-export。
- storage `core.ts` 负责 unknown JSON 校验、固定 argv、权限、治理、scope、parser 和 public-safe error。
- `dependencies.ts` 只做 `BaseToolExecutorPort.git.runGit` 适配，不引入高层 `executor.git.applyStashChanges`。
- `bestPractice.ts` 负责 handler 适配、practice audit metadata 和 tool definition。
- lab 挂载必须走 registry handler，不能退化成 direct `runProcess("git", ...)`。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不泄漏 raw `TypeError`。
- `dryRun:false` 无 guard 返回 `GOVERNANCE_REJECTED`。
- 有 guard 但无 provider 返回 `PROVIDER_UNAVAILABLE`。
- fake provider 收到精确 argv 并能解析 stdout/stderr。
- provider failure 不泄漏内部路径/命令细节。
- lab/runtime-chain 断言通过 registry handler 调到 `BaseToolExecutorPort.git.runGit`。
- `npm run lab:agentCore:tools` 用户视角 smoke 应能真实应用 stash 内容。

## 14. 与系统链路的关系

完整链路：

```text
用户自然语言或 /tool
  -> lab/tool runner
  -> createBaseToolRegistry().lookupHandler("git.applyStashChanges")
  -> handler.invoke(...)
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.git.runGit
  -> host git process
  -> BaseToolInvokeResult
```

这个工具层提供词典和入口，并对 runtime 调用形态做出严格规范；真实本机 Git 执行归 runtime 管理。
