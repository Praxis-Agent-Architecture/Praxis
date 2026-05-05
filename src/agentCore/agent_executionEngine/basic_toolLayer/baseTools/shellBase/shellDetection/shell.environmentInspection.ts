/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“检查执行环境”基础能力原语。
 * 边界：入口层只保留显式导出，真实实现与 provider practice 位于 storagePool。
 * 对接：通过 builtin baseTool registry 暴露 handler，由 runtime 注入 executor 与治理上下文。
 * 实现提示：保持入口薄层，不在这里实现探测、审批、sandbox 或进程策略。
 */

export type {
  ShellEnvironmentInspectionAuditEvent,
  ShellEnvironmentInspectionBoundary,
  ShellEnvironmentInspectionContext,
  ShellEnvironmentInspectionError,
  ShellEnvironmentInspectionErrorCode,
  ShellEnvironmentInspectionOutput,
  ShellEnvironmentInspectionPermission,
  ShellEnvironmentInspectionProvider,
  ShellEnvironmentInspectionProviderRequest,
  ShellEnvironmentInspectionRequest,
  ShellEnvironmentInspectionResult,
  ShellEnvironmentInspectionTarget,
  ShellEnvironmentSnapshot,
  ShellEnvironmentVariableReport,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/core.js";

export {
  executeShellEnvironmentInspection,
  inspectShellEnvironment,
  shellEnvironmentInspectionDescriptor,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/core.js";

export {
  shellEnvironmentInspectionBaseToolDefinition,
  shellEnvironmentInspectionBestPracticeDescriptor,
  shellEnvironmentInspectionHandler,
  shellEnvironmentInspectionProviderPractices,
  selectShellEnvironmentInspectionPractice,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/bestPractice.js";

export type {
  ShellEnvironmentInspectionBestPracticeRequest,
  ShellEnvironmentInspectionHandlerInput,
  ShellEnvironmentInspectionPracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/bestPractice.js";
