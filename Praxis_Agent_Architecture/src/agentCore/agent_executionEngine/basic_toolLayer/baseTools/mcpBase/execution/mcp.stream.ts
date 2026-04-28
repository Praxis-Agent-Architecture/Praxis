/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / MCP 基础工具 / MCP 执行。
 * 核心目的：提供 MCP 基础工具 / MCP 执行 中的“流式执行”基础能力原语。
 * 边界：入口层只做薄导出；真实 MCP client/session/stream/progress/cancel handle 由 runtime 拥有。
 * 对接：通过 builtin registry 挂载 storagePool 的 BaseToolHandler，再调用 runtime-owned MCP executor port。
 * 实现提示：稳定类型契约、JSON 校验、guard/provider 错误边界和 provider-backed 执行都在 storagePool 中实现。
 */

export type {
  McpStreamBestPracticeRequest,
  McpStreamHandlerInput,
  McpStreamPracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/execution/mcp.stream/bestPractice.js";
export {
  executeMcpStream,
  mcpStreamBaseToolDefinition,
  mcpStreamBestPracticeDescriptor,
  mcpStreamDescriptor,
  mcpStreamHandler,
  mcpStreamProviderPractices,
  planMcpStream,
  selectMcpStreamPractice,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/execution/mcp.stream/bestPractice.js";
export type {
  McpStreamChannel,
  McpStreamContext,
  McpStreamEnvelope,
  McpStreamErrorCode,
  McpStreamOutput,
  McpStreamPermission,
  McpStreamProvider,
  McpStreamProviderRequest,
  McpStreamProviderResult,
  McpStreamRequest,
  McpStreamResult,
  McpStreamTarget,
} from "../../../../../../storagePool/baseToolStorage/mcpBase/execution/mcp.stream/core.js";
