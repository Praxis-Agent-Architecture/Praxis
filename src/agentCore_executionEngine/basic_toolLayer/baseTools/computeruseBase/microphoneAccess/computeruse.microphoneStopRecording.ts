/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphoneStopRecording entry。
 * 核心目的：公开麦克风录制停止基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有麦克风设备流、录音 session、媒体编码器、artifact 存储、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.stopRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMicrophoneStopRecording,
  executeMicrophoneStopRecordingCore,
  microphoneStopRecordingBaseToolDefinition,
  microphoneStopRecordingBestPracticeDescriptor,
  microphoneStopRecordingDescriptor,
  microphoneStopRecordingHandler,
  microphoneStopRecordingProviderPractices,
  planMicrophoneStopRecording,
  selectMicrophoneStopRecordingPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording/bestPractice.js";

export type {
  MicrophoneStopRecordingAuditEvent,
  MicrophoneStopRecordingBestPracticeRequest,
  MicrophoneStopRecordingBoundary,
  MicrophoneStopRecordingContext,
  MicrophoneStopRecordingError,
  MicrophoneStopRecordingErrorCode,
  MicrophoneStopRecordingGate,
  MicrophoneStopRecordingHandlerInput,
  MicrophoneStopRecordingOutput,
  MicrophoneStopRecordingPracticeSelection,
  MicrophoneStopRecordingProvider,
  MicrophoneStopRecordingProviderRequest,
  MicrophoneStopRecordingProviderResult,
  MicrophoneStopRecordingRequest,
  MicrophoneStopRecordingResult,
  MicrophoneStopRecordingTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStopRecording/bestPractice.js";
