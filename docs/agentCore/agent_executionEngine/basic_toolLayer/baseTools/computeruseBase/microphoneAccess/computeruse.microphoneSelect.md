# computeruse.microphoneSelect

对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneSelect.ts`

## 1. 文件位置

- 所属模块：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess`。
- 当前 entry：`computeruse.microphoneSelect.ts`。
- storage 实现：`src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneSelect/`。
- 运行时入口：`BaseToolExecutorPort.computeruse.selectDevice`。

## 2. 文件职责

`computeruse.microphoneSelect` 把“选择麦克风设备”做成可调用、可审计、可治理的 baseTool 原语。

它只定义工具契约、JSON 边界、dry-run、guard、scope、provider missing/failure、runtime entry 和结果信封。真实麦克风设备选择由 runtime port 承担。

## 2.1 文件名语义拆解

- `computeruse`：桌面/设备层原子能力。
- `microphone`：麦克风资源。
- `Select`：让 runtime 选择目标麦克风设备。

## 3. 目录语义

`microphoneAccess` 承载麦克风权限、设备选择和录音 session 相关原子能力。它不是 TAP 高级工具，也不决定何时该用麦克风、何时该走 shell/MCP/browser/omni。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphoneSelect entry。
- 核心目的：公开麦克风设备选择基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有麦克风设备清单、OS 音频路由、TAP 策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.selectDevice 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- 选择指定麦克风设备的 dry-run 计划。
- `dryRun:false` 时，在 affirmative guard 后调用 runtime-owned `selectDevice`。
- 返回设备选择 envelope、runtime entry、audit metadata。
- 缺 provider 返回 `PROVIDER_UNAVAILABLE`。
- provider 异常返回 public-safe `PROVIDER_FAILURE`。

## 6. 输入边界

- `target.deviceId`：目标麦克风设备 id。
- `target.targetApplication`：应用或 session 标签。
- `target.permissionLeaseId`：可选 runtime permission lease。
- `target.availableDevices`：可选 runtime 注入的设备列表；如果存在，目标设备必须在列表内。
- `context.runtimeId`、`context.guard`、`context.requestedScopes`、`context.allowedScopes`。

## 7. 输出边界

- `kind: agentCore.basicTool.computeruse.microphoneSelect`。
- `dispatch: dry-run | runtime-computeruse`。
- `runtimeEntry.port: BaseToolExecutorPort.computeruse.selectDevice`。
- `selectionEnvelope`：包含 resource、requested、selected、deviceId、permissionLeaseId。
- `providerMetadata`：只接收 runtime 返回的 public-safe metadata。

## 8. 错误边界

- malformed JSON：`INVALID_REQUEST`、`INVALID_CONTEXT`、`INVALID_TARGET`。
- 缺字段：`MISSING_RUNTIME_ID`、`MISSING_MICROPHONE_DEVICE`、`MISSING_TARGET_APPLICATION`。
- 非法字段：`INVALID_MICROPHONE_DEVICE`、`INVALID_PERMISSION_LEASE`、`INVALID_SELECTION_REASON`。
- 设备不在可用列表：`MICROPHONE_DEVICE_NOT_AVAILABLE`。
- 治理和依赖：`GOVERNANCE_REJECTED`、`SCOPE_DENIED`、`PROVIDER_UNAVAILABLE`、`PROVIDER_FAILURE`。

## 9. 依赖对象

- `runtime.execEngine.computeruse.selectDevice`。
- `runtime.governancePlane.toolInvocationGrant`。
- `runtime.devicePolicy.microphone`。

这些依赖只能通过 `dependencies.ts` 和 `BaseToolExecutorPort` 注入。baseTool 不导入麦克风库、不打开设备流、不启动 OS 权限提示、不 shell out。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.microphoneSelect")`。
- runtime tool invocation bridge。
- TAP/agent 编排层。

## 11. 不应该做什么

- 不请求或释放麦克风权限。
- 不开始或停止录音。
- 不把音频交给 `omniBase` 分析。
- 不 fallback 到 shell、MCP、browser-use、本地设备 API。
- 不决定“什么时候应该选择麦克风”，这个策略属于 TAP/agent。

## 12. 最小实现建议

保持 storage 七件套：

- `core.ts`：JSON 校验、dry-run、guard、scope、provider mapping、输出 envelope。
- `dependencies.ts`：只包装 `executor.computeruse.selectDevice`。
- `bestPractice.ts`：handler、definition、practice selection、runtime metadata 注入。
- `anthropic.ts`、`openai.ts`、`deepmind.ts`：记录 provider practice 证据。
- `computeruse.microphoneSelect.md`：操作手册。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- 缺 runtimeId、deviceId、targetApplication。
- 非法 deviceId、permissionLeaseId、selectionReason、availableDevices。
- missing/denied guard 返回 `GOVERNANCE_REJECTED`。
- missing provider 返回 `PROVIDER_UNAVAILABLE`。
- provider throw 映射 public-safe `PROVIDER_FAILURE`。
- handler 通过 `BaseToolInvokeRequest.invoke(...)` 调用。
- registry 通过 `createBaseToolRegistry().lookupHandler("computeruse.microphoneSelect")` 调用。

## 14. 与系统链路的关系

工具链路应为：

```text
model tool_call JSON
  -> invocation adapter
  -> execEngine bridge
  -> createBaseToolRegistry().lookupHandler("computeruse.microphoneSelect")
  -> BaseToolHandler.invoke
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.computeruse.selectDevice
  -> normalized BaseToolInvokeResult
```

TAP/agent 可以在上层把它和 `computeruse.microphonePermissionRequest`、录音工具、`omniBase` 或其他 baseTool 组合；本工具自身只承载麦克风选择原子能力。
