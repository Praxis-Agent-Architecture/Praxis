/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphoneStartRecording entry。
 * 核心目的：公开麦克风录制启动基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有麦克风设备流、录音 session、媒体编码器、artifact 存储、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMicrophoneStartRecording,
  executeMicrophoneStartRecordingCore,
  microphoneStartRecordingBaseToolDefinition,
  microphoneStartRecordingBestPracticeDescriptor,
  microphoneStartRecordingDescriptor,
  microphoneStartRecordingHandler,
  microphoneStartRecordingProviderPractices,
  planMicrophoneStartRecording,
  selectMicrophoneStartRecordingPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording/bestPractice.js";

export type {
  MicrophoneStartRecordingAuditEvent,
  MicrophoneStartRecordingBestPracticeRequest,
  MicrophoneStartRecordingBoundary,
  MicrophoneStartRecordingContext,
  MicrophoneStartRecordingError,
  MicrophoneStartRecordingErrorCode,
  MicrophoneStartRecordingGate,
  MicrophoneStartRecordingHandlerInput,
  MicrophoneStartRecordingOutput,
  MicrophoneStartRecordingOutputFormat,
  MicrophoneStartRecordingPracticeSelection,
  MicrophoneStartRecordingProvider,
  MicrophoneStartRecordingProviderRequest,
  MicrophoneStartRecordingProviderResult,
  MicrophoneStartRecordingRequest,
  MicrophoneStartRecordingResult,
  MicrophoneStartRecordingTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording/bestPractice.js";
