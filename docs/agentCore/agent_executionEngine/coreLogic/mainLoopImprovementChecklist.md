# MainLoop Improvement Checklist

> 对应源码：`src/agentCore_executionEngine/coreLogic/mainLoop.ts`
>
> 目标：把 MainLoop 从“正式合同层 + Kernel 兼容桥”推进为 agentCore 的真实执行身体。
>
> 使用方式：每完成一项，必须先有代码、测试或文档证据，再把 `[ ]` 改成 `[x]`。不要用“感觉已经做了”打勾。

## 0. 当前决议

- MainLoop 负责单 Agent 的完整生命周期执行。
- Multiagent 不属于 MainLoop；multiagent 未来只会管控多个 agentCore/MainLoop。
- Kernel 是 runtime 宿主、资源、session、治理、接口、存储、外部控制壳。
- MainLoop 拥有核心执行循环的控制权。
- 模型负责提出意图；开发者策略 refs 优先裁决；runtime 兜底治理。
- Provider-specific 差异不进入 MainLoop，由 compatibility layer / promptLoweringRuntime / modelAdapter 处理。

## 1. Domain Model

- [x] 定义 `MainLoopRun` / `MainLoopSessionTimeline`，表达一次 Agent 生命周期。
- [x] 定义 `UserTurn`，表达一次用户输入到最终输出。
- [x] 定义 `LoopTick`，表达一次 `model -> action -> observation` 小循环。
- [x] 定义 `MainLoopStep` 与现有 `MainLoopStepRecord` 的关系，确保 step 是日志、恢复、审批、debug、replay 的共同粒度。
- [x] 定义 `MainLoopCheckpoint`，支持从 session 开头、approval 等待点、failed step 后、observation 后恢复。
- [x] 定义 `MainLoopTimelineRef`，让 rollback/replay/debug 都能通过时间轴定位。
- [x] 更新 `docs/agentCore/agent_executionEngine/coreLogic/mainLoop.md`，同步 Run/UserTurn/LoopTick/Step 术语。
- [x] 增加 domain model tests，验证 Run/UserTurn/LoopTick/Step/Checkpoint 的最小合法结构和非法结构。

## 2. Kernel To MainLoop Ownership Migration

- [x] 新增正式 `runMainLoop(...)` 入口，作为 MainLoop 的完整执行入口。
- [x] 新增 `MainLoopRuntimeContext`，只接收执行所需的 runtime surface，不吞整个 Kernel。
- [x] Kernel 调用 `runMainLoop(...)` / `runMainLoopRunner(...)`，不再扩写自己的 provider/tool/observation for-loop 语义。
- [x] Kernel 保留 session lifecycle、runtime context、model adapter binding、BaseTool executor binding、state/event store binding、AgentRunResult。
- [x] Kernel 不再新增 prompt construction、provider parsing、mainLoop action semantics、tool semantics。
- [x] 保留兼容桥时，桥必须调用正式 MainLoop 合同。
- [x] 增加 Kernel compatibility tests，证明 `PraxisRuntimeKernel.runManifest` 仍可跑 minimal/fullstack dry-run。

## 3. Turn And Tick Lifecycle

- [x] 明确 UserTurn lifecycle：receive user input -> run ticks -> final expose。
- [x] 明确 LoopTick lifecycle：prepare turn -> assemble PromptPack -> build cache plan -> lower prompt -> invoke model -> interpret decision -> adjudicate -> execute action -> integrate observation -> continue/break。
- [x] `prepareMainLoopTurn(...)` 支持“只在需要时重建 PromptPack”。
- [x] 增加 PromptPack rebuild trigger：new user input、observation material change、memory/context change、capability set change、model family switch、compression/summary completion、behavior ref request。
- [x] `LoopTick` 记录 cache health、selected model、budget snapshot、state refs。
- [x] 增加 lifecycle tests，验证每个 tick 都能产出完整 step records。

## 4. Continuation And Finalization

