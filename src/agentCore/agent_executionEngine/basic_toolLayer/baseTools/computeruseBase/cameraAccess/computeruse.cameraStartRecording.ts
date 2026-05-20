/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraStartRecording entry。
 * 核心目的：公开摄像头开始录制基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头访问、录制流、codec、artifact 存储、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraStartRecordingBaseToolDefinition,
  cameraStartRecordingBestPracticeDescriptor,
  cameraStartRecordingDescriptor,
  cameraStartRecordingHandler,
  cameraStartRecordingProviderPractices,
  executeCameraStartRecording,
  executeCameraStartRecordingCore,
  planCameraStartRecording,
  selectCameraStartRecordingPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStartRecording/bestPractice.js";

export type {
  CameraStartRecordingAuditEvent,
  CameraStartRecordingBestPracticeRequest,
  CameraStartRecordingBoundary,
  CameraStartRecordingContext,
  CameraStartRecordingError,
  CameraStartRecordingErrorCode,
  CameraStartRecordingGate,
  CameraStartRecordingHandlerInput,
  CameraStartRecordingInput,
  CameraStartRecordingOutput,
  CameraStartRecordingPracticeSelection,
  CameraStartRecordingProvider,
  CameraStartRecordingProviderRequest,
  CameraStartRecordingProviderResult,
  CameraStartRecordingResult,
  CameraStartRecordingTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraStartRecording/bestPractice.js";
