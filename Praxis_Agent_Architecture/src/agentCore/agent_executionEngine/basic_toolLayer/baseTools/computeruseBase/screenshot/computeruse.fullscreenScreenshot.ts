/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenshot / fullscreenScreenshot entry。
 * 核心目的：公开全屏截图基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有屏幕访问、截图字节、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.captureScreenshot 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeFullscreenScreenshot,
  executeFullscreenScreenshotCore,
  fullscreenScreenshotBaseToolDefinition,
  fullscreenScreenshotBestPracticeDescriptor,
  fullscreenScreenshotDescriptor,
  fullscreenScreenshotHandler,
  fullscreenScreenshotProviderPractices,
  planFullscreenScreenshot,
  selectFullscreenScreenshotPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot/bestPractice.js";

export type {
  FullscreenScreenshotAuditEvent,
  FullscreenScreenshotBestPracticeRequest,
  FullscreenScreenshotBoundary,
  FullscreenScreenshotContext,
  FullscreenScreenshotError,
  FullscreenScreenshotErrorCode,
  FullscreenScreenshotGate,
  FullscreenScreenshotHandlerInput,
  FullscreenScreenshotOutput,
  FullscreenScreenshotPracticeSelection,
  FullscreenScreenshotProvider,
  FullscreenScreenshotProviderRequest,
  FullscreenScreenshotProviderResult,
  FullscreenScreenshotRequest,
  FullscreenScreenshotResult,
  FullscreenScreenshotTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.fullscreenScreenshot/bestPractice.js";
