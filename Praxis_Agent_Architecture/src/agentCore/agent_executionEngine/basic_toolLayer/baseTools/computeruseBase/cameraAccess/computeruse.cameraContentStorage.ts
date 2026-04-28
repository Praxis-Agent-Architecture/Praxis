/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraContentStorage entry。
 * 核心目的：公开摄像头内容存储基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有摄像头内容、artifact 存储、retention policy、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.artifact.store 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cameraContentStorageBaseToolDefinition,
  cameraContentStorageBestPracticeDescriptor,
  cameraContentStorageDescriptor,
  cameraContentStorageHandler,
  cameraContentStorageProviderPractices,
  executeCameraContentStorage,
  executeCameraContentStorageCore,
  planCameraContentStorage,
  selectCameraContentStoragePractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraContentStorage/bestPractice.js";

export type {
  CameraContentStorageAuditEvent,
  CameraContentStorageBestPracticeRequest,
  CameraContentStorageBoundary,
  CameraContentStorageContext,
  CameraContentStorageError,
  CameraContentStorageErrorCode,
  CameraContentStorageGate,
  CameraContentStorageHandlerInput,
  CameraContentStorageKind,
  CameraContentStorageOutput,
  CameraContentStoragePracticeSelection,
  CameraContentStorageProvider,
  CameraContentStorageProviderRequest,
  CameraContentStorageProviderResult,
  CameraContentStorageRequest,
  CameraContentStorageResult,
  CameraContentStorageRetentionPolicy,
  CameraContentStorageTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraContentStorage/bestPractice.js";
