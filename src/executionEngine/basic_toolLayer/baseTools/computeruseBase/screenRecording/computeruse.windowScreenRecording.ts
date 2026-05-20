/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenRecording / windowScreenRecording entry。
 * 核心目的：公开窗口录制基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有窗口选择、屏幕访问、录屏流、媒体编码、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeWindowScreenRecording,
  executeWindowScreenRecordingCore,
  planWindowScreenRecording,
  selectWindowScreenRecordingPractice,
  windowScreenRecordingBaseToolDefinition,
  windowScreenRecordingBestPracticeDescriptor,
  windowScreenRecordingDescriptor,
  windowScreenRecordingHandler,
  windowScreenRecordingProviderPractices,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.windowScreenRecording/bestPractice.js";

export type {
  WindowScreenRecordingAuditEvent,
  WindowScreenRecordingBestPracticeRequest,
  WindowScreenRecordingBoundary,
  WindowScreenRecordingContext,
  WindowScreenRecordingError,
  WindowScreenRecordingErrorCode,
  WindowScreenRecordingGate,
  WindowScreenRecordingHandlerInput,
  WindowScreenRecordingOutput,
  WindowScreenRecordingOutputFormat,
  WindowScreenRecordingPracticeSelection,
  WindowScreenRecordingProvider,
  WindowScreenRecordingProviderRequest,
  WindowScreenRecordingProviderResult,
  WindowScreenRecordingRequest,
  WindowScreenRecordingResult,
  WindowScreenRecordingTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.windowScreenRecording/bestPractice.js";
