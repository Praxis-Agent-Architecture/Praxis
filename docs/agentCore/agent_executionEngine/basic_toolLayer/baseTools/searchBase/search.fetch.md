# search.fetch

> 对应源码：`src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.fetch.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/searchBase`。
- 当前文件：`search.fetch.ts`。
- storage 实现：`src/storagePool/baseToolStorage/searchBase/search.fetch/`。

## 2. 文件职责

`search.fetch` 是 searchBase 里的定向 URL 抓取原语：当上层已经有明确 URL 时，它负责把“抓取网页或远端内容”规范成可治理、可审计、可测试的基础工具调用。

它不是搜索发现工具，也不是证据综合工具：

- 广泛检索用 `search.nativeSearch` 或 `search.searchEngine`。
- 事实锚定和引用整理用 `search.ground`。
- 真实网络抓取只允许通过 runtime 注入的 `BaseToolExecutorPort.network.fetch` 完成。

## 2.1 文件名语义拆解

- `search`：属于检索与来源处理基础工具家族。
- `fetch`：面向一个明确 URL 做受限读取。
- entry 文件保持薄导出；参数校验、dry-run、guard、provider 映射和结果归一化都在 storage 目录完成。

## 3. 目录语义

`src/storagePool/baseToolStorage/searchBase/search.fetch/` 是 canonical storage 目录，包含：

- `core.ts`：校验 URL、method、maxBytes、timeout、治理上下文，并调用 runtime provider。
- `bestPractice.ts`：把 `BaseToolInvokeRequest` 接到 core，暴露 registry handler。
- `dependencies.ts`：把 `BaseToolExecutorPort.network.fetch` 适配成工具 provider。
- `anthropic.ts` / `openai.ts` / `deepmind.ts`：记录三家 provider 对 URL context / web fetch 的实践边界。
- `search.fetch.md`：storage 侧操作手册。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
- 核心目的：提供 基础工具集合 / 搜索基础工具 中的“抓取网页或远端内容”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
- runtime 定位：searchBase / URL fetch。
- 核心目的：为已知 URL 提供受治理的网络读取入口。
- 对接：registry -> handler -> storage bestPractice -> core -> `BaseToolExecutorPort.network.fetch`。
- 边界：不在 baseTool 内创建 SDK client、不绕过 runtime 直接发网络请求。

## 5. 需要提供的能力

- 接收 `target.url`、`method`、`expectedContentType`、`maxBytes`、`timeoutMs`。
- 支持 `context.dryRun` 预览，不触发 provider。
- `dryRun:false` 时要求 affirmative guard，并要求 runtime 提供 `network.fetch`。
- 支持 `allowedDomains` 这类 runtime 治理边界。
- 输出 status、headers、finalUrl、bodyPreview、bytesRead、truncated、contentType 与 audit metadata。
- provider 错误必须映射成 public-safe error，不泄漏堆栈、token、私有路径。

## 6. 输入边界

输入是工具调用 JSON 与治理上下文：

- `target.url` 必须是 `http` 或 `https` 绝对 URL。
- `method` 只允许 `GET` 或 `HEAD`。
- `maxBytes` 和 `timeoutMs` 必须在资源上限内。
- `context.grantedPermissions` 至少包含 `network:read` 和 `search:fetch`。
- `context.guard` 或 `context.networkAccess` 必须显式允许真实执行。

## 7. 输出边界

输出固定为 `agentCore.basicTool.search.fetch` 信封：

- `dispatch: "dry-run"` 表示只生成计划。
- `dispatch: "runtime-fetch"` 表示已通过 runtime provider 执行。
- `resultEnvelope` 只放可展示摘要和标准字段，不暴露底层 provider 原始异常。

## 8. 错误边界

需要稳定区分：

- 输入错误：缺 URL、非法 method、非法 content type。
- 作用域错误：协议不支持、domain 不在允许范围。
- 治理错误：权限不足、无 guard。
- runtime 错误：缺 provider、provider 返回无效、provider 拒绝。

## 9. 依赖对象

- `BaseToolExecutorPort.network.fetch`
- `BaseToolInvokeRequest.runtime.executor`
- TAP / runtime governance context
- storage provider practice 文件

依赖必须显式注入；baseTool 不持有隐藏网络 client。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("search.fetch")`
- runtime tool invocation bridge
- `npm run lab:agentCore:tools` 的 searchBase 挂载路径
- 后续 TAP 高级工具编排

## 11. 不应该做什么

- 不要把它当搜索引擎调用。
- 不要在这里综合事实、生成最终引用答案。
- 不要直接调用 SDK、curl、fetch 或浏览器。
- 不要吞入大对象或把 provider 原始响应直接暴露给上层。

## 12. 最小实现建议

当前实现已经不是 dry-run 壳，而是完整 runtime-port-backed 工具。后续增强应优先扩展 runtime port 或 provider adapter，例如内容类型解析、正文抽取、缓存策略，而不是把网络执行逻辑塞回 `core.ts`。

## 13. 最小测试建议

必须覆盖：

- malformed JSON、空 URL、非法协议、越权 domain。
- dry-run 不调用 provider。
- `dryRun:false` 无 guard 拒绝。
- 缺少 `network.fetch` 返回 `PROVIDER_UNAVAILABLE`。
- provider success / failure 归一化。
- registry handler 能通过 `lookupHandler("search.fetch")` 调到 injected runtime provider。

## 14. 与系统链路的关系

标准调用链是：

`model tool_call JSON -> invocation bridge -> registry -> searchFetchHandler -> storage bestPractice -> core -> BaseToolExecutorPort.network.fetch -> normalized result`

这保证工具层提供词典、schema、治理形状和归一化结果，真实网络资源仍由 runtime 持有。
