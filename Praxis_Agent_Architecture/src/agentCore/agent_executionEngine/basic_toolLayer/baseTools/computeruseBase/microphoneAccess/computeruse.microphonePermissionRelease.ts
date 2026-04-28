/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphonePermissionRelease entry。
 * 核心目的：公开麦克风权限释放基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有麦克风设备、OS 权限提示、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.releasePermission 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMicrophonePermissionRelease,
  executeMicrophonePermissionReleaseCore,
  microphonePermissionReleaseBaseToolDefinition,
  microphonePermissionReleaseBestPracticeDescriptor,
  microphonePermissionReleaseDescriptor,
  microphonePermissionReleaseHandler,
  microphonePermissionReleaseProviderPractices,
  planMicrophonePermissionRelease,
  selectMicrophonePermissionReleasePractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease/bestPractice.js";

export type {
  MicrophonePermissionReleaseAuditEvent,
  MicrophonePermissionReleaseBestPracticeRequest,
  MicrophonePermissionReleaseBoundary,
  MicrophonePermissionReleaseContext,
  MicrophonePermissionReleaseError,
  MicrophonePermissionReleaseErrorCode,
  MicrophonePermissionReleaseGate,
  MicrophonePermissionReleaseHandlerInput,
  MicrophonePermissionReleaseOutput,
  MicrophonePermissionReleasePracticeSelection,
  MicrophonePermissionReleaseProvider,
  MicrophonePermissionReleaseProviderRequest,
  MicrophonePermissionReleaseProviderResult,
  MicrophonePermissionReleaseRequest,
  MicrophonePermissionReleaseResult,
  MicrophonePermissionReleaseTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRelease/bestPractice.js";
