/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphonePermissionRequest entry。
 * 核心目的：公开麦克风权限申请基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有麦克风设备、OS 权限提示、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.requestPermission 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMicrophonePermissionRequest,
  executeMicrophonePermissionRequestCore,
  microphonePermissionRequestBaseToolDefinition,
  microphonePermissionRequestBestPracticeDescriptor,
  microphonePermissionRequestDescriptor,
  microphonePermissionRequestHandler,
  microphonePermissionRequestProviderPractices,
  planMicrophonePermissionRequest,
  selectMicrophonePermissionRequestPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest/bestPractice.js";

export type {
  MicrophonePermissionProvider,
  MicrophonePermissionProviderRequest,
  MicrophonePermissionProviderResult,
  MicrophonePermissionRequestAuditEvent,
  MicrophonePermissionRequestBestPracticeRequest,
  MicrophonePermissionRequestBoundary,
  MicrophonePermissionRequestContext,
  MicrophonePermissionRequestError,
  MicrophonePermissionRequestErrorCode,
  MicrophonePermissionRequestGate,
  MicrophonePermissionRequestHandlerInput,
  MicrophonePermissionRequestInput,
  MicrophonePermissionRequestMode,
  MicrophonePermissionRequestOutput,
  MicrophonePermissionRequestPracticeSelection,
  MicrophonePermissionRequestResult,
  MicrophonePermissionRequestTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest/bestPractice.js";