- [x] 定义 `MainLoopContinuationDecision`。
- [x] 定义 `MainLoopBreakDecision`。
- [x] 定义 `MainLoopBehaviorRefDecision`，并让手动/开发者 refs 优先级高于模型建议和 runtime fallback。
- [x] 模型可以建议继续或结束，但不能单独结束 session。
- [x] finalOutput 接受前检查：无 pending approval、无 unresolved tool/procedure、无 fatal failure、event/state 已记录、budget 正常、statePlane 未 blocked、runtime 允许结束。
- [x] 增加 final acceptance tests，覆盖 pending approval、unresolved procedure、fatal failure、state blocked。

## 5. Runtime Adjudication

- [x] 保持模型只提出意图：toolCall、procedure、continue、final。
- [x] runtime 裁决工具是否允许、沙箱是否允许、资源是否超额、状态是否改变、session 是否可结束。
- [x] 开发者 strategy refs 可覆盖默认裁决，但必须受注册、治理、冲突检测约束。
- [x] 对写文件、shell、git、密钥/auth、TAP/外部插件调用，模型只能提出需求，runtime 决定是否允许。
- [x] 增加 adjudication tests，验证 policy/sandbox/resource/developer ref 优先级。

## 6. Tool Failure, Retry, And Fallback

- [x] 定义 `MainLoopRetryPolicy`，默认工具失败回模型重试 3 次。
- [x] 定义 `MainLoopFallbackPolicy`，重试失败后允许换工具或换方案。
- [x] 定义 `MainLoopFailureRecoveryPolicy`，最终失败后 runtime 兜底并可让模型分析是否换方案。
- [x] 真不行时中断给用户，生成 public-safe failure。
- [x] 工具自己的错误细分留在工具层；MainLoop 只保留粗边界。
- [x] 增加 retry/fallback tests，覆盖 3 次失败、换工具、最终中断。

## 7. Observation And Artifact Flow

- [x] 定义 `ObservationMaterial`，工具结果整理格式后进入 PromptPack。
- [x] 定义 observation trust levels：runtime fact、tool output、model interpretation、user-provided、external source、cached summary。
- [x] 定义 `ToolResultSizePolicy`，默认单个工具结果超过 20MB 时拦截。
- [x] 大结果持久化为 artifact，只把 ref 和可筛选摘要放回上下文。
- [x] 定义 `LargeObservationSelectionFlow`，让模型在 artifact 中二次筛选合适范围。
- [x] observation integration 不默认让当前 agent 自己摘要自己，优先交给 CMP/summary agent/ref。
- [x] 增加 observation/artifact tests，覆盖小结果直插、大结果 artifact、trust level。

## 8. Compression, Summary, And Fallback Memory

- [x] 无 CMP 时默认开启压缩，默认压缩率 95%，开发者可配置。
- [x] 压缩作为动作原语，不由 MainLoop 随意裁剪上下文。
- [x] 定义 `ObservationCompressionPolicy`。
- [x] 定义 `SummaryAgentRef`，摘要默认可以由小摘要 agent 完成。
- [x] 无 MP 时提供 session-local fallback memory。
- [x] 设计 `memoryBase` 方向：类似 Codex memory/skill md 库，可被 MP 顺势接管，不和架构内部强绑定。
- [x] 判断是否需要新增 memoryBase/BaseTool，并写入后续任务。
- [x] 增加 compression/memory fallback tests 或设计文档证据。

## 9. PromptPack Cache Control

- [x] MainLoop 维护 stable prefix hash。
- [x] MainLoop 维护 capability hash。
- [x] MainLoop 维护 session summary hash。
- [x] MainLoop 维护 observation hash。
- [x] MainLoop 记录 provider cache telemetry。
- [x] MainLoop 输出 cache miss warning。
- [x] stable tools 每轮带；capability set 变化时才重建 capability segment。
- [x] provider-specific cache 策略只通过 compatibility layer / promptLoweringRuntime 表达。
- [x] 增加 cache tests，验证 user turn 变化不影响 stable/capability hash。

## 10. Model Selection

- [x] 定义 `MainLoopModelSelectionRequest`。
- [x] 用户指定模型优先。
- [x] `chooseModelRef` 其次。
- [x] ModelFleet capability 自动补位。
- [x] 默认模型没有所需能力时，切到有能力的模型。
- [x] 模型切换后必要时重新 lower prompt，但尽量复用稳定 cache plan。
- [x] MainLoop 不感知 provider 私有字段。
- [x] 增加 model selection tests。

