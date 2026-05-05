/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraFaceRecognition entry。
 * 核心目的：公开摄像头帧人脸分析基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头内容、vision provider、生物识别存储、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.analyzeCameraFrame 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraFaceRecognitionBaseToolDefinition,
  cameraFaceRecognitionBestPracticeDescriptor,
  cameraFaceRecognitionDescriptor,
  cameraFaceRecognitionHandler,
  cameraFaceRecognitionProviderPractices,
  executeCameraFaceRecognition,
  executeCameraFaceRecognitionCore,
  planCameraFaceRecognition,
  selectCameraFaceRecognitionPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition/bestPractice.js";

export type {
  CameraFaceRecognitionAuditEvent,
  CameraFaceRecognitionBestPracticeRequest,
  CameraFaceRecognitionBoundary,
  CameraFaceRecognitionContext,
  CameraFaceRecognitionError,
  CameraFaceRecognitionErrorCode,
  CameraFaceRecognitionFace,
  CameraFaceRecognitionGate,
  CameraFaceRecognitionHandlerInput,
  CameraFaceRecognitionInput,
  CameraFaceRecognitionMode,
  CameraFaceRecognitionOutput,
  CameraFaceRecognitionPracticeSelection,
  CameraFaceRecognitionProvider,
  CameraFaceRecognitionProviderRequest,
  CameraFaceRecognitionProviderResult,
  CameraFaceRecognitionResult,
  CameraFaceRecognitionTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraFaceRecognition/bestPractice.js";
