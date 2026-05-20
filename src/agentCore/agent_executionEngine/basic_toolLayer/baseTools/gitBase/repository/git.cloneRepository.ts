/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Git 基础工具 / 仓库操作。
 * 核心目的：提供 Git 基础工具 / 仓库操作 中的“克隆仓库”基础能力原语。
 * 边界：entry 层只暴露稳定 public surface；真实契约、provider 适配和 runtime git executor 调用在 storagePool。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type {
  GitCloneRepositoryAuditEvent,
  GitCloneRepositoryBestPracticeRequest,
  GitCloneRepositoryContext,
  GitCloneRepositoryEnvelope,
  GitCloneRepositoryError,
  GitCloneRepositoryErrorBoundary,
  GitCloneRepositoryErrorCode,
  GitCloneRepositoryGuard,
  GitCloneRepositoryHandlerInput,
  GitCloneRepositoryOutput,
  GitCloneRepositoryPermission,
  GitCloneRepositoryPlan,
  GitCloneRepositoryPracticeSelection,
  GitCloneRepositoryProvider,
  GitCloneRepositoryProviderRequest,
  GitCloneRepositoryProviderResult,
  GitCloneRepositoryRequest,
  GitCloneRepositoryResult,
  GitCloneRepositoryRisk,
  GitCloneRepositoryRiskCategory,
  GitCloneRepositoryRuntimeEntry,
  GitCloneRepositoryTarget,
} from "../../../../../../storagePool/baseToolStorage/gitBase/repository/git.cloneRepository/bestPractice.js";

export {
  executeGitCloneRepository,
  gitCloneRepositoryBaseToolDefinition,
  gitCloneRepositoryBestPracticeDescriptor,
  gitCloneRepositoryDescriptor,
  gitCloneRepositoryHandler,
  gitCloneRepositoryProviderPractices,
  parseGitCloneRepositoryResult,
  planGitCloneRepository,
  planGitRepositoryClone,
  selectGitCloneRepositoryPractice,
} from "../../../../../../storagePool/baseToolStorage/gitBase/repository/git.cloneRepository/bestPractice.js";
