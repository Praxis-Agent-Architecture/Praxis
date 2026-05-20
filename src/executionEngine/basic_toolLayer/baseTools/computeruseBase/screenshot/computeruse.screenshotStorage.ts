/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenshot / screenshotStorage entry。
 * 核心目的：公开截图 artifact 存储基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有截图字节、本地文件写入、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.artifact.store 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeScreenshotStorage,
  executeScreenshotStorageCore,
  planScreenshotStorage,
  screenshotStorageBaseToolDefinition,
  screenshotStorageBestPracticeDescriptor,
  screenshotStorageDescriptor,
  screenshotStorageHandler,
  screenshotStorageProviderPractices,
  selectScreenshotStoragePractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.screenshotStorage/bestPractice.js";

export type {
  ScreenshotStorageAuditEvent,
  ScreenshotStorageBestPracticeRequest,
  ScreenshotStorageBoundary,
  ScreenshotStorageContext,
  ScreenshotStorageError,
  ScreenshotStorageErrorCode,
  ScreenshotStorageGate,
  ScreenshotStorageHandlerInput,
  ScreenshotStorageOutput,
  ScreenshotStoragePracticeSelection,
  ScreenshotStorageProvider,
  ScreenshotStorageProviderRequest,
  ScreenshotStorageProviderResult,
  ScreenshotStorageRequest,
  ScreenshotStorageResult,
  ScreenshotStorageRetentionPolicy,
  ScreenshotStorageTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/screenshot/computeruse.screenshotStorage/bestPractice.js";
