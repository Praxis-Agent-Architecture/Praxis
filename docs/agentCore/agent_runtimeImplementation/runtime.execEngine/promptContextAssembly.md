# promptContextAssembly

> 对应源码：`src/runtimeImplementation/runtime.execEngine/promptContextAssembly.ts`

## 定位

`promptContextAssembly` 是 runtime.execEngine 的 PromptPack material gathering 入口。它把 manifest、session summary、recent conversation、当前 user turn、BaseTool context tree、runtime state 和 observations 组装成 Praxis PromptPack materials。

它不生成 provider payload。OpenAI、Anthropic、Gemini 等最终字段仍然由 prompt lowering 和 model adapter 处理。

## 分段边界

- `stableSystemCore`、`declaredRuntimeContext`、`toolDeclarations`、`projectContext` 来自 manifest、runtime 和 BaseTool 事实源，每次重新构建。
- `sessionSummary` 来自 compact 后的旧史压缩。
- `recentConversation` 只保留最近原始消息窗口，并按剩余 context budget 从新到旧截取。
- `observations` 是工具输出和 runtime 事件索引，大 payload 应以 artifact/native tool result 方式引用。
- `userTurn` 总是保留当前任务，不被 recent conversation 截断策略吞掉。

## Budget

当调用方提供 `maxRecentConversationTokens` 时直接使用它。否则根据 `contextWindowTokens - stable/dynamic used tokens - responseReserve - safetyMargin` 计算 recent conversation 可用预算。

默认 reserve 使用 context window 比例并设置上限：response reserve 取窗口的 20%，最多 8192 tokens；safety margin 取窗口的 5%，最多 1024 tokens。这样小上下文模型不会因为固定大 reserve 把 recent conversation 永久挤掉。

这保证 PromptPack 的历史承载点是“summary + recent raw window”，而不是无限增长的全量 transcript。
