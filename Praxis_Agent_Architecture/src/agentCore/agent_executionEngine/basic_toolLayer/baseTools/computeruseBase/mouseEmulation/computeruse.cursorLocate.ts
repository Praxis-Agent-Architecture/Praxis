/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / mouseEmulation / cursorLocate entry。
 * 核心目的：公开光标定位基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有 OS cursor reads、窗口焦点、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.locateCursor 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  cursorLocateBaseToolDefinition,
  cursorLocateBestPracticeDescriptor,
  cursorLocateDescriptor,
  cursorLocateHandler,
  cursorLocateProviderPractices,
  executeCursorLocate,
  executeCursorLocateCore,
  planCursorLocate,
  selectCursorLocatePractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.cursorLocate/bestPractice.js";

export type {
  CursorLocateAuditEvent,
  CursorLocateBestPracticeRequest,
  CursorLocateBoundary,
  CursorLocateContext,
  CursorLocateCoordinateSpace,
  CursorLocateError,
  CursorLocateErrorCode,
  CursorLocateGate,
  CursorLocateHandlerInput,
  CursorLocateOutput,
  CursorLocatePracticeSelection,
  CursorLocateProvider,
  CursorLocateProviderRequest,
  CursorLocateProviderResult,
  CursorLocateRequest,
  CursorLocateResult,
  CursorLocateTarget,
  CursorPosition,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.cursorLocate/bestPractice.js";
