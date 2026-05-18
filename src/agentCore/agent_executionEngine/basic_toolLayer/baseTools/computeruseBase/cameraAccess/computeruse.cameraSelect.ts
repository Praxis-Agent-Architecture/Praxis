/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraSelect entry。
 * 核心目的：公开摄像头设备选择基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头访问、设备枚举、OS 选择状态、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.selectDevice 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraSelectBaseToolDefinition,
  cameraSelectBestPracticeDescriptor,
  cameraSelectDescriptor,
  cameraSelectHandler,
  cameraSelectProviderPractices,
  executeCameraSelect,
  executeCameraSelectCore,
  planCameraSelect,
  selectCameraSelectPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraSelect/bestPractice.js";

export type {
  CameraSelectableDevice,
  CameraSelectableDeviceKind,
  CameraSelectAuditEvent,
  CameraSelectBestPracticeRequest,
  CameraSelectBoundary,
  CameraSelectContext,
  CameraSelectError,
  CameraSelectErrorCode,
  CameraSelectGate,
  CameraSelectHandlerInput,
  CameraSelectInput,
  CameraSelectOutput,
  CameraSelectPracticeSelection,
  CameraSelectProvider,
  CameraSelectProviderRequest,
  CameraSelectProviderResult,
  CameraSelectResult,
  CameraSelectTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraSelect/bestPractice.js";
