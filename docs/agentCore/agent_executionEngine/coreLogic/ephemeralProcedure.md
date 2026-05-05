# ephemeralProcedure

> 对应源码：`src/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/coreLogic`。
- 当前文件：`ephemeralProcedure.ts`。
- 角色概括：定义一次性 BaseTool 编排计划的合同。

## 2. 文件职责

校验和归一化 `EphemeralProcedurePlan`。

白话说：当模型需要“临时组织几步已有工具动作”时，这里描述计划形状；它不是造新工具，也不是 TAP。

## 2.1 文件名语义拆解

- `ephemeral`：临时、一次性，只存在于当前 session/turn 的执行计划中。
- `Procedure`：多个已有 BaseTool step 的串行、并行或混合编排。
- 工程含义：这是 mainLoop 可以调度的过程合同，而不是新的能力供应层。

## 3. 目录语义

- 执行核心逻辑面：承接主循环中的动作计划、依赖关系、风险和观测合并规则。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 执行核心逻辑。
- 核心目的：定义 EphemeralProcedure 这一临时 BaseTool 编排合同。
- 边界：只描述已有 BaseTool 的一次性执行计划，不生产新工具，不接管 TAP。
- 对接：mainLoop 解释模型决策后交给 runtime 通过 BaseTool registry/handler/executor 执行。
- 实现提示：只校验和归一化计划，真实执行必须留在 runtime BaseTool mount 链。

## 5. 需要提供的能力

- 定义 procedureId、purpose、author、executionMode、steps、dependencies、requiredBaseTools。
- 定义 riskLevel、approval、resourceLimits、expectedOutputs、mergeObservationPolicy。
- 校验 stepId、baseToolId、dependsOn 和 TAP 禁入边界。
- 自动汇总 requiredBaseTools。

## 6. 输入边界

- 输入是未知对象，通常来自 `ModelDecision` 的 runtime 决策函数参数。
- 输入只允许描述已有 BaseTool 的调用计划。
- 不接收 executor，不执行命令，不读取存储。

## 7. 输出边界

- 输出标准化后的 `EphemeralProcedurePlan` 或 public-safe validation error。
- 输出计划必须仍然通过 runtime 的 `invokeMountedBaseTool` 执行。
- 输出不包含 provider client、raw secret 或 TAP 安装行为。

## 8. 错误边界

- 缺 procedureId、缺 purpose、空 steps、缺 baseToolId、重复 stepId、未知依赖、TAP 请求都要稳定拒绝。
- 错误必须 public-safe，供 event/state/debug 记录。

## 9. 依赖对象

- 无外部运行依赖。
- 被 `modelDecision.ts` 用于解析模型提出的临时过程。
- 被 runtime kernel 或未来 mainLoop executor 用于执行前校验。

## 10. 被谁调用

- `modelDecision.ts`。
- `PraxisRuntimeKernel.runManifest` 的 procedure executor。
- 后续正式 mainLoop/coreLogic 执行器。

## 11. 不应该做什么

- 不直接执行 BaseTool。
- 不创建新 BaseTool。
- 不调用或安装 TAP。
- 不实现 CMP/MP/multiagent 的高级策略。

## 12. 最小实现建议

- 保持归一化函数可复用、可测试。
- serial/parallel/mixed 只描述计划模式，实际调度由 runtime 执行层负责。
- 风险、审批和资源字段先作为合同保存，后续接入治理面时复用。

## 13. 最小测试建议

- 测合法 BaseTool procedure。
- 测 TAP 禁入。
- 测未知依赖和重复 step。
- 测 requiredBaseTools 自动汇总。

## 14. 与系统链路的关系

位于 `ModelDecision` 之后、BaseTool runtime mount 之前，为 mainLoop 提供“已有工具的一次性过程计划”。
