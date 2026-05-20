/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 连接。
 * 核心目的：提供 MCP 基础工具 / MCP 连接 中的“断开连接”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/transport/OAuth 由 runtime 拥有。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：稳定类型契约、最小可测行为和清晰错误边界在 storagePool 中实现。
 */

export type {
  McpDisconnectBestPracticeRequest,
  McpDisconnectHandlerInput,
  McpDisconnectPracticeSelection,
} from "../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.disconnect/bestPractice.js";
export {
  executeMcpDisconnect,
  mcpDisconnectBaseToolDefinition,
  mcpDisconnectBestPracticeDescriptor,
  mcpDisconnectDescriptor,
  mcpDisconnectHandler,
  mcpDisconnectProviderPractices,
  planMcpDisconnect,
  selectMcpDisconnectPractice,
} from "../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.disconnect/bestPractice.js";
export type {
  McpDisconnectContext,
  McpDisconnectEnvelope,
  McpDisconnectErrorCode,
  McpDisconnectOutput,
  McpDisconnectPermission,
  McpDisconnectProvider,
  McpDisconnectProviderResult,
  McpDisconnectRequest,
  McpDisconnectResult,
  McpDisconnectTarget,
} from "../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.disconnect/core.js";
