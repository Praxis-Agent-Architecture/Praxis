/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraPermissionRelease entry。
 * 核心目的：公开摄像头权限释放基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头访问、OS 权限状态、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.releasePermission 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraPermissionReleaseBaseToolDefinition,
  cameraPermissionReleaseBestPracticeDescriptor,
  cameraPermissionReleaseDescriptor,
  cameraPermissionReleaseHandler,
  cameraPermissionReleaseProviderPractices,
  executeCameraPermissionRelease,
  executeCameraPermissionReleaseCore,
  planCameraPermissionRelease,
  selectCameraPermissionReleasePractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease/bestPractice.js";

export type {
  CameraPermissionReleaseAuditEvent,
  CameraPermissionReleaseBestPracticeRequest,
  CameraPermissionReleaseBoundary,
  CameraPermissionReleaseContext,
  CameraPermissionReleaseError,
  CameraPermissionReleaseErrorCode,
  CameraPermissionReleaseGate,
  CameraPermissionReleaseHandlerInput,
  CameraPermissionReleaseInput,
  CameraPermissionReleaseOutput,
  CameraPermissionReleasePracticeSelection,
  CameraPermissionReleaseProvider,
  CameraPermissionReleaseProviderRequest,
  CameraPermissionReleaseProviderResult,
  CameraPermissionReleaseResult,
  CameraPermissionReleaseTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRelease/bestPractice.js";
