# git.moveOrRenameFile

> 对应源码：`src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/gitBase/file/git.moveOrRenameFile.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/gitBase/file`。
- 当前文件：`git.moveOrRenameFile.ts`。

## 2. 文件职责

提供 Git 基础工具 / Git 文件操作 中的“移动或重命名文件”基础能力原语。它是 entry 层 public surface，真实契约、provider 适配和 runtime git executor 调用在 storagePool。

## 2.1 文件名语义拆解

- `git`：Git 基础工具 family。
- `moveOrRenameFile`：固定封装 `git mv` 的文件移动/重命名意图。
- 该基础工具原语不是 TAP 的最终高级工具；TAP 可以在其上增加审批、组合和专业工具策略。

## 3. 目录语义

`gitBase/file` 承载 Git 文件操作的底层能力点。当前工具只表达 move/rename tracked file，不扩展为任意 Git 命令执行器。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / Git 文件操作。
- 核心目的：提供 Git 基础工具 / Git 文件操作 中的“移动或重命名文件”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：entry 层只暴露稳定 public surface；真实契约、provider 适配和 runtime git executor 调用在 storagePool。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 暴露 `git.moveOrRenameFile` 的稳定类型、planner、executor 和 handler。
- 通过 storage core 构造固定 `git mv [--force] -- <sourcePath> <destinationPath>` argv。
- 返回 runtime entry、风险 metadata、权限需求、审计事件和标准结果信封。

## 6. 输入边界

输入来自 runtime/toolInvocationEntrypoint 的工具调用请求，只接受 `repositoryPath`、`sourcePath`、`destinationPath`、`force`、治理上下文和 timeout。路径必须是仓库相对路径，不能是绝对路径或 `..` 越界。

## 7. 输出边界

输出是可交给 TAP 和 runtime inspection 的标准工具结果信封，包括 `runtimeEntry`、`gitArgs`、`commandPreview`、`risk`、`providerCalled` 和 `resultEnvelope`。不暴露 provider 私有错误或任意命令入口。

## 8. 错误边界

参数缺失、非法 JSON、越界路径、权限不足、治理拒绝、provider 缺失和 provider 失败都必须返回 public-safe error。错误不泄漏私有路径、命令细节或堆栈。

## 9. 依赖对象

- runtime.execEngine 的 `BaseToolExecutorPort.git.runGit`。
- runtime.governancePlane 的 guard/approval metadata。
- TAP approval/governance bridge。
- Host `git` binary，由 runtime 持有。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("git.moveOrRenameFile")`。
- runtime.invocationMethod/toolInvocationEntrypoint。
- TAP 高级工具系统。

## 11. 不应该做什么

- 不要实现 `git.execute`。
- 不要在 entry 层拼接或执行进程。
- 不要接受模型传入任意 git 子命令。
- 不要让模型提供的 scope 直接扩大 runtime sandbox。

## 12. 最小实现建议

保持 entry 文件薄 re-export；storage `core.ts` 负责 JSON validation、scope、permission、dry-run、guard、provider dispatch 和结果解析；`dependencies.ts` 只把 runtime git executor 包成 provider。

## 13. 最小测试建议

- dry-run 不调用 provider。
- `dryRun:false` 无 guard 返回 `GOVERNANCE_REJECTED`。
- 无 provider 返回 `PROVIDER_UNAVAILABLE`。
- fake runtime 收到固定 argv。
- malformed JSON 不抛 raw `TypeError`。
- registry handler 可以 invoke。

## 14. 与系统链路的关系

模型只请求 `git.moveOrRenameFile`。registry 找到 handler 后，storage core 生成固定 git argv，runtime 通过 `BaseToolExecutorPort.git.runGit` 执行，结果再回灌给模型或 TAP。
