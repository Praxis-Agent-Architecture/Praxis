/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / mouseEmulation / mouseEmulation entry。
 * 核心目的：公开鼠标操作序列基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有 OS 指针事件、光标读取、窗口焦点、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke、BaseToolExecutorPort.computeruse.locateCursor 和 pointerAction 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMouseEmulation,
  executeMouseEmulationCore,
  mouseEmulationBaseToolDefinition,
  mouseEmulationBestPracticeDescriptor,
  mouseEmulationDescriptor,
  mouseEmulationHandler,
  mouseEmulationProviderPractices,
  planMouseEmulation,
  selectMouseEmulationPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseEmulation/bestPractice.js";

export type {
  MouseEmulationAuditEvent,
  MouseEmulationBestPracticeRequest,
  MouseEmulationBoundary,
  MouseEmulationButton,
  MouseEmulationClickStep,
  MouseEmulationContext,
  MouseEmulationCoordinateSpace,
  MouseEmulationError,
  MouseEmulationErrorCode,
  MouseEmulationGate,
  MouseEmulationHandlerInput,
  MouseEmulationLocateStep,
  MouseEmulationMoveStep,
  MouseEmulationOutput,
  MouseEmulationPoint,
  MouseEmulationPracticeSelection,
  MouseEmulationProvider,
  MouseEmulationProviderRequest,
  MouseEmulationProviderResult,
  MouseEmulationProviderStepResult,
  MouseEmulationRequest,
  MouseEmulationResult,
  MouseEmulationStep,
  MouseEmulationStepEnvelope,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.mouseEmulation/bestPractice.js";