## 11. Approval, Pause, Resume, Interrupt

- [x] approval 支持 pending。
- [x] 外部 surface 返回 approve/deny。
- [x] approve/deny 后 resume。
- [x] deny 后允许模型改方案。
- [x] 人类可附带意见给模型看，但默认不能直接改工具参数。
- [x] pause 同时记录 MainLoop 状态和 Runtime 状态。
- [x] interrupt 是可追溯动作；人类打断也是注入 interrupt action。
- [x] 长动作支持 cancel token，尤其 shell/git/code/process。
- [x] 增加 approval/resume/interrupt tests。

## 12. Rollback And Replay

- [x] MainLoop 只记录 rollback point，不直接执行 rollback。
- [x] rollback point 通过 timeline timestamp / step id / checkpoint ref 定位。
- [x] 实际 rollback 由 runtime/tool/storage/control surface 执行。
- [x] 新增 `replayMainLoopStep(...)`。
- [x] 新增 `replayMainLoopTick(...)`。
- [x] 新增 `replayUserTurn(...)`。
- [x] replay 必须能复用 step record、promptPack refs、observation refs、provider raw refs。
- [x] 增加 replay/debug tests。

## 13. EphemeralProcedure And Parallel Execution

- [x] EphemeralProcedure 继续表示已有 BaseTool 的一次性编排，不造新工具。
- [x] 所有并行/串行/混合执行都由 procedure plan 表达。
- [x] 每个 procedure step 继续走 BaseTool registry/handler/executor。
- [x] 支持 partial waiting。
- [x] 支持 partial completed。
- [x] 支持 partial failed。
- [x] 支持 partial fallback。
- [x] risky step 等待人类时，其他可继续 step 可以继续。
- [x] procedure 单包默认最多 128 个 tool call。
- [x] 增加 procedure parallel tests。

## 14. Budget And Limits

- [x] 定义 `MainLoopBudgetSpec`。
- [x] 定义 `RuntimeBudgetSpec`。
- [x] 默认每个 LoopTick 最大 tool calls：1024。
- [x] 默认每个 EphemeralProcedure 最大 tool calls：128。
- [x] 默认 maxModelTurns：8192。
- [x] 默认 maxWallTime：180s。
- [x] maxTokens 根据模型走。
- [x] maxCost 默认无上限。
- [x] maxShellSeconds 默认 180s，尊重调用传参。
- [x] maxFileWrites 默认无上限。
- [x] maxNetworkCalls 默认无上限。
- [x] 预算耗尽时支持 fail、partial final、requestApproval 扩预算、summary current state、写 resume checkpoint。
- [x] 增加 budget tests。

## 15. StatePlane And Management Controls

- [x] 所有关键动作推进 state：receive input、model invoked、tool running、approval pending、observation integrated、final output、failure、interrupt、resume。
- [x] statePlane 暴露 phase。
- [x] statePlane 暴露 currentTurn/currentTick/currentStep。
- [x] statePlane 暴露 pendingApprovals。
- [x] statePlane 暴露 activeToolCalls。
- [x] statePlane 暴露 lastObservation。
- [x] statePlane 暴露 lastError。
- [x] statePlane 暴露 budgets。
- [x] statePlane 暴露 cacheHealth。
- [x] statePlane 暴露 selectedModel。
- [x] statePlane 暴露 sandboxStatus。
- [x] control 面覆盖 pause、resume、interrupt、approve、deny、retry、rollback、inspect、repair、configure、rotateSecretRef、updatePolicy、updateBudget。
- [x] 增加 statePlane/control tests。

## 16. Behavior Refs And Hookers

- [x] 不新增任务型 MainLoop profile，例如 coding/research/autonomous。
- [x] 定义 `MainLoopBehaviorRef`。
- [x] 定义 `MainLoopBehaviorRegistry`。
- [x] 定义 `MainLoopBehaviorResolution`。
- [x] behavior refs 可以来自 application、rax project、signed package、future DSL 等来源，但运行时源头只认 registry。
- [x] behavior ref 允许执行，但必须统一注册、受治理、受冲突检测、受 timeout/sandbox/resource 限制。
- [x] 与 agent 设置冲突时中断，让开发者调整。
- [x] 增加 behavior registry tests。

## 17. Agent Interface Boundary

