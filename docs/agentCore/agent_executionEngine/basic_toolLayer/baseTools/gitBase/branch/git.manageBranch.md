# git.manageBranch

> 对应源码：`src/executionEngine/basic_toolLayer/baseTools/gitBase/branch/git.manageBranch.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/gitBase/branch`。
- 当前文件：`git.manageBranch.ts`。
- storage 实现：`src/storagePool/baseToolStorage/gitBase/branch/git.manageBranch/`。

## 2. 文件职责

提供 Git 基础工具 / 分支操作 中的“管理分支”基础能力原语。

它把 list/create/delete/rename/set-upstream 做成固定动作工具：storage 负责参数契约、固定 argv、风险和结果解析，runtime 只通过 `BaseToolExecutorPort.git.runGit` 执行 `{ repositoryPath, args, timeoutMs }`。这里是基础工具原语，不是 TAP 的最终高级工具库；TAP 仍负责更上层审批、组合和专业工具。

## 2.1 文件名语义拆解

- 原始文件名：`git.manageBranch.ts`。
- 命名片段：`git` / `manage` / `Branch`。
- 工程含义：这是 `gitBase` 下 `branch` 分组里的 `manageBranch` 基础工具原语。
- 真实动作：固定为 `git branch`，不提供任意 `git.execute`。

## 3. 目录语义

- 基础工具原语层：提供 Agent 成立所需的底层工具能力，让 TAP 在其上构建更高级工具治理系统。
- Git 基础工具：仓库、分支、暂存、提交、远端、stash 和历史检查。
- branch 分组：只承接分支、checkout、merge、rebase、tag 这些 Git ref/worktree 相关动作。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 分支操作。
- 核心目的：提供 Git 基础工具 / 分支操作 中的“管理分支”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：entry 层只暴露稳定 public surface；真实契约、provider 适配和 runtime git executor 调用在 storagePool。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 通过统一 `BaseToolHandler.invoke()` 暴露 `git.manageBranch`。
- 支持 `list`、`create`、`delete`、`rename`、`set-upstream` 五个固定分支动作。
- 返回 `runtimeEntry`、`risk`、`gitArgs`、`commandPreview`、`providerCalled`、`executionBlocked` 和 `resultEnvelope`。
- 保留 `planGitBranchManagement()` 兼容旧调用方，但真实实现落在 storage canonical 目录。

## 6. 输入边界

- 输入必须是工具调用 JSON，主要字段是 `target.repositoryPath`、`target.action`、`branchName`、`newBranchName`、`startPoint`、`upstream`、`force`。
- `context.allowedRepositoryRoots` 控制仓库作用域，不能由模型提供的路径自动扩权。
- `context.grantedPermissions` 控制 `git:read`、`git:write`、`filesystem:read`、`filesystem:write`。
- 真实 mutation 必须设置 `dryRun:false` 和 affirmative guard。

## 7. 输出边界

- 输出是可给 runtime inspection 和上层模型看的标准工具结果信封。
- 不泄漏 provider 栈、私有路径或 `.git` 内部细节。
- `resultEnvelope` 至少描述 action、branchName、分支列表/当前分支、操作提示，以及 create/delete/rename/upstream 状态。

## 8. 错误边界

- 参数错误返回 `INVALID_ARGUMENT`、`INVALID_ACTION`、`MISSING_BRANCH_NAME` 或 `MISSING_REQUIRED_FIELD`。
- 作用域和权限错误返回 `SCOPE_REJECTED` / `PERMISSION_DENIED`。
- 缺少 guard 返回 `GOVERNANCE_REJECTED`。
- 缺少 runtime provider 返回 `PROVIDER_UNAVAILABLE`，provider 失败返回 public-safe `PROVIDER_REJECTED`。

## 9. 依赖对象

- `BaseToolExecutorPort.git.runGit`：runtime 拥有真实 Git 进程。
- `runtime.governancePlane.toolInvocationGrant`：真实写入动作前的治理许可。
- Host `git` binary：由 runtime 提供，不在工具层直接调用。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("git.manageBranch")`。
- `scripts/agentCore_Agent_Test/agentcore_tool_lab.ts` 的 mounted gitBase runner。
- 后续 TAP 高级工具系统可以把它组合成更完整的分支治理工作流。

## 11. 不应该做什么

- 不要提供任意 `git.execute`。
- 不要改用 `shell.commandExecution` 执行分支管理。
- 不要把 switch/checkout/merge/rebase/push 等动作塞进本工具。
- 不要让模型传入路径后自动成为 allowed repository root。

## 12. 最小实现建议

- entry 文件保持薄 re-export，兼容旧 helper。
- storage `core.ts` 负责 JSON 验证、safe ref 校验、固定 argv、dry-run、governance、provider error mapping 和 parser。
- `bestPractice.ts` 负责 provider practice 选择、handler 定义和 registry 可挂载形态。
- lab 只归一化输入并注入 governed context，不自行拼 Git 子命令。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不产生 raw `TypeError`。
- `dryRun:false` 缺 guard 返回 `GOVERNANCE_REJECTED`。
- 有 guard 但缺 provider 返回 `PROVIDER_UNAVAILABLE`。
- fake runtime executor 收到固定 argv，例如 `branch -M feature/a feature/b`。
- registry/lab 走 `createBaseToolRegistry().lookupHandler`，未知 `git.*` 不落到任意 fallback。

## 14. 与系统链路的关系

调用链路是：模型工具调用 JSON -> lab/runtime adapter -> registry handler -> storage bestPractice -> storage core -> `BaseToolExecutorPort.git.runGit` -> host git process -> normalized result。这个工具层更多提供调用方式、入口和 runtime 调用形状规范；真实 Git 进程归 runtime 管理。
