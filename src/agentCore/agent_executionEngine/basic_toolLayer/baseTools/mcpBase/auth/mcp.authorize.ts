/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 鉴权。
 * 核心目的：提供 MCP 基础工具 / MCP 鉴权 中的“完成授权”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP policy/session/permission decision 由 runtime/TAP 拥有。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：稳定类型契约、最小可测行为和清晰错误边界在 storagePool 中实现。
 */

export type {
  McpAuthorizeBestPracticeRequest,
  McpAuthorizeHandlerInput,
  McpAuthorizePracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authorize/bestPractice.js";
export {
  executeMcpAuthorize,
  mcpAuthorizeBaseToolDefinition,
  mcpAuthorizeBestPracticeDescriptor,
  mcpAuthorizeDescriptor,
  mcpAuthorizeHandler,
  mcpAuthorizeProviderPractices,
  planMcpAuthorize,
  selectMcpAuthorizePractice,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authorize/bestPractice.js";
export type {
  McpAuthorizeAction,
  McpAuthorizeContext,
  McpAuthorizeErrorCode,
  McpAuthorizeOutput,
  McpAuthorizePermission,
  McpAuthorizeProvider,
  McpAuthorizeProviderResult,
  McpAuthorizeRequest,
  McpAuthorizeResult,
  McpAuthorizeTarget,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authorize/core.js";
