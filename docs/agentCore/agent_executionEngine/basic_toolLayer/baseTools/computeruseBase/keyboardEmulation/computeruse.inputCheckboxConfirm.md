# computeruse.inputCheckboxConfirm

对应源码：`src/executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm.ts`

## 1. 文件位置

- 所属模块：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation`。
- 当前 entry：`computeruse.inputCheckboxConfirm.ts`。
- storage 实现：`src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.inputCheckboxConfirm/`。

## 2. 文件职责

公开输入选择框确认基础工具的 canonical storage 实现、handler、definition 和类型。

这个 entry 文件只提供稳定导出面；工具 contract、provider practice、runtime port 包装和结果归一化都在 storagePool 中完成。

## 2.1 文件名语义拆解

- `computeruse`：计算机使用基础工具家族。
- `inputCheckboxConfirm`：请求 runtime 对当前受治理的 checkbox-like 输入目标执行键盘确认动作。
- 这是基础工具原语，不是 TAP 的高级工具，也不决定是否先用 shell、MCP、browser-use、form API、pointer action 或 omni。

## 3. 目录语义

- `baseTools/computeruseBase` 是模型可调用的公共 entry 层。
- `storagePool/baseToolStorage/computeruseBase` 是实现和 provider practice 层。
- runtime 负责真实键盘事件、焦点边界、OS automation backend、权限提示、取消和清理。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / keyboardEmulation / inputCheckboxConfirm entry。
- 核心目的：公开输入选择框确认基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有真实键盘事件、焦点管理、TAP 策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.keyboardAction 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- 导出 `inputCheckboxConfirmHandler` 供 registry 挂载。
- 导出 `inputCheckboxConfirmBaseToolDefinition` 供工具发现和描述使用。
- 导出 `planInputCheckboxConfirm` / `executeInputCheckboxConfirm` 供兼容测试和局部调用。
- 导出 public-safe 类型，支撑 runtime inspection 和 TAP 高级工具组合。

## 6. 输入边界

- `purpose`：确认 checkbox 目标状态的目的。
- `target.label` 或 `target.selectorHint`：公开安全的目标提示，不负责解析真实焦点。
- `target.expectedState`：期望状态，默认 `checked`。
- `target.currentState`：当前状态；若已等于期望状态，真实执行不会按键。
- `target.confirmationKey`：`space` 或 `enter`。
- `context.dryRun` / `context.guard` / scope 字段：执行边界和治理材料。
- `BaseToolInvokeRequest.runtimeId/sessionId/toolCallId`：handler 路径注入的运行态元数据。

## 7. 输出边界

- dry-run 返回 metadata-only checkbox confirm envelope，并包含 expected/current state、confirmation key、key sequence 和 `wouldToggle`。
- 真实执行成功返回 runtime `actionId`、provider metadata、runtime entry 和 audit metadata。
- 如果 `currentState` 已等于 `expectedState`，输出 already-confirmed envelope，不发出键盘事件。

## 8. 错误边界

- malformed JSON 返回 `INVALID_REQUEST` / `INVALID_CONTEXT`。
- 缺 runtimeId、purpose 或 target 返回 `MISSING_RUNTIME_ID` / `MISSING_PURPOSE` / `MISSING_TARGET`。
- 非法 target、state、confirmationKey 返回对应 invalid 错误。
- `dryRun:false` 缺 guard 返回 `GOVERNANCE_REJECTED`。
- 缺 runtime provider 返回 `PROVIDER_UNAVAILABLE`，provider 失败返回 public-safe `PROVIDER_FAILURE`。

## 9. 依赖对象

- `BaseToolExecutorPort.computeruse.keyboardAction`：唯一真实 checkbox 确认键盘入口。
- `runtime.governancePlane.toolInvocationGrant`：真实执行 guard 来源。
- `runtime.focusManager.keyboardTarget`：焦点、OS backend、事件派发和清理所有权。
- TAP 高级工具系统：负责编排、审批 UX 和 fallback 策略。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.inputCheckboxConfirm")`。
- runtime execEngine 的 baseTool invocation bridge。
- TAP 高级工具系统和 agent 编排层。

## 11. 不应该做什么

- 不直接导入 OS automation、browser driver、MCP client、shell 或 provider SDK。
- 不自动调用 shellBase、mcpBase、browser-use、pointer action 或 omniBase。
- 不决定 fallback 策略，不持有焦点解析策略，不管理长生命周期 session。
- 不在已知当前状态满足期望状态时继续按键。
- 不泄漏 provider stack、私有路径、真实窗口焦点细节或原始系统错误。

## 12. 最小实现建议

- entry 文件保持显式导出。
- storage `core.ts` 负责 unknown JSON 校验、dry-run、guard、scope、provider missing/failure 和稳定输出。
- storage `dependencies.ts` 只包装 `BaseToolExecutorPort.computeruse.keyboardAction`。
- storage `bestPractice.ts` 注入 runtime/session/toolCall metadata，并返回 `BaseToolInvokeResult`。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- 缺 runtimeId、purpose、target 和非法 target/state/confirmationKey 要分类。
- denied/missing guard 不调用 provider，返回 `GOVERNANCE_REJECTED`。
- missing provider 返回 `PROVIDER_UNAVAILABLE`。
- provider throw 映射为 public-safe `PROVIDER_FAILURE`。
- fake executor 被调用并返回 actionId。
- handler 和 registry 都要通过 `BaseToolInvokeRequest` 路径验证。

## 14. 与系统链路的关系

`computeruse.inputCheckboxConfirm` 是底层键盘能力承载面。TAP/agent 决定何时组合它与 screenshot、omni、shell、MCP、pointer action 或 browser runtime adapter；baseTool 只负责把 checkbox 确认动作变成可治理、可审计、可挂载的 Praxis primitive。
