/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / mouseEmulation / mouseClick entry。
 * 核心目的：公开鼠标点击基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有 OS 指针事件、窗口焦点、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.pointerAction 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMouseClick,
  executeMouseClickCore,
  mouseClickBaseToolDefinition,
  mouseClickBestPracticeDescriptor,
  mouseClickDescriptor,
  mouseClickHandler,
  mouseClickProviderPractices,
  planMouseClick,
  selectMouseClickPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseClick/bestPractice.js";

export type {
  MouseClickAuditEvent,
  MouseClickBestPracticeRequest,
  MouseClickBoundary,
  MouseClickButton,
  MouseClickContext,
  MouseClickCoordinateSpace,
  MouseClickError,
  MouseClickErrorCode,
  MouseClickGate,
  MouseClickHandlerInput,
  MouseClickOutput,
  MouseClickPoint,
  MouseClickPracticeSelection,
  MouseClickProvider,
  MouseClickProviderRequest,
  MouseClickProviderResult,
  MouseClickRequest,
  MouseClickResult,
  MouseClickTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseClick/bestPractice.js";
