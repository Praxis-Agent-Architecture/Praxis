/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraPermissionRequest entry。
 * 核心目的：公开摄像头权限申请基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头访问、OS 权限提示、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.requestPermission 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraPermissionRequestBaseToolDefinition,
  cameraPermissionRequestBestPracticeDescriptor,
  cameraPermissionRequestDescriptor,
  cameraPermissionRequestHandler,
  cameraPermissionRequestProviderPractices,
  executeCameraPermissionRequest,
  executeCameraPermissionRequestCore,
  planCameraPermissionRequest,
  selectCameraPermissionRequestPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest/bestPractice.js";

export type {
  CameraPermissionRequestBoundary as CameraAccessBoundary,
  CameraPermissionRequestGate as CameraAccessGate,
  CameraPermissionProvider,
  CameraPermissionProviderRequest,
  CameraPermissionProviderResult,
  CameraPermissionRequestAuditEvent,
  CameraPermissionRequestBestPracticeRequest,
  CameraPermissionRequestBoundary,
  CameraPermissionRequestContext,
  CameraPermissionRequestError,
  CameraPermissionRequestErrorCode,
  CameraPermissionRequestGate,
  CameraPermissionRequestHandlerInput,
  CameraPermissionRequestInput,
  CameraPermissionRequestMode,
  CameraPermissionRequestOutput,
  CameraPermissionRequestPracticeSelection,
  CameraPermissionRequestResult,
  CameraPermissionRequestTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraPermissionRequest/bestPractice.js";

export type CameraAccessAuditRecord = {
  guard: string;
  event: string;
  metadata: Readonly<Record<string, unknown>>;
};
