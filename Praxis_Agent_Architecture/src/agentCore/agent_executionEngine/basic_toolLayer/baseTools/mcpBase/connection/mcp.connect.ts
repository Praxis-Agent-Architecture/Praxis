/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 连接。
 * 核心目的：提供 MCP 基础工具 / MCP 连接 中的“建立连接”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/transport/OAuth 由 runtime 拥有。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：稳定类型契约、最小可测行为和清晰错误边界在 storagePool 中实现。
 */

export type {
  McpConnectBestPracticeRequest,
  McpConnectHandlerInput,
  McpConnectPracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.connect/bestPractice.js";
export {
  executeMcpConnect,
  mcpConnectBaseToolDefinition,
  mcpConnectBestPracticeDescriptor,
  mcpConnectDescriptor,
  mcpConnectHandler,
  mcpConnectProviderPractices,
  planMcpConnect,
  selectMcpConnectPractice,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.connect/bestPractice.js";
export type {
  McpConnectContext,
  McpConnectEnvelope,
  McpConnectErrorCode,
  McpConnectOutput,
  McpConnectPermission,
  McpConnectProvider,
  McpConnectProviderResult,
  McpConnectRequest,
  McpConnectResult,
  McpConnectTarget,
  McpConnectTransport,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/connection/mcp.connect/core.js";
