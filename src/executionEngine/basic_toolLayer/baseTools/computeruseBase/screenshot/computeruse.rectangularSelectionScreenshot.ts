/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenshot / rectangularSelectionScreenshot entry。
 * 核心目的：公开矩形区域截图基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有屏幕访问、截图字节、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.captureScreenshot 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeRectangularSelectionScreenshot,
  executeRectangularSelectionScreenshotCore,
  planRectangularSelectionScreenshot,
  rectangularSelectionScreenshotBaseToolDefinition,
  rectangularSelectionScreenshotBestPracticeDescriptor,
  rectangularSelectionScreenshotDescriptor,
  rectangularSelectionScreenshotHandler,
  rectangularSelectionScreenshotProviderPractices,
  selectRectangularSelectionScreenshotPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot/bestPractice.js";

export type {
  RectangularSelectionScreenshotAuditEvent,
  RectangularSelectionScreenshotBestPracticeRequest,
  RectangularSelectionScreenshotBoundary,
  RectangularSelectionScreenshotContext,
  RectangularSelectionScreenshotError,
  RectangularSelectionScreenshotErrorCode,
  RectangularSelectionScreenshotGate,
  RectangularSelectionScreenshotHandlerInput,
  RectangularSelectionScreenshotOutput,
  RectangularSelectionScreenshotPracticeSelection,
  RectangularSelectionScreenshotProvider,
  RectangularSelectionScreenshotProviderRequest,
  RectangularSelectionScreenshotProviderResult,
  RectangularSelectionScreenshotRect,
  RectangularSelectionScreenshotRequest,
  RectangularSelectionScreenshotResult,
  RectangularSelectionScreenshotTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.rectangularSelectionScreenshot/bestPractice.js";
