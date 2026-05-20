# search.ground

> 对应源码：`src/executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/searchBase`。
- 当前文件：`search.ground.ts`。
- storage 实现：`src/storagePool/baseToolStorage/searchBase/search.ground/`。

## 2. 文件职责

`search.ground` 是事实锚定与引用整理原语。它接收 claim 和 evidence，把已有证据整理成统一的 grounded answer、sources 和 citations。

它不负责发现网页，也不负责抓网页：

- 搜索发现用 `search.nativeSearch` 或 `search.searchEngine`。
- URL 内容抓取用 `search.fetch`。
- evidence 归因、引用、支持度判断用 `search.ground`。

## 2.1 文件名语义拆解

- `search`：属于 searchBase 家族。
- `ground`：把回答锚定到证据，输出可审计来源。
- entry 文件保持薄导出；核心验证和 provider dispatch 在 storage 目录。

## 3. 目录语义

`src/storagePool/baseToolStorage/searchBase/search.ground/` 包含：

- `core.ts`：校验 claim、evidence、mode、minimumEvidenceCount、provider、citations 和治理上下文。
- `bestPractice.ts`：提供 registry handler、schema 和 provider practice 选择。
- `dependencies.ts`：把 `BaseToolExecutorPort.network.ground` 适配成 provider。
- `anthropic.ts` / `openai.ts` / `deepmind.ts`：记录三家 citations/grounding practice。
- `search.ground.md`：storage 侧操作手册。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
- 核心目的：提供 基础工具集合 / 搜索基础工具 中的“做事实锚定”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
- runtime 定位：searchBase / grounding。
- 核心目的：把证据与 claim 的关系做成稳定、可审计的基础工具结果。
- 对接：registry -> handler -> storage bestPractice -> core -> `BaseToolExecutorPort.network.ground`。
- 边界：不在 baseTool 内发起新搜索或网页抓取。

## 5. 需要提供的能力

- 输入 `claim`、`evidence[]`、`mode`、`minimumEvidenceCount`、`provider`、`model`、`citations`。
- evidence 支持 url/title/excerpt/observedAt。
- dry-run 输出待审计 evidence ledger，不调用 provider。
- 真实执行必须 `dryRun:false` + affirmative guard + injected grounding provider。
- 输出 answer、grounded、status、confidence、sources、citations、providerMetadata。

## 6. 输入边界

- `target.claim` 必须是非空安全字符串。
- `target.evidence` 至少一项，最多 50 项；每项必须有 url、title 或 excerpt。
- evidence URL 只允许 `http` 或 `https`。
- `mode` 只能是 `strict`、`balanced`、`exploratory`。
- `citations` 只能是 `required`、`preferred`、`off`。
- `context.grantedPermissions` 必须包含 `search:read` 和 `grounding:audit`。

## 7. 输出边界

输出固定为 `agentCore.basicTool.search.ground`：

- `dispatch: "dry-run"`：只生成 grounding 计划。
- `dispatch: "runtime-ground"`：通过 `BaseToolExecutorPort.network.ground` 执行。
- `status` 归一化为 `grounded`、`partially-grounded`、`unsupported`。
- citations/sources 只暴露可展示字段，provider raw 默认留在受控字段中。

## 8. 错误边界

必须区分：

- malformed JSON、缺 claim、缺 evidence、非法 URL。
- provider、mode、citations、minimumEvidenceCount 非法。
- 权限不足、无 guard。
- 缺 runtime provider。
- provider failure / invalid provider result。

## 9. 依赖对象

- `BaseToolExecutorPort.network.ground`
- `BaseToolInvokeRequest.runtime.executor`
- runtime governance context
- provider-native grounding / citation adapter 或 Raxode grounding adapter

依赖必须注入；baseTool 不直接创建 SDK client 或外部服务 client。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("search.ground")`
- runtime tool invocation bridge
- `npm run lab:agentCore:tools`
- 后续 TAP 事实核查、引用整理和回答生成链路

## 11. 不应该做什么

- 不要在这里做 broad web search。
- 不要抓取 URL 正文。
- 不要把 evidence 缺失时的模型猜测伪装成 grounded answer。
- 不要暴露 provider stack、token、私有路径或未治理 raw response。

## 12. 最小实现建议

当前实现已完成 canonical storage、runtime port、registry handler、public-safe error 和测试。后续要接真实三家 provider 时，应在 runtime adapter 中完成 provider-native lowering，然后把标准结果交回 `search.ground`。

## 13. 最小测试建议

必须覆盖：

- malformed JSON、空 claim、空 evidence、非法 evidence URL。
- dry-run 不调用 provider。
- `dryRun:false` 无 guard 拒绝。
- 缺 `network.ground` 返回 `PROVIDER_UNAVAILABLE`。
- provider success / failure 归一化。
- registry handler 能通过 `lookupHandler("search.ground")` 调到 injected runtime provider。

## 14. 与系统链路的关系

标准调用链是：

`model tool_call JSON -> invocation bridge -> registry -> searchGroundHandler -> storage bestPractice -> core -> BaseToolExecutorPort.network.ground -> normalized result`

这保证 grounding 的证据语义在工具层统一，真实 provider 与资源生命周期仍由 runtime 控制。
