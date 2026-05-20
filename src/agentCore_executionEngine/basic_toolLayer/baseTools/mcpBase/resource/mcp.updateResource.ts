/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“更新资源”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/resource persistence 由 runtime 拥有。
 * 对接：通过 builtin registry 挂载 storagePool 的 BaseToolHandler，再调用 runtime-owned MCP executor port。
 * 实现提示：稳定类型契约、JSON 校验、guard/provider 错误边界和 provider-backed 执行都在 storagePool 中实现。
 */

export type {
  McpUpdateResourceBestPracticeRequest,
  McpUpdateResourceHandlerInput,
  McpUpdateResourcePracticeSelection,
} from "../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.updateResource/bestPractice.js";
export {
  executeMcpResourceUpdate,
  mcpUpdateResourceBaseToolDefinition,
  mcpUpdateResourceBestPracticeDescriptor,
  mcpUpdateResourceDescriptor,
  mcpUpdateResourceHandler,
  mcpUpdateResourceProviderPractices,
  planMcpResourceUpdate,
  selectMcpUpdateResourcePractice,
} from "../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.updateResource/bestPractice.js";
export type {
  McpUpdateResourceContent,
  McpUpdateResourceContext,
  McpUpdateResourceErrorCode,
  McpUpdateResourceMutationEnvelope,
  McpUpdateResourceOutput,
  McpUpdateResourcePermission,
  McpUpdateResourceProvider,
  McpUpdateResourceProviderRequest,
  McpUpdateResourceProviderResult,
  McpUpdateResourceRequest,
  McpUpdateResourceResult,
  McpUpdateResourceTarget,
} from "../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.updateResource/core.js";
