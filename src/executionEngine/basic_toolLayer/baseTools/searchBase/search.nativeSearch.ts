/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 搜索基础工具。
 * 核心目的：提供 基础工具集合 / 搜索基础工具 中的“三家官方原生网络搜索”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type {
  NativeSearchAuditEvent,
  NativeSearchBestPracticeRequest,
  NativeSearchContext,
  NativeSearchError,
  NativeSearchErrorBoundary,
  NativeSearchErrorCode,
  NativeSearchExecution,
  NativeSearchExecutor,
  NativeSearchCitation,
  NativeSearchCitationMode,
  NativeSearchContextSize,
  NativeSearchFreshness,
  NativeSearchGate,
  NativeSearchHandlerInput,
  NativeSearchOutput,
  NativeSearchPermission,
  NativeSearchPracticeSelection,
  NativeSearchProvider,
  NativeSearchRequest,
  NativeSearchResult,
  NativeSearchSource,
  NativeSearchTarget,
  NativeSearchUserLocation,
} from "../../../../storagePool/baseToolStorage/searchBase/search.nativeSearch/bestPractice.js";

export {
  executeNativeSearch,
  nativeSearchBaseToolDefinition,
  nativeSearchBestPracticeDescriptor,
  nativeSearchDescriptor,
  nativeSearchHandler,
  nativeSearchProviderPractices,
  planNativeSearch,
  selectNativeSearchPractice,
} from "../../../../storagePool/baseToolStorage/searchBase/search.nativeSearch/bestPractice.js";
