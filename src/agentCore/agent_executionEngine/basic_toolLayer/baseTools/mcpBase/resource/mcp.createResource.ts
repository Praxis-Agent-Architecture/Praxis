/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 资源。
 * 核心目的：提供 MCP 基础工具 / MCP 资源 中的“创建资源”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/resource persistence 由 runtime 拥有。
 * 对接：通过 builtin registry 挂载 storagePool 的 BaseToolHandler，再调用 runtime-owned MCP executor port。
 * 实现提示：稳定类型契约、JSON 校验、guard/provider 错误边界和 provider-backed 执行都在 storagePool 中实现。
 */

export type {
  McpCreateResourceBestPracticeRequest,
  McpCreateResourceHandlerInput,
  McpCreateResourcePracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.createResource/bestPractice.js";
export {
  executeMcpCreateResource,
  mcpCreateResourceBaseToolDefinition,
  mcpCreateResourceBestPracticeDescriptor,
  mcpCreateResourceDescriptor,
  mcpCreateResourceHandler,
  mcpCreateResourceProviderPractices,
  planMcpCreateResource,
  selectMcpCreateResourcePractice,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.createResource/bestPractice.js";
export type {
  McpCreateResourceContext,
  McpCreateResourceEnvelope,
  McpCreateResourceErrorCode,
  McpCreateResourceOutput,
  McpCreateResourcePermission,
  McpCreateResourceProvider,
  McpCreateResourceProviderRequest,
  McpCreateResourceProviderResult,
  McpCreateResourceRequest,
  McpCreateResourceResult,
  McpCreateResourceTarget,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/resource/mcp.createResource/core.js";
