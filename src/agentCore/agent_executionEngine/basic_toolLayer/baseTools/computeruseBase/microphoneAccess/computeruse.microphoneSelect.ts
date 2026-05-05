/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphoneSelect entry。
 * 核心目的：公开麦克风设备选择基础工具的 canonical storage 实现、handler、definition 和类型。
 * 边界：entry 层只做薄导出，不持有麦克风设备清单、OS 音频路由、TAP 策略或 runtime 副作用。
 * 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.selectDevice 接入 runtime。
 * 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。
 */

export {
  executeMicrophoneSelect,
  executeMicrophoneSelectCore,
  microphoneSelectBaseToolDefinition,
  microphoneSelectBestPracticeDescriptor,
  microphoneSelectDescriptor,
  microphoneSelectHandler,
  microphoneSelectProviderPractices,
  planMicrophoneSelect,
  selectMicrophoneSelectPractice,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect/bestPractice.js";

export type {
  MicrophoneAccessBoundary,
  MicrophoneAccessGate,
  MicrophoneSelectableDevice,
  MicrophoneSelectableDeviceKind,
  MicrophoneSelectAuditEvent,
  MicrophoneSelectBestPracticeRequest,
  MicrophoneSelectBoundary,
  MicrophoneSelectContext,
  MicrophoneSelectError,
  MicrophoneSelectErrorCode,
  MicrophoneSelectGate,
  MicrophoneSelectHandlerInput,
  MicrophoneSelectOutput,
  MicrophoneSelectPracticeSelection,
  MicrophoneSelectProvider,
  MicrophoneSelectProviderRequest,
  MicrophoneSelectProviderResult,
  MicrophoneSelectRequest,
  MicrophoneSelectResult,
  MicrophoneSelectTarget,
} from "../../../../../../storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect/bestPractice.js";
