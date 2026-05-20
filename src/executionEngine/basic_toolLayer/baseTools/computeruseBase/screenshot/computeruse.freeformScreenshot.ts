/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenshot / freeformScreenshot entry。
 * 核心目的：公开自由形状截图基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有屏幕访问、截图字节、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.captureScreenshot 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeFreeformScreenshot,
  executeFreeformScreenshotCore,
  freeformScreenshotBaseToolDefinition,
  freeformScreenshotBestPracticeDescriptor,
  freeformScreenshotDescriptor,
  freeformScreenshotHandler,
  freeformScreenshotProviderPractices,
  planFreeformScreenshot,
  selectFreeformScreenshotPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.freeformScreenshot/bestPractice.js";

export type {
  FreeformScreenshotAuditEvent,
  FreeformScreenshotBestPracticeRequest,
  FreeformScreenshotBoundary,
  FreeformScreenshotContext,
  FreeformScreenshotError,
  FreeformScreenshotErrorCode,
  FreeformScreenshotGate,
  FreeformScreenshotHandlerInput,
  FreeformScreenshotOutput,
  FreeformScreenshotPoint,
  FreeformScreenshotPracticeSelection,
  FreeformScreenshotProvider,
  FreeformScreenshotProviderRequest,
  FreeformScreenshotProviderResult,
  FreeformScreenshotRect,
  FreeformScreenshotRequest,
  FreeformScreenshotResult,
  FreeformScreenshotTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.freeformScreenshot/bestPractice.js";
