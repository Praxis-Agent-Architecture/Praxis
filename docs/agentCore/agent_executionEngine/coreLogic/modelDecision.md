# modelDecision

> 对应源码：`src/agentCore_executionEngine/coreLogic/modelDecision.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/coreLogic`。
- 当前文件：`modelDecision.ts`。
- 角色概括：把模型返回解释为 Praxis 内部决策，不让 Kernel 到处猜 provider 字段。

## 2. 文件职责

将 provider 原始返回中的文本、函数调用、审批请求和一次性过程计划，归一成 `ModelDecision`。

白话说：模型这一轮“想干什么”在这里定型；真正执行工具、审批或输出，不在这里发生。

## 2.1 文件名语义拆解

- `model`：输入来自模型调用结果，但不绑定某一家 provider 的核心协议。
- `Decision`：输出是运行时可以调度的决策枚举，包括 finalOutput、toolCall、ephemeralProcedurePlan、requestApproval、continue、fail。
- 工程含义：这是 mainLoop 和 runtime kernel 之间的解释层，避免 provider shape 泄漏进执行核心。

## 3. 目录语义

- 执行核心逻辑面：承接主循环、状态机、模型决策、临时过程和 observation 的窄合同。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 执行核心逻辑。
- 核心目的：把模型输出解释为 Praxis 内部 ModelDecision，而不是让 Kernel 直接猜 provider 形状。
- 边界：保留 provider 原始引用，但不把 Responses 字段提升为 Praxis 核心合同。
- 对接：mainLoop 根据决策调度 BaseTool、EphemeralProcedure、审批、继续或最终输出。
- 实现提示：新增 provider shape 时只扩展 extractor，不改变 ModelDecision 主合同。

## 5. 需要提供的能力

- 从 Codex Responses 的对象或 SSE 文本中提取最终文本。
- 从 function_call/tool_call 中提取工具意图，并通过 provider tool mapping 映射回 runtime tool id。
- 识别 `praxis_ephemeral_procedure` 和 `praxis_request_approval` 这类 runtime 决策通道。
- 为每个决策保留 provider 原始引用、decision id 和可观察 metadata。

## 6. 输入边界

- 输入是 provider raw、sessionId、turnIndex、可选 provider tool mapping 和 providerRawRef。
- 不接收 executor、store、权限对象或 provider client。
- 不读取文件、不调用网络、不执行工具。

## 7. 输出边界

- 输出 `ModelDecision[]` 或 public-safe 解释错误。
- 输出只表达“模型想做什么”，不能直接修改状态、执行 BaseTool 或生成 TAP 能力。
- provider 原始字段只能作为引用和 metadata，不成为 Praxis 核心合同。

## 8. 错误边界

- 缺 sessionId、缺 raw、非法 EphemeralProcedure 都返回可检查错误。
- 错误消息必须 public-safe，不能泄漏 provider secret、原始认证材料或未审计 payload。

## 9. 依赖对象

- `ephemeralProcedure.ts` 用于校验一次性 BaseTool 编排计划。
- mainLoop / runtime kernel 是调用方，不是本文件内部依赖。

## 10. 被谁调用

- `PraxisRuntimeKernel.runManifest`。
- 后续正式 `mainLoop` 执行器。
- debug/inspection 可以读取它输出的决策结构。

## 11. 不应该做什么

- 不执行工具。
- 不把 EphemeralProcedure 变成新 BaseTool。
- 不实现 TAP/CMP/MP/multiagent 的高级能力。
- 不让 provider-specific 字段成为主合同。

## 12. 最小实现建议

- 保持解释函数为纯函数。
- 每个 provider shape 只在归一化函数内处理。
- 新增 provider 时增加 extractor，不改变 `ModelDecision` 主合同。

## 13. 最小测试建议

- 测最终文本。
- 测 provider function name 到 runtime tool id 的映射。
- 测 EphemeralProcedure 的接受和拒绝。
- 测非法输入不抛 raw error。

## 14. 与系统链路的关系

位于 `modelInvocationRuntime` 之后、tool/procedure execution 之前，是 prompt/mainLoop 正式链路的模型意图解释点。
