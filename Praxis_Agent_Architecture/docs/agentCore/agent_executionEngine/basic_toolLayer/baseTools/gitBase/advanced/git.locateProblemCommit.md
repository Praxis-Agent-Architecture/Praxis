# git.locateProblemCommit

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced/git.locateProblemCommit.ts`
> 对应实现：`Praxis_Agent_Architecture/src/storagePool/baseToolStorage/gitBase/advanced/git.locateProblemCommit/`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/gitBase/advanced`。
- 当前入口：`git.locateProblemCommit.ts`。
- storage 实现目录：`storagePool/baseToolStorage/gitBase/advanced/git.locateProblemCommit/`。

## 2. 文件职责

提供 Git 基础工具 / 高级 Git 操作 中的“定位问题提交”基础能力原语。

这个工具用于读取 `knownGoodRef..knownBadRef` 范围里的 bisect 候选提交。它只构造固定的 `git rev-list --bisect-all <good>..<bad>` argv，并通过 runtime 的 `BaseToolExecutorPort.git.runGit` 执行。它不是 `git.execute`，也不会执行 `verificationCommand`。

## 2.1 文件名语义拆解

- `git`：工具 family 固定为 gitBase。
- `locateProblemCommit`：定位问题提交候选，不运行完整 bisect 状态机。
- `advanced`：属于高级 Git 辅助能力，但当前风险仍是只读 inspection。
- 工程含义：entry 层保持薄 re-export，storage core 负责输入、输出、错误、风险和 runtime 调用契约。

## 3. 目录语义

- 基础工具原语层：给 Agent 提供可治理、可审计、可测试的底层能力。
- Git 基础工具：仓库、分支、暂存、提交、远端、stash、历史检查和高级只读定位。
- storagePool：保存真实契约、provider practice、依赖声明和运行手册。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 高级 Git 操作。
- 核心目的：提供 Git 基础工具 / 高级 Git 操作 中的“定位问题提交”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：entry 层只暴露稳定 public surface；真实契约、provider 适配和 runtime git executor 调用在 storagePool。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 接收 `target.repositoryPath`、`knownGoodRef`、`knownBadRef`、可选 `verificationCommand` 和 `maxSteps`。
- 校验 ref 不为空、不含空白或 NUL、不以 dash 开头，并要求 good/bad 不相同。
- 生成固定 `rev-list --bisect-all` argv。
- 返回 `runtimeEntry`、`gitArgs`、`risk`、`permissionsRequired`、`providerCalled` 和 `resultEnvelope`。
- 明确 `verificationCommandExecuted:false`，避免把该工具扩成 shell runner。

## 6. 输入边界

- 输入来自 `BaseToolHandler.invoke()` 的 tool call JSON。
- `target.repositoryPath` 必须落在 runtime 允许的 repository roots 内。
- `context.dryRun:false` 真实执行需要 affirmative guard。
- `context.grantedPermissions` 至少覆盖 `git:read` 和 `filesystem:read`。
- 不接收模型提供的任意 Git 子命令、flag 或 shell 命令。

## 7. 输出边界

- dry-run 输出命令计划，不调用 provider。
- 真实执行输出 public-safe 的 `exitCode/stdout/stderr`、固定 `gitArgs` 和解析后的候选提交。
- `resultEnvelope.candidates` 会保留解析失败行的 `raw` fallback，不抛 raw error。
- 输出不承诺已经定位唯一问题提交，只说明当前范围里的候选读取结果。

## 8. 错误边界

- 参数缺失返回 `MISSING_REPOSITORY_PATH`、`MISSING_KNOWN_GOOD_REF` 或 `MISSING_KNOWN_BAD_REF`。
- ref、命令预览或 maxSteps 非法返回 public-safe input error。
- 越界仓库返回 `SCOPE_REJECTED`。
- 权限不足返回 `PERMISSION_DENIED`。
- 缺少 runtime git provider 返回 `PROVIDER_UNAVAILABLE`。
- provider 抛错返回 `PROVIDER_REJECTED`，不泄漏路径、stack 或内部命令细节。

## 9. 依赖对象

- `BaseToolExecutorPort.git.runGit`：runtime 拥有真实 Git 进程。
- `runtime.governancePlane.toolInvocationGrant`：真实执行 guard 和权限来源。
- `git` binary：由 runtime 侧执行器负责查找与运行。
- TAP 高级工具系统：负责用户审批、组合策略和更高层 bisect workflow。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("git.locateProblemCommit")`。
- lab tool runner 的 `runMountedGitBaseTool(...)`。
- runtime/toolInvocationEntrypoint 适配后的统一 `BaseToolHandler.invoke()`。
- TAP 可在其上组合“提示用户跑验证命令”的高级流程，但不能把验证命令下沉到本 baseTool。

## 11. 不应该做什么

- 不要运行 `git bisect start/run/reset`。
- 不要执行 `verificationCommand`。
- 不要走 `shell.commandExecution`。
- 不要让模型拼任意 `git.*` 子命令。
- 不要新增高层 `executor.git.locateProblemCommit`；runtime 只保留 `runGit` 支撑端口。

## 12. 最小实现建议

- storage `core.ts` 负责 unknown JSON 校验、scope、permission、guard、固定 argv 和结果解析。
- `dependencies.ts` 只把 `BaseToolExecutorPort.git.runGit` 包装成 provider。
- `bestPractice.ts` 注入 runtime metadata、provider practice 和 registry-visible handler。
- entry 文件只显式 re-export 类型、descriptor、planner、execute 函数和 handler。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不出现 raw `TypeError`。
- scope、permission、governance、provider unavailable 都有稳定错误码。
- fake provider 收到精确 argv：`rev-list --bisect-all <good>..<bad>`。
- provider failure 不泄漏内部路径。
- registry handler 和 lab runtime-chain 都能调用该工具。

## 14. 与系统链路的关系

模型只请求 `git.locateProblemCommit`。registry 找到 handler 后，storage core 生成固定 Git argv，runtime 执行 `BaseToolExecutorPort.git.runGit`，再把候选提交解析结果回灌给模型。这样保留统一 BaseTool 接口，同时避免形成大而全的 `git.execute`。
