# observationIntegrator

> 对应源码：`src/executionEngine/coreLogic/observationIntegrator.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/coreLogic`。
- 当前文件：`observationIntegrator.ts`。
- 角色概括：把工具、procedure、runtime 或 model 结果整理成 PromptPack 可消费的 observation material。

## 2. 文件职责

生成 `RuntimeObservationMaterial`。

白话说：工具跑完以后，下一轮模型不应该直接吞底层对象；这里把结果变成可审计、可引用、可放进 PromptPack 的观察材料。

## 2.1 文件名语义拆解

- `observation`：运行过程中的事实材料，比如工具结果、失败、审批等待。
- `Integrator`：把结果、引用、摘要和 metadata 合并成 PromptPack material。
- 工程含义：这是 tool/procedure execution 到 promptPack 下一轮上下文之间的桥。

## 3. 目录语义

- 执行核心逻辑面：承接模型决策、工具调用结果、状态事件和下一轮 prompt 输入。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 执行核心逻辑。
- 核心目的：把工具和临时过程执行结果整理成 PromptPack 可消费的 observation material。
- 边界：只做观测摘要和引用，不重放工具语义，不写 TAP/CMP/MP/multiagent 策略。
- 对接：连接 BaseTool/Procedure 执行结果、PromptPack assembly 和下一轮 mainLoop。
- 实现提示：保持 provider-neutral material，不在这里生成 provider payload 或最终输出。

## 5. 需要提供的能力

- 接收 observationId、source、status、title、summary、refs、payload、metadata。
- 输出 `PromptPackMaterialDraft`，供下一轮 PromptPack assembly 使用。
- 根据 source 区分 tool-summary 和 runtime material。
- 根据 failed 状态提高 priority，保证错误能被下一轮模型看到。

## 6. 输入边界

- 输入是已经执行完成或等待审批的结果摘要。
- 不接收 executor、provider caller、store 或完整 session snapshot。
- payload 只用于摘要序列化，不能触发任何副作用。

## 7. 输出边界

- 输出 observationId、refs、payload 和 PromptPack material。
- material 必须保持 provider-neutral，不直接生成 provider payload。
- metadata 只放 public-safe 的索引字段。

## 8. 错误边界

- 当前实现不抛错；不可序列化 payload 使用稳定占位文本。
- 后续如果增加校验，应返回 public-safe error，而不是泄漏底层异常。

## 9. 依赖对象

- 依赖 `promptDefiner.ts` 的 `PromptPackMaterialDraft` 类型。
- 上游是 BaseTool/procedure/runtime/model 执行结果。
- 下游是 PromptPack assembly。

## 10. 被谁调用

- `PraxisRuntimeKernel.runManifest`。
- 后续正式 mainLoop observation integration。
- debug/inspection 可以读取 observation refs。

## 11. 不应该做什么

- 不重新解释工具语义。
- 不访问文件、网络或 provider。
- 不实现 TAP/CMP/MP/multiagent 策略。
- 不把 observation 变成最终输出。

## 12. 最小实现建议

- 保持函数纯净可测。
- observation 文本要短、可读、可回灌。
- payload 序列化失败时返回稳定文本。

## 13. 最小测试建议

- 测 BaseTool 成功结果生成 tool-summary material。
- 测 runtime failed observation 提高 priority。
- 测 refs 和 metadata 保留。

## 14. 与系统链路的关系

连接 tool/procedure execution 与下一轮 PromptPack，是 mainLoop “observe” 阶段的最小工程落点。
