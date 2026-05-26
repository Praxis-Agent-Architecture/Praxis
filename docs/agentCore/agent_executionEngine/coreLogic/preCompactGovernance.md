# preCompactGovernance

> 对应源码：`src/executionEngine/coreLogic/preCompactGovernance.ts`

## 1. 文件位置

- 所属顶层模块：Agent 执行引擎（`agent_executionEngine`）。
- 当前文件：`coreLogic/preCompactGovernance.ts`。
- 角色概括：compact 前上下文治理协议层。

## 2. 文件职责

`preCompactGovernance` 定义 compact 前上下文治理的 packet、result、record、schema、解析校验和 executor 抽象。它服务于 runtime compact 边界，只做一次性去噪，不是常驻 CMP/RAG/memory agent。

## 2.1 文件名语义拆解

- `preCompact`：发生在 context compact executor 之前。
- `Governance`：只做治理判断、事实保留、噪音剔除和审计记录。
- `Result`：治理模型或应用 executor 必须返回结构化 JSON，runtime 再决定如何应用。

## 3. 目录语义

`coreLogic` 放 Agent 执行引擎中的 provider-neutral 控制语义。这个文件不绑定任何上游模型 API，也不直接读写项目文件；它只定义 runtime 可以调用的治理协议和校验规则。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / Pre-compact context governance contract。
- 核心目的：在 context compact 真正执行前，用一次性治理视图去噪 projectContext/sessionSummary。
- 边界：不是常态 CMP/RAG/memory agent；不执行工具；失败不阻断原 compact。
- 对接：承接 contextCompact、PromptPack assembly、PraxisRuntimeKernel 和应用注入的 one-shot governance executor。
- 实现提示：保持协议和校验层轻量，runtime 负责触发时机、材料应用、审计记录和 fallback。

## 5. 需要提供的能力

- 定义 `PreCompactGovernancePacket`，承载 compact 前的瘦身治理视图。
- 定义 `PreCompactGovernanceResult`，要求 `sessionSummaryCandidate`、`projectContextUpdates` 和审计字段。
- 校验模型或应用 executor 返回的 JSON，拒绝缺少必要字段或非法模式的结果。
- 生成 `PreCompactGovernanceRecord`，记录 applied 状态、evidence refs、removed noise 和 public-safe error。
- 提供 no-op executor 和 model caller executor，方便 runtime/application 注入。

## 6. 输入边界

- 输入是 runtime 已组装好的治理 packet，不是 provider payload。
- `projectContext`、`sessionSummary`、`recentConversation` 可以携带原文材料。
- `memoryContext`、`retrievedContext`、`observations` 只应携带索引、摘要、ref、status。
- 当前用户输入通过 `currentUserTurnText` 保留，不允许治理结果覆盖。
- 工具声明和 hidden scratchpad 不进入治理 packet。

## 7. 输出边界

- 成功输出 `praxis.preCompactGovernance.result` v1。
- `sessionSummaryCandidate` 由 runtime 应用到 compact 后的 session summary。
- `projectContextUpdates` 由 runtime 转成 projectContext PromptPack material。
- `staleClaims`、`preservedFacts`、`removedNoise`、`uncertainty`、`evidenceRefs` 进入审计记录。
- 输出不包含 raw provider body、secret 或工具执行结果大 payload。

## 8. 错误边界

- 非 JSON、非对象、版本不匹配、缺少 `sessionSummaryCandidate` 或缺少必填数组字段都返回 public-safe 校验错误。
- executor 抛错会转换为 `PRE_COMPACT_GOVERNANCE_FAILED`。
- skipped、invalid、failed 都不能阻断原 compact；runtime 必须继续 fallback。

## 9. 依赖对象

- `promptDefiner`：复用 PromptPack material/segment 类型。
- `contextCompact`：治理发生在 compact threshold decision 和 compact executor 之间。
- `promptContextAssembly`：治理成功后的 projectContext material 会回到 PromptPack。
- `praxisRuntimeKernel`：负责触发治理、应用结果、记录事件和 fallback。

## 10. 被谁调用

- `PraxisRuntimeKernel` 在 compact threshold 命中后调用。
- application 可以注入自己的 one-shot governance executor。
- 测试与调试工具可以直接调用 parser/executor 验证治理 JSON。

## 11. 不应该做什么

- 不实现常态 CMP、RAG、memory agent 或长期上下文策略。
- 不执行工具，不发起 shell/file/web/MCP 调用。
- 不修改 stableSystemCore、declaredRuntimeContext、toolDeclarations、userTurn 或 assistant scratchpad。
- 不绑定 OpenAI、Claude、Gemini 等 provider 的字段形状。

## 12. 最小实现建议

- parser 必须先做结构校验，再做宽容归一化。
- runtime 应只在 compact threshold 命中时调用治理 executor。
- 治理成功后，把 summary/project 更新作为 compact 输入视图的一部分。
- 治理失败时只记录审计，不改变原 compact 流程。

## 13. 最小测试建议

- 测合法治理 JSON 可以归一化为 result。
- 测非法 JSON、缺少 summary、缺少必填数组字段会失败。
- 测 model executor 成功时生成 completed record。
- 测 runtime 成功应用治理结果，并在治理失败时继续 normal compact。

## 14. 与系统链路的关系

它处在 `PromptPack -> compact threshold decision -> preCompactGovernance -> CompactExecutor -> rebuilt PromptPack` 这条链路中。它让 compact 前的上下文先经过一次轻量治理，但不改变 Praxis 的 framework/runtime 分层，也不把 Raxode 产品逻辑写入核心。
