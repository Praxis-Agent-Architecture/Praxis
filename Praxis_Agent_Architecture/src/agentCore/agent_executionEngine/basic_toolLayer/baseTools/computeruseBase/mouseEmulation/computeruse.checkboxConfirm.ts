/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / mouseEmulation / checkboxConfirm entry。
 * 核心目的：公开复选框确认基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有 OS pointer events、选择器解析、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.pointerAction 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  checkboxConfirmBaseToolDefinition,
  checkboxConfirmBestPracticeDescriptor,
  checkboxConfirmDescriptor,
  checkboxConfirmHandler,
  checkboxConfirmProviderPractices,
  executeCheckboxConfirm,
  executeCheckboxConfirmCore,
  planCheckboxConfirm,
  selectCheckboxConfirmPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.checkboxConfirm/bestPractice.js";

export type {
  CheckboxConfirmAuditEvent,
  CheckboxConfirmBestPracticeRequest,
  CheckboxConfirmBoundary,
  CheckboxConfirmClickMode,
  CheckboxConfirmContext,
  CheckboxConfirmCoordinateSpace,
  CheckboxConfirmError,
  CheckboxConfirmErrorCode,
  CheckboxConfirmGate,
  CheckboxConfirmHandlerInput,
  CheckboxConfirmOutput,
  CheckboxConfirmPoint,
  CheckboxConfirmPracticeSelection,
  CheckboxConfirmProvider,
  CheckboxConfirmProviderRequest,
  CheckboxConfirmProviderResult,
  CheckboxConfirmRequest,
  CheckboxConfirmResult,
  CheckboxConfirmState,
  CheckboxConfirmTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/mouseEmulation/computeruse.checkboxConfirm/bestPractice.js";
