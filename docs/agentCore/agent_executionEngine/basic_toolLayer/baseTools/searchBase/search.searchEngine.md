# search.searchEngine

> 对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/searchBase/search.searchEngine.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/searchBase`。
- 当前文件：`search.searchEngine.ts`。
- storage 实现：`src/storagePool/baseToolStorage/searchBase/search.searchEngine/`。

## 2. 文件职责

`search.searchEngine` 是“通用/自建搜索引擎调用”原语。它用于接 Raxode websearch adapter、浏览器搜索、企业搜索、普通搜索服务或后续自建搜索 backend。

它和 `search.nativeSearch` 的边界很关键：

- `search.nativeSearch` = OpenAI / Anthropic / DeepMind 官方 provider-native web search。
- `search.searchEngine` = Praxis runtime 自己挂的普通搜索引擎或搜索服务。
- `search.fetch` = 已知 URL 抓取。
- `search.ground` = 基于证据做事实锚定和引用整理。

## 2.1 文件名语义拆解

- `search`：属于 searchBase 家族。
- `searchEngine`：强调搜索引擎后端，而不是三家模型 provider 的 native search tool。
- entry 文件只做薄导出；实现语义在 canonical storage 目录。

## 3. 目录语义

`src/storagePool/baseToolStorage/searchBase/search.searchEngine/` 包含：

- `core.ts`：校验 query、provider、maxResults、recency、safeSearch、locale、上下文和 provider 调用。
- `bestPractice.ts`：提供 registry handler 与 schema。
- `dependencies.ts`：把 `BaseToolExecutorPort.network.search` 适配成 provider。
- `anthropic.ts` / `openai.ts` / `deepmind.ts`：记录它与三家 native web search 的边界。
- `search.searchEngine.md`：storage 侧操作手册。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
- 核心目的：提供 基础工具集合 / 搜索基础工具 中的“调用搜索引擎”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
- runtime 定位：searchBase / generic search engine。
- 核心目的：把普通搜索引擎查询做成可治理、可审计、可替换的基础工具。
- 对接：registry -> handler -> storage bestPractice -> core -> `BaseToolExecutorPort.network.search`。
- 边界：不把 OpenAI/Claude/Gemini native web search 混进来。

## 5. 需要提供的能力

- 输入 `query`、`provider`、`maxResults`、`recencyDays`、`safeSearch`、`locale`。
- `provider` 表示 runtime 搜索后端类型：`generic`、`browser`、`custom`。
- dry-run 生成搜索计划，不调用 provider。
- 真实执行必须 `dryRun:false` + affirmative guard + injected runtime provider。
- 输出统一的 results、answer、providerMetadata、raw 摘要。

## 6. 输入边界

- `target.query` 必须是非空安全字符串。
- `target.provider` 只能是 `generic`、`browser`、`custom`。
- `maxResults`、`recencyDays` 必须在资源限制内。
- `context.grantedPermissions` 必须包含 `network:search`。
- `context.guard` 或 `context.networkAccess` 必须显式允许真实搜索。

## 7. 输出边界

输出固定为 `agentCore.basicTool.search.searchEngine`：

- `dispatch: "dry-run"`：只描述计划。
- `dispatch: "runtime-search"`：通过 `BaseToolExecutorPort.network.search` 执行。
- `results` 归一化为 title/url/snippet/source/publishedAt/score。
- 错误只返回 stable public-safe code 和 message。

## 8. 错误边界

必须区分：

- malformed JSON、缺 query、非法 provider。
- provider scope 不允许。
- 权限不足、无 guard。
- 缺 runtime provider。
- provider failure / invalid provider result。

## 9. 依赖对象

- `BaseToolExecutorPort.network.search`
- `BaseToolInvokeRequest.runtime.executor`
- runtime governance context
- Raxode 或其他 runtime search adapter

依赖由 runtime 注入；baseTool 不创建隐藏 SDK client。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("search.searchEngine")`
- runtime tool invocation bridge
- `npm run lab:agentCore:tools`
- 后续 TAP 搜索编排

## 11. 不应该做什么

- 不要调用 provider-native web search；那属于 `search.nativeSearch`。
- 不要抓取网页正文；那属于 `search.fetch`。
- 不要做最终事实锚定；那属于 `search.ground`。
- 不要让 agent 传任意搜索命令或任意外部请求。

## 12. 最小实现建议

当前实现已完成 canonical storage、registry handler、runtime provider adapter 和测试。后续接真实搜索服务时，应只扩展 `BaseToolExecutorPort.network.search` 的 runtime 实现或 adapter，不改变 baseTool 语义。

## 13. 最小测试建议

必须覆盖：

- malformed JSON、空 query、非法 provider、provider scope。
- dry-run 不调用 provider。
- `dryRun:false` 无 guard 拒绝。
- 缺 `network.search` 返回 `PROVIDER_UNAVAILABLE`。
- provider success / failure 归一化。
- registry handler 能通过 `lookupHandler("search.searchEngine")` 调到 injected runtime provider。

## 14. 与系统链路的关系

标准调用链是：

`model tool_call JSON -> invocation bridge -> registry -> searchEngineHandler -> storage bestPractice -> core -> BaseToolExecutorPort.network.search -> normalized result`

这使搜索引擎后端可替换，同时上层始终看到统一 BaseTool 形状。
