/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 订阅。
 * 核心目的：提供 MCP 基础工具 / MCP 订阅 中的“订阅事件或资源”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/subscription/event buffer 由 runtime 拥有。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：稳定类型契约、最小可测行为和清晰错误边界在 storagePool 中实现。
 */

export type {
  McpSubscribeBestPracticeRequest,
  McpSubscribeHandlerInput,
  McpSubscribePracticeSelection,
} from "../../../../../storagePool/baseToolStorage/mcpBase/subscription/mcp.subscribe/bestPractice.js";
export {
  executeMcpSubscribe,
  mcpSubscribeBaseToolDefinition,
  mcpSubscribeBestPracticeDescriptor,
  mcpSubscribeDescriptor,
  mcpSubscribeHandler,
  mcpSubscribeProviderPractices,
  planMcpSubscribe,
  selectMcpSubscribePractice,
} from "../../../../../storagePool/baseToolStorage/mcpBase/subscription/mcp.subscribe/bestPractice.js";
export type {
  McpSubscribeContext,
  McpSubscribeErrorCode,
  McpSubscribeOutput,
  McpSubscribePermission,
  McpSubscribeProvider,
  McpSubscribeProviderResult,
  McpSubscribeRequest,
  McpSubscribeResult,
  McpSubscribeSubjectType,
  McpSubscribeTarget,
  McpSubscribeReplayPolicy,
  McpSubscriptionEnvelope,
} from "../../../../../storagePool/baseToolStorage/mcpBase/subscription/mcp.subscribe/core.js";