- [x] MainLoop 不直接嵌套调用另一个 Agent。
- [x] 不新增 `invokeAgent` 作为 MainLoop 核心直接能力。
- [x] 未来 Agent 间协作必须走专门 agent interface。
- [x] multiagent 以后只规模化接管这些接口。
- [x] 如需预留，只预留 interface primitive，不实现 multiagent。

## 18. Streaming And Output

- [x] Streaming 学 Codex：流完一段再算可记录，避免 token 级记录导致卡顿。
- [x] 支持 text output。
- [x] 支持 structured output。
- [x] 支持 artifact refs。
- [x] 支持 multimodal output。
- [x] 支持 stream chunks。
- [x] 支持 trace summary。
- [x] 前端/application surface 自己解析输出 envelope。
- [x] 增加 streaming/output tests 或设计文档证据。

## 19. IOTransceiver Coverage

- [x] MainLoop 统一覆盖文字输入。
- [x] MainLoop 统一覆盖图片输入。
- [x] MainLoop 统一覆盖音频输入。
- [x] MainLoop 统一覆盖视频输入。
- [x] 输入材料都进入 PromptPack material / observation material，而不是 provider payload。
- [x] 增加 IO handoff tests。

## 20. Tool Choice And Evidence Rules

- [x] 支持 tool choice：auto、none、required、force one tool、force group、force procedure。
- [x] 默认交给模型自由选择工具。
- [x] 模型不调用工具时，本轮不强行质疑，后续交给 CMP/更高抽象解决。
- [x] Repo/Coding 这类 evidence rule 属于 PromptPack 规则，不属于 MainLoop 规则。
- [x] realtest promptPack 示例中保留“无工具证据不声称读过仓库”的规则。

## 21. SelfRepair And Dependency Preflight

- [x] session 开始做一次 dependency preflight。
- [x] 失败后再做 dependency preflight。
- [x] `rax test` 可以自动调用非智能 selfRepair plan。
- [x] `rax run` 不自动修，只给 report。
- [x] selfRepair 是非智能排错策略树，不调用模型。
- [x] 所有 report 必须 public-safe 且能指导开发者修。
- [x] 增加 selfRepair/preflight tests。

## 22. Implementation Phases

- [x] Phase A：补 MainLoop Domain Model。
- [x] Phase B：补 MainLoop Runner，并把 Kernel for-loop 迁入 MainLoop。
- [x] Phase C：补 Observation / Artifact / Compression。
- [x] Phase D：补 Approval / Resume / Interrupt / Replay。
- [x] Phase E：补 EphemeralProcedure / Parallel。
- [x] Phase F：补 Behavior Registry。
- [x] 每个 Phase 完成后更新本清单、跑定向测试、记录剩余 shim。

### Remaining Shim

- Kernel 仍保留 runtime 宿主回调：session/storage/sandbox 准备、model adapter 调用、BaseTool executor 注入、state/event 持久化、AgentRunResult 组装。
- MainLoop Runner 已拥有 provider/tool/observation 循环控制权；Kernel 不再展开 `for (model turn) -> decision loop`。

## 23. Verification Gates

- [x] `npm run typecheck`
- [x] `node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/mainLoop.test.ts`
- [x] `node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/modelDecision.test.ts`
- [x] `node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/ephemeralProcedure.test.ts`
- [x] `node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/observationIntegrator.test.ts`
- [x] `node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/stateEngine.test.ts`
- [x] `node --import tsx --test test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`
- [x] `npm run test:agentCore`
- [x] `git diff --check`

## 24. Completion Audit

- [x] Kernel 不再拥有核心循环语义，只做宿主管控。
- [x] MainLoop 拥有完整 UserTurn / LoopTick / Step 生命周期。
- [x] ModelDecision 只表达模型意图。
- [x] RuntimeAdjudication 做最终治理裁决。
- [x] Tool/procedure/approval/observation/final 都有 step records。
- [x] PromptPack cache health 能被 MainLoop 解释。
- [x] Large observation 不会直接打爆上下文。
- [x] Pause/resume/interrupt/replay 可追溯。
- [x] Behavior refs 有统一注册和冲突检测。
- [x] realtest minimal/fullstack 仍可 inspect/test/run。
