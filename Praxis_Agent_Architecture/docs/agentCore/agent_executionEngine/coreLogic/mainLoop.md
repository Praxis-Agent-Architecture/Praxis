# mainLoop

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/coreLogic/mainLoop.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/coreLogic`。
- 当前文件：`mainLoop.ts`。
- 角色概括：Agent 的执行身体，负责输入输出、PromptPack、主循环、状态机、基础工具原语和执行事件暴露。

## 2. 文件职责

驱动 Agent 执行主循环。

这个文件的核心不是“占一个目录位置”，而是要在当前路径上形成一个可实现、可测试、可被 runtime 或相邻模块调用的窄能力点。它应该围绕“驱动 Agent 执行主循环”建立清晰的输入、输出、错误和治理边界。

## 2.1 文件名语义拆解

- 原始文件名：`mainLoop.ts`。
- 命名片段：`main` / `Loop`。
- 工程含义：这是执行核心逻辑的一处能力点，重点是主循环、状态机、复用或事件暴露的窄职责。
- 第一实现重点：先把状态输入、状态输出、事件和调用下一跳定义清楚。
- 当前正式动作原语包括 promptPack handoff、model invocation handoff、ModelDecision handoff、BaseTool handoff、EphemeralProcedure handoff、approval wait/resume、interrupt、retry/timeout、event/session record 等。Kernel 可以继续保留兼容 shim，但这些动作应逐步成为主循环语义入口。

## 3. 目录语义

- 执行核心逻辑面：承接主循环、状态机、复用入口和执行事件暴露。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 执行核心逻辑。
- 核心目的：承载 main Loop 这一能力位点。
- 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 边界：只服务 agentCore 内核，不写上层产品逻辑。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 驱动 Agent 执行主循环
- 需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 把本文件能力包装成稳定的 TypeScript 类型、函数或类接口。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- runtime.execEngine 下发的执行请求、会话上下文、状态快照和治理上下文。
- 执行“驱动 Agent 执行主循环”所需的任务输入、状态输入、事件输入和下一跳调用约束。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- “驱动 Agent 执行主循环”后形成的状态变化、下一跳调用意图、事件材料或执行结果。
- 可被 runtime.execEngine、behaviorExposure 和 debug/inspection 继续消费的标准结构。
- `planFrameworkMainLoopHandoff` 输出 `praxis.mainLoopHandoffPlan`，每个 model/tool/procedure/approval/failure tick 都有 `MainLoopStepRecord`，并保持 dry-run、无副作用、可审计。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.execEngine
- runtime.governancePlane
- runtime.contractSurface

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- runtime.execEngine
- agent_executionEngine/coreLogic/mainLoop
- runtime.behaviorExposure

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要在这里写上层产品逻辑，也不要让它直接绑定某一家 provider 的请求格式。
- 不要提前冻结最终 schema、协议、目录树或字段枚举，除非用户明确进入冻结阶段。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- 先定义 TypeScript 类型契约：输入、输出、错误、上下文和最小配置。
- 实现一个最小纯函数或薄类壳，能完成“驱动 Agent 执行主循环”的可测路径。
- 所有副作用先通过明确依赖注入进入，避免在文件内部偷偷读全局状态。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法输入各至少一组。
- 验证该文件确实只完成“驱动 Agent 执行主循环”，没有越界承担相邻模块职责。
- 验证错误结果可解释、可分类、不会泄漏不该暴露的内部细节。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它属于 agentCore 内部工程骨架的一处能力点，需要和相邻模块通过窄契约连接。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
