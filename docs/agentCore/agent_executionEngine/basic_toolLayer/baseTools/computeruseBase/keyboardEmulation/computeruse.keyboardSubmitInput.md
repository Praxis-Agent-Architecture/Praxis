# computeruse.keyboardSubmitInput

对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput.ts`

## 1. 文件位置

- 所属模块：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/keyboardEmulation`。
- 当前 entry：`computeruse.keyboardSubmitInput.ts`。
- storage 实现：`src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput/`。

## 2. 文件职责

公开键盘提交输入基础工具的 canonical storage 实现、handler、definition 和类型。

这个 entry 文件只提供稳定导出面；工具 contract、provider practice、runtime port 包装和结果归一化都在 storagePool 中完成。

## 2.1 文件名语义拆解

- `computeruse`：计算机使用基础工具家族。
- `keyboardSubmitInput`：请求 runtime 对当前受治理的键盘焦点目标执行提交动作。
- 这是基础工具原语，不是 TAP 的高级工具，也不决定是否先用 shell、MCP、browser-use、form API 或 omni。

## 3. 目录语义

- `baseTools/computeruseBase` 是模型可调用的公共 entry 层。
- `storagePool/baseToolStorage/computeruseBase` 是实现和 provider practice 层。
- runtime 负责真实键盘事件、焦点边界、OS automation backend、权限提示、取消和清理。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / keyboardEmulation / keyboardSubmitInput entry。
- 核心目的：公开键盘提交输入基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有真实键盘事件、焦点管理、TAP 策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.keyboardAction 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- 导出 `keyboardSubmitInputHandler` 供 registry 挂载。
- 导出 `keyboardSubmitInputBaseToolDefinition` 供工具发现和描述使用。
- 导出 `planKeyboardSubmitInput` / `executeKeyboardSubmitInput` 供兼容测试和局部调用。
- 导出 public-safe 类型，支撑 runtime inspection 和 TAP 高级工具组合。

## 6. 输入边界

- `purpose`：提交当前输入目标的目的。
- `target.submitKey` 或 `submitKey`：`Enter` 或 `NumpadEnter`。
- `target.repeat` 或 `repeat`：重复提交次数，范围 `1..5`。
- `target.targetHint` 或 `targetHint`：公开安全的目标提示，不负责解析真实焦点。
- `context.dryRun` / `context.guard` / scope 字段：执行边界和治理材料。
- `BaseToolInvokeRequest.runtimeId/sessionId/toolCallId`：handler 路径注入的运行态元数据。

## 7. 输出边界

- dry-run 返回 metadata-only keyboard submit envelope，并包含 submit key、repeat 和 runtime entry。
- 真实执行成功返回 runtime `actionIds`、provider metadata、runtime entry 和 audit metadata。
- 输出不包含 provider 私有错误，不包含焦点解析细节，不包含 TAP 策略判断。

## 8. 错误边界

- malformed JSON 返回 `INVALID_REQUEST` / `INVALID_CONTEXT` / `INVALID_TARGET`。
- 缺 runtimeId 或 purpose 返回 `MISSING_RUNTIME_ID` / `MISSING_PURPOSE`。
- 非法 submitKey、targetHint 或 repeat 返回对应 invalid/resource 错误。
- `dryRun:false` 缺 guard 返回 `GOVERNANCE_REJECTED`。
- 缺 runtime provider 返回 `PROVIDER_UNAVAILABLE`，provider 失败返回 public-safe `PROVIDER_FAILURE`。

## 9. 依赖对象

- `BaseToolExecutorPort.computeruse.keyboardAction`：唯一真实键盘提交入口。
- `runtime.governancePlane.toolInvocationGrant`：真实执行 guard 来源。
- `runtime.focusManager.keyboardTarget`：焦点、OS backend、事件派发和清理所有权。
- TAP 高级工具系统：负责编排、审批 UX 和 fallback 策略。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.keyboardSubmitInput")`。
- runtime execEngine 的 baseTool invocation bridge。
- TAP 高级工具系统和 agent 编排层。

## 11. 不应该做什么

- 不要在 entry 或 storage 中隐藏调用 shell、portal、本地键盘命令、form API 或浏览器自动化。
- 不要在 baseTool 中决定是否优先用 MCP、shell、browser-use、form API 或 omni。
- 不要在 baseTool 中解析真实焦点、发 OS 键盘事件或持有长生命周期输入会话。

## 12. 最小实现建议

- entry 必须保持显式导出，不使用 bare `export *`。
- storage `core.ts` 负责 JSON 校验、submitKey/repeat/targetHint normalization、dry-run、guard、provider missing/failure 和输出归一化。
- `bestPractice.ts` 负责把 `BaseToolInvokeRequest` 的 `toolCallId/runtimeId/sessionId/executor/input` 注入 storage core。
- `dependencies.ts` 只包装 runtime port，不创建隐藏本地依赖。
- storage operational 文档必须写明完整 handler 调用形状、runtime port、错误码、返回 envelope 和 avoid-list。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- missing guard/provider/failing provider 都返回 public-safe 错误。
- handler 和 registry 测试必须经过 `BaseToolInvokeRequest` 和 `lookupHandler`。
- Markdown 测试必须确认 storage 文档包含 `Use This Tool`、`Call Shape`、`Runtime Behavior`、`Returns`、`Example` 和 `Avoid`。

## 14. 与系统链路的关系

`computeruse.keyboardSubmitInput` 是底层能力承载面。TAP/agent 可以把它和文本输入、截图、mouse、MCP、shell、omni 或 browser runtime 组合，但这个 baseTool 自己不做策略编排。

完整 ToolSkill 调用手册放在 storage 文档：

`src/storagePool/baseToolStorage/computeruseBase/keyboardEmulation/computeruse.keyboardSubmitInput/computeruse.keyboardSubmitInput.md`

## 15. Storage 操作手册对齐点

- storage Markdown 使用与 `shell.commandExecution` / `code.read` 一致的章节：`Use This Tool`、`Call Shape`、`Required Inputs`、`Optional Inputs`、`Runtime Behavior`、`Returns`、`Example`、`Avoid`。
- `Call Shape` 必须展示完整 `BaseToolInvokeRequest`，而不是只展示裸 JSON input。
- `Runtime Behavior` 必须写清真实副作用只走 `BaseToolExecutorPort.computeruse.keyboardAction`，缺 runtime provider 返回 `PROVIDER_UNAVAILABLE`。
- `Avoid` 必须写清不隐藏 shell、portal、browser-use、MCP、clipboard、media/device 依赖，也不自动调用 `omniBase`。
