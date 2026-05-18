/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenRecording / screenRecordingStorage entry。
 * 核心目的：公开屏幕录制存储基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有录屏 session、视频字节、媒体编码、artifact 存储、TAP 高级工具策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.stopRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeScreenRecordingStorage,
  executeScreenRecordingStorageCore,
  planScreenRecordingStorage,
  screenRecordingStorageBaseToolDefinition,
  screenRecordingStorageBestPracticeDescriptor,
  screenRecordingStorageDescriptor,
  screenRecordingStorageHandler,
  screenRecordingStorageProviderPractices,
  selectScreenRecordingStoragePractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage/bestPractice.js";

export type {
  ScreenRecordingStorageAuditEvent,
  ScreenRecordingStorageBestPracticeRequest,
  ScreenRecordingStorageBoundary,
  ScreenRecordingStorageContext,
  ScreenRecordingStorageError,
  ScreenRecordingStorageErrorCode,
  ScreenRecordingStorageGate,
  ScreenRecordingStorageHandlerInput,
  ScreenRecordingStorageOutput,
  ScreenRecordingStoragePracticeSelection,
  ScreenRecordingStorageProvider,
  ScreenRecordingStorageProviderRequest,
  ScreenRecordingStorageProviderResult,
  ScreenRecordingStorageRequest,
  ScreenRecordingStorageResult,
  ScreenRecordingStorageRetentionPolicy,
  ScreenRecordingStorageTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage/bestPractice.js";
