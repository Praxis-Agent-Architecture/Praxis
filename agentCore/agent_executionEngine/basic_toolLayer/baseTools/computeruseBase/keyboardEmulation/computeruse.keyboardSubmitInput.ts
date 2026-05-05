/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / keyboardEmulation / keyboardSubmitInput entry。
 * 核心目的：公开键盘提交输入基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有真实键盘事件、焦点管理、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.keyboardAction 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeKeyboardSubmitInput,
  executeKeyboardSubmitInputCore,
  keyboardSubmitInputBaseToolDefinition,
  keyboardSubmitInputBestPracticeDescriptor,
  keyboardSubmitInputDescriptor,
  keyboardSubmitInputHandler,
  keyboardSubmitInputProviderPractices,
  planKeyboardSubmitInput,
  selectKeyboardSubmitInputPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput/bestPractice.js";

export type {
  KeyboardSubmitInputAuditEvent,
  KeyboardSubmitInputBestPracticeRequest,
  KeyboardSubmitInputBoundary,
  KeyboardSubmitInputContext,
  KeyboardSubmitInputError,
  KeyboardSubmitInputErrorCode,
  KeyboardSubmitInputGate,
  KeyboardSubmitInputHandlerInput,
  KeyboardSubmitInputOutput,
  KeyboardSubmitInputPracticeSelection,
  KeyboardSubmitInputProvider,
  KeyboardSubmitInputProviderRequest,
  KeyboardSubmitInputProviderResult,
  KeyboardSubmitInputRequest,
  KeyboardSubmitInputResult,
  KeyboardSubmitInputTarget,
  KeyboardSubmitKey,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput/bestPractice.js";
