/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraCapturePhoto entry。
 * 核心目的：公开摄像头拍照基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头访问、图像采集、artifact 存储、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.captureCameraPhoto 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraCapturePhotoBaseToolDefinition,
  cameraCapturePhotoBestPracticeDescriptor,
  cameraCapturePhotoDescriptor,
  cameraCapturePhotoHandler,
  cameraCapturePhotoProviderPractices,
  executeCameraCapturePhoto,
  executeCameraCapturePhotoCore,
  planCameraCapturePhoto,
  selectCameraCapturePhotoPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto/bestPractice.js";

export type {
  CameraCapturePhotoAuditEvent,
  CameraCapturePhotoBestPracticeRequest,
  CameraCapturePhotoBoundary,
  CameraCapturePhotoContext,
  CameraCapturePhotoError,
  CameraCapturePhotoErrorCode,
  CameraCapturePhotoGate,
  CameraCapturePhotoHandlerInput,
  CameraCapturePhotoInput,
  CameraCapturePhotoOutput,
  CameraCapturePhotoPracticeSelection,
  CameraCapturePhotoProvider,
  CameraCapturePhotoProviderRequest,
  CameraCapturePhotoProviderResult,
  CameraCapturePhotoResult,
  CameraCapturePhotoTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto/bestPractice.js";
