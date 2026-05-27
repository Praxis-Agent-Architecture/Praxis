# mainLoop

> 对应源码：`src/executionEngine/coreLogic/mainLoop.ts`

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
- 当前 MainLoop 领域模型分成 `MainLoopRun`、`UserTurn`、`LoopTick`、`MainLoopStepRecord`、`MainLoopCheckpoint`、`MainLoopTimelineRef`：
  - `MainLoopRun` 表达一个 Agent 在一个 session 内的完整生命周期。
  - `UserTurn` 表达一次用户输入到最终输出。
  - `LoopTick` 表达一次 `model -> action -> observation` 小循环。
  - `MainLoopStepRecord` 是日志、恢复、审批、debug、replay 的共同粒度。
  - `MainLoopCheckpoint` 是 resume/replay/rollback 的定位点。
  - `MainLoopTimelineRef` 是 run/turn/tick/step/checkpoint 的统一时间轴引用。

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
- `createMainLoopRun`、`createUserTurn`、`createLoopTick`、`createMainLoopCheckpoint`、`createMainLoopSessionTimeline` 输出 MainLoop 的正式时间轴模型，供后续 Kernel 迁移、状态恢复、debug/replay 使用。
- `runMainLoop` 是 MainLoop 的基础运行入口，负责生成 run/userTurn/loopTick/timeline，并调用 `prepareMainLoopTurn` 接住 PromptPack 与 cache plan。
- `runMainLoopRunner` 是正式主循环 runner，拥有 `prepare -> invoke model -> interpret decision -> tool/procedure/approval/final` 的循环控制权。Kernel 只注入 runtime 回调：模型调用、工具执行、审批、持久化和错误记录，不再自己展开 provider/tool/observation for-loop。
- `MainLoopRuntimeContext` 是 Kernel/application 给 MainLoop 的窄上下文，只声明 runtimeId、sessionId、manifestRef、callerRef 和可用 runtime surfaces，避免 MainLoop 吞掉整个 Kernel。
- `createMainLoopApprovalEnvelope` 把 runtime 判定为需要人类介入的动作转成 public-safe 审批信封，CLI/TUI/Raxode/Raxos/application surface 都可以接走。
- `resolveMainLoopApproval` 只接受外部 surface 返回的 approve/deny；deny 会回到模型重新规划，approve 会 resume，人工意见可以给模型看，但默认不能直接改工具参数。
- `createMainLoopControlAction` 记录 pause/resume/interrupt 这类控制动作。它同时表达 MainLoop 状态和 Runtime 状态，并可携带 cancel token，保证长动作被打断时能溯源。
- `createMainLoopRollbackPoint` 只记录 rollback 定位点，不直接执行 rollback。真正回滚由 runtime-control-surface、tool、storage 或上层控制台执行。
- `replayMainLoopStep`、`replayMainLoopTick`、`replayUserTurn` 生成 dry-run replay plan，复用 step record、PromptPack refs、observation refs 和 provider raw refs，服务断点调试和可追溯复盘。
- `createMainLoopBehaviorRegistry` 和 `resolveMainLoopBehaviorRef` 定义 MainLoop hooker/behavior refs 的唯一入口。behavior 可以来自 application、rax project、signed package、future DSL 或 runtime builtin，但运行时只认 registry 中注册过的 handlerRef，并受治理、冲突检测、timeout/sandbox/resource 合同约束。
- `resolveMainLoopBudgetExhaustion` 把预算耗尽归一成 fail、partial final、request approval、summary current state 或 write resume checkpoint，避免预算超限时只能粗暴失败。
- `analyzeMainLoopCacheHealth` 读取 PromptPack cache plan，输出 stable prefix、capability、session summary、observation hash、provider cache telemetry 和 cache miss warning。MainLoop 只解释 cache health，不写 provider 私有缓存字段。
- `resolveMainLoopToolChoice` 表达 auto、none、required、force tool、force group、force procedure。默认交给模型自由选择；Repo/Coding 的 evidence rule 只作为 PromptPack 规则引用，不变成 MainLoop 硬编码任务策略。
- `createMainLoopInputMaterial` 统一承接 text/image/audio/video 输入，并转成 PromptPack material / observation ref，不生成 provider payload。
- `createMainLoopOutputEnvelope` 统一表达 text、structured、artifact ref、multimodal、stream chunk 和 trace summary 输出。Streaming 默认流完一段再记录，避免 token 级事件把前端或日志系统打爆。
- `createMainLoopAgentInterfacePrimitive` 只生成 agent interface handoff，不直接嵌套调用另一个 Agent。未来 multiagent 只能规模化接管 interface primitive，不能绕开 agentCore/MainLoop 合同。
- `createMainLoopStateProgressionRecord` 记录 receive input、model invoked、tool running、approval pending、observation integrated、final output、failure、interrupt、resume 等关键动作如何推进 state/event。
- `decideMainLoopPromptPackRebuild` 统一判断 PromptPack 是否需要重建：新用户输入、observation 变化、memory/context 变化、capability set 变化、model family 切换、compression/summary 完成、behavior ref 请求都能成为 trigger。
- `decideTurnBoundaryCompact` 是上下文压缩的边界判定：当前 model/tool action 先完成，边界后用下一轮 PromptPack token 估算和默认 `0.95` 阈值决定是否 compact。白话说，它不在工具跑到一半时拦腰打断，而是在一轮动作结束后整理行李。

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

## 15. 后续任务

- `memoryBase` 暂不并入 MainLoop。本轮只保留观测材料、artifact 引用与 `SummaryAgentRef`；不建立 session-local fallback memory，也不让 MP 在这里接管隐藏记忆索引。
- 如果新增 `memoryBase` BaseTool，必须继续走 BaseTool registry/handler/executor，不得让 MainLoop 直接读写长期记忆。
