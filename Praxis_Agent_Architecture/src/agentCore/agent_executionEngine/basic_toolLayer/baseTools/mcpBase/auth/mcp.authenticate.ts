/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 鉴权。
 * 核心目的：提供 MCP 基础工具 / MCP 鉴权 中的“完成认证”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP auth/OAuth/token/session 由 runtime 拥有。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：稳定类型契约、最小可测行为和清晰错误边界在 storagePool 中实现。
 */

export type {
  McpAuthenticateBestPracticeRequest,
  McpAuthenticateHandlerInput,
  McpAuthenticatePracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authenticate/bestPractice.js";
export {
  executeMcpAuthenticate,
  mcpAuthenticateBaseToolDefinition,
  mcpAuthenticateBestPracticeDescriptor,
  mcpAuthenticateDescriptor,
  mcpAuthenticateHandler,
  mcpAuthenticateProviderPractices,
  planMcpAuthenticate,
  selectMcpAuthenticatePractice,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authenticate/bestPractice.js";
export type {
  McpAuthenticateContext,
  McpAuthenticateErrorCode,
  McpAuthenticateOutput,
  McpAuthenticatePermission,
  McpAuthenticateProvider,
  McpAuthenticateProviderResult,
  McpAuthenticateRequest,
  McpAuthenticateResult,
  McpAuthenticateTarget,
  McpAuthStrategy,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/auth/mcp.authenticate/core.js";
