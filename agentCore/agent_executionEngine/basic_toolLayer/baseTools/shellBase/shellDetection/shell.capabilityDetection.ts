/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 探测。
 * 核心目的：提供 Shell 基础工具 / Shell 探测 中的“探测 Shell 能力”基础能力原语。
 * 边界：入口层只保留显式导出，真实实现与 provider practice 位于 storagePool。
 * 对接：通过 builtin baseTool registry 暴露 handler，由 runtime 注入 executor 与治理上下文。
 * 实现提示：保持入口薄层，不在这里实现探测、审批、sandbox 或进程策略。
 */

export type {
  ShellCapabilityDetectionAuditEvent,
  ShellCapabilityDetectionBoundary,
  ShellCapabilityDetectionContext,
  ShellCapabilityDetectionError,
  ShellCapabilityDetectionErrorCode,
  ShellCapabilityDetectionOutput,
  ShellCapabilityDetectionPermission,
  ShellCapabilityDetectionProvider,
  ShellCapabilityDetectionProviderRequest,
  ShellCapabilityDetectionRequest,
  ShellCapabilityDetectionResult,
  ShellCapabilityDetectionTarget,
  ShellCapabilityFinding,
  ShellCapabilityName,
  ShellCapabilityStatus,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/core.js";

export {
  executeShellCapabilityDetection,
  planShellCapabilityDetection,
  shellCapabilityDetectionDescriptor,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/core.js";

export {
  shellCapabilityDetectionBaseToolDefinition,
  shellCapabilityDetectionBestPracticeDescriptor,
  shellCapabilityDetectionHandler,
  shellCapabilityDetectionProviderPractices,
  selectShellCapabilityDetectionPractice,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/bestPractice.js";

export type {
  ShellCapabilityDetectionBestPracticeRequest,
  ShellCapabilityDetectionHandlerInput,
  ShellCapabilityDetectionPracticeSelection,
} from "../../../../../../storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/bestPractice.js";
