# runtimeInspectReport

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeInspectReport.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.inspection`。
- 当前文件：`runtimeInspectReport.ts`。
- 角色概括：Phase 10 的开发者检查报告面，用于聚合 manifest、工具、依赖、PromptPack、MainLoop、debug 和 selfRepair 的 public-safe 摘要。

## 2. 文件职责

`runtimeInspectReport.ts` 实现运行检查面中的 runtime / Inspect / Report 能力。它不执行模型、不执行工具、不启动官方模块，也不做真实修复。它只接收已经由 runtime 或相邻 surface 生成的只读信号，并把这些信号整理成稳定报告。

它服务的问题是：开发者需要知道一个 agent 为什么能跑、为什么不能跑、缺了什么、哪些 surface degraded、下一步应该看哪里。

## 2.1 文件名语义拆解

- 原始文件名：`runtimeInspectReport.ts`。
- 命名片段：`runtime` / `Inspect` / `Report`。
- 工程含义：这是 runtime 中 `runtime.inspection` 表面下的聚合报告能力点，重点是把多个检查面整理成一个开发者可读的审计对象。
- 第一实现重点：先明确报告输入、分区输出、findings、public-safe 错误和无副作用边界。
- 边界提醒：报告只能解释运行态，不应替执行引擎、模型适配器、官方模块或 selfRepair 执行动作。

## 3. 目录语义

- 运行检查面：检查契约、治理、模块挂载、surface readiness、运行不变量和开发者可读报告。
- 本文件是该目录的聚合报告，不替代 `runtimeInspector`、`runtimeReadinessCheck`、`runtimeSurfaceInspector` 等窄能力点。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 运行检查面。
- 核心目的：承载 runtime Inspect Report 这一能力位点。
- 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
- 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 聚合 `AgentManifest` inspection、tool readiness、dependency graph、PromptPack preview、MainLoop trace、debug summary、selfRepair dry-run summary。
- 为每个分区输出 `ready / degraded / blocked / not-provided` 状态。
- 把缺失 provider、缺失 BaseTool dependency、debug 降级、missing runtime requirement 变成 public-safe findings。
- 检查 secret-like 文本并拒绝生成报告。
- 保持 `unsafeSideEffects: false`，只做报告，不做修复或执行。

## 6. 输入边界

- `runtimeId`、audience、contract/governance gate。
- 可选 `AgentManifest`。
- 工具 readiness、依赖图、PromptPack preview、MainLoop trace、debug summary、selfRepair plan summary。
- 输入必须已经是 public-safe 摘要；不能把 raw provider response、raw secret 或未治理的内部对象塞进报告。

## 7. 输出边界

- `RuntimeInspectReport`：包含总体状态、manifest inspection、各分区 section、findings、missing requirements 和审计标记。
- `events`：只说明报告创建或拒绝，不代表执行动作。
- 错误结果必须 public-safe，能被 applicationSurface、debug 和 selfRepair 继续消费。

## 8. 错误边界

- 缺少 runtime、runtime 未 ready、contract 拒绝、governance 拒绝时返回稳定错误。
- 输入中出现 secret/token/password/bearer 等明显敏感文本时返回 `CHECK_FAILED`。
- 错误对象不得暴露内部 detail，也不得抛出 raw exception。

## 9. 依赖对象

- `runtimeAgentManifest.inspectAgentManifest`
- `runtime.inspection.runtimeInspector`
- runtime.contractSurface
- runtime.governancePlane
- runtime.invocationMethod
- runtime.debug
- runtime.selfRepair

这些依赖通过显式输入或窄函数进入，不在本文件里读取全局 runtime 状态。

## 10. 被谁调用

- 上层 Agent 应用和管理面。
- rax inspect/test/dev 这类开发者命令。
- CMP/MP/TAP/multiagent 官方模块的检查入口。
- debug/selfRepair 用于判断 readiness 和缺失要求。

## 11. 不应该做什么

- 不要执行模型、工具、官方模块策略或 selfRepair 动作。
- 不要把 PromptPack preview 变成 provider payload。
- 不要绕过 runtime governance 读取内部状态。
- 不要泄露 raw secret、raw provider response 或工具底层私有错误。
- 不要替代相邻窄检查面，只做报告聚合。

## 12. 最小实现建议

- 先保持一个纯函数 `createRuntimeInspectReport`。
- 每个报告分区独立计算 status 和 findings。
- 所有输入先经过 public-safe secret-like 检查。
- 新增字段时优先扩展 section 或 finding，不要新增隐藏副作用。

## 13. 最小测试建议

- 最小合法报告能聚合所有 Phase 10 分区。
- 缺失工具、缺失依赖、缺失 runtime requirement 能进入 findings。
- debug/baseTool/provider degraded 能正确影响状态。
- secret-like 文本会被拒绝。
- 报告始终保持无副作用。

## 14. 与系统链路的关系

它属于 runtime 检查主干：`AgentManifest -> runManifest -> session/state/event -> inspection/debug/selfRepair` 之后，开发者需要一个 public-safe 报告来理解运行条件和失败原因。

这份报告为后续 `rax inspect`、Raxos console、TUI/UI 调试面和官方模块自检提供统一材料，但不直接执行这些产品层能力。
