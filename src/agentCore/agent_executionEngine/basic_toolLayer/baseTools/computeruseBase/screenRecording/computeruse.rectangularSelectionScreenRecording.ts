/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenRecording / rectangularSelectionScreenRecording entry。
 * 核心目的：公开区域录屏基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有区域选择、屏幕访问、录屏流、媒体编码、TAP 高级工具策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeRectangularSelectionScreenRecording,
  executeRectangularSelectionScreenRecordingCore,
  planRectangularSelectionScreenRecording,
  rectangularSelectionScreenRecordingBaseToolDefinition,
  rectangularSelectionScreenRecordingBestPracticeDescriptor,
  rectangularSelectionScreenRecordingDescriptor,
  rectangularSelectionScreenRecordingHandler,
  rectangularSelectionScreenRecordingProviderPractices,
  selectRectangularSelectionScreenRecordingPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording/bestPractice.js";

export type {
  RectangularSelectionScreenRecordingAuditEvent,
  RectangularSelectionScreenRecordingBestPracticeRequest,
  RectangularSelectionScreenRecordingBoundary,
  RectangularSelectionScreenRecordingContext,
  RectangularSelectionScreenRecordingCoordinateSpace,
  RectangularSelectionScreenRecordingError,
  RectangularSelectionScreenRecordingErrorCode,
  RectangularSelectionScreenRecordingGate,
  RectangularSelectionScreenRecordingHandlerInput,
  RectangularSelectionScreenRecordingOutput,
  RectangularSelectionScreenRecordingOutputFormat,
  RectangularSelectionScreenRecordingPracticeSelection,
  RectangularSelectionScreenRecordingProvider,
  RectangularSelectionScreenRecordingProviderRequest,
  RectangularSelectionScreenRecordingProviderResult,
  RectangularSelectionScreenRecordingRect,
  RectangularSelectionScreenRecordingRequest,
  RectangularSelectionScreenRecordingResult,
  RectangularSelectionScreenRecordingTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording/bestPractice.js";
