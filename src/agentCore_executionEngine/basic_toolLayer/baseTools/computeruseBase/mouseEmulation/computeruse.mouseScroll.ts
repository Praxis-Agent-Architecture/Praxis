/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / mouseEmulation / mouseScroll entry。
 * 核心目的：公开鼠标滚动基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有 OS wheel events、窗口焦点、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.pointerAction 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMouseScroll,
  executeMouseScrollCore,
  mouseScrollBaseToolDefinition,
  mouseScrollBestPracticeDescriptor,
  mouseScrollDescriptor,
  mouseScrollHandler,
  mouseScrollProviderPractices,
  planMouseScroll,
  selectMouseScrollPractice,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseScroll/bestPractice.js";

export type {
  MouseScrollAuditEvent,
  MouseScrollBestPracticeRequest,
  MouseScrollBoundary,
  MouseScrollContext,
  MouseScrollCoordinateSpace,
  MouseScrollError,
  MouseScrollErrorCode,
  MouseScrollGate,
  MouseScrollHandlerInput,
  MouseScrollOutput,
  MouseScrollPoint,
  MouseScrollPracticeSelection,
  MouseScrollProvider,
  MouseScrollProviderRequest,
  MouseScrollProviderResult,
  MouseScrollRequest,
  MouseScrollResult,
  MouseScrollTarget,
} from "../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseScroll/bestPractice.js";
