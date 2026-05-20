/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 远端操作。
 * 核心目的：提供 Git 基础工具 / 远端操作 中的“抓取远端更新”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：entry 层只暴露稳定 public surface；真实契约、provider 适配和 runtime git executor 调用在 storagePool。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type {
  GitFetchRemoteTagsMode,
  GitFetchRemoteUpdateEntry,
  GitFetchRemoteUpdatesAuditEvent,
  GitFetchRemoteUpdatesBestPracticeRequest,
  GitFetchRemoteUpdatesContext,
  GitFetchRemoteUpdatesEnvelope,
  GitFetchRemoteUpdatesError,
  GitFetchRemoteUpdatesErrorBoundary,
  GitFetchRemoteUpdatesErrorCode,
  GitFetchRemoteUpdatesGuard,
  GitFetchRemoteUpdatesHandlerInput,
  GitFetchRemoteUpdatesOutput,
  GitFetchRemoteUpdatesPermission,
  GitFetchRemoteUpdatesPlan,
  GitFetchRemoteUpdatesPracticeSelection,
  GitFetchRemoteUpdatesProvider,
  GitFetchRemoteUpdatesProviderRequest,
  GitFetchRemoteUpdatesProviderResult,
  GitFetchRemoteUpdatesRequest,
  GitFetchRemoteUpdatesResult,
  GitFetchRemoteUpdatesRisk,
  GitFetchRemoteUpdatesRiskCategory,
  GitFetchRemoteUpdatesRuntimeEntry,
  GitFetchRemoteUpdatesTarget,
} from "../../../../../storagePool/baseToolStorage/gitBase/remote/git.fetchRemoteUpdates/bestPractice.js";

export {
  executeGitFetchRemoteUpdates,
  gitFetchRemoteUpdatesBaseToolDefinition,
  gitFetchRemoteUpdatesBestPracticeDescriptor,
  gitFetchRemoteUpdatesDescriptor,
  gitFetchRemoteUpdatesHandler,
  gitFetchRemoteUpdatesProviderPractices,
  parseGitFetchRemoteUpdatesResult,
  planFetchRemoteUpdates,
  planGitFetchRemoteUpdates,
  selectGitFetchRemoteUpdatesPractice,
} from "../../../../../storagePool/baseToolStorage/gitBase/remote/git.fetchRemoteUpdates/bestPractice.js";
