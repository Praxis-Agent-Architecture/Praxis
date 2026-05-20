# computeruse.microphoneStartRecording

对应源码：`src/agentCore_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording.ts`

## 1. 文件位置

- 所属模块：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess`。
- 当前 entry：`computeruse.microphoneStartRecording.ts`。
- storage 实现：`src/storagePool/baseToolStorage/computeruseBase/microphoneAccess/computeruse.microphoneStartRecording/`。
- 运行时入口：`BaseToolExecutorPort.computeruse.startRecording`。

## 2. 文件职责

`computeruse.microphoneStartRecording` 把“开始麦克风录制”做成可调用、可审计、可治理的 baseTool 原语。

它只定义工具契约、JSON 边界、dry-run、guard、scope、provider missing/failure、runtime entry 和结果信封。真实麦克风设备流、录音 session、编码器和 artifact 生命周期由 runtime port 承担。

## 2.1 文件名语义拆解

- `computeruse`：桌面/设备层原子能力。
- `microphone`：麦克风资源。
- `StartRecording`：让 runtime 开始一个麦克风录音 session。

## 3. 目录语义

`microphoneAccess` 承载麦克风权限、设备选择和录音 session 相关原子能力。它不是 TAP 高级工具，也不决定何时该录音、录完后是否交给 `omniBase` 分析、或是否改用 shell/MCP/browser。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / microphoneAccess / microphoneStartRecording entry。
- 核心目的：公开麦克风录制启动基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有麦克风设备流、录音 session、媒体编码器、artifact 存储、TAP 策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- 生成开始麦克风录音的 dry-run 计划。
- `dryRun:false` 时，在 affirmative guard 后调用 runtime-owned `startRecording`。
- 返回 recording session handle、runtime entry、audit metadata。
- 缺 provider 返回 `PROVIDER_UNAVAILABLE`。
- provider 异常返回 public-safe `PROVIDER_FAILURE`。

## 6. 输入边界

- `purpose`：开始录音的公开原因。
- `target.deviceId`：可选麦克风 id，默认 `default-microphone`。
- `target.permissionLeaseId`：可选 runtime permission lease。
- `target.maxDurationMs`、`target.sampleRateHz`、`target.channelCount`、`target.outputFormat`。
- `target.destinationHint`：可选 runtime/artifact 目标提示。
- `context.runtimeId`、`context.guard`、`context.allowedDeviceIds`、`context.requestedScopes`、`context.allowedScopes`。

## 7. 输出边界

- `kind: agentCore.basicTool.computeruse.microphoneStartRecording`。
- `dispatch: dry-run | runtime-computeruse`。
- `runtimeEntry.port: BaseToolExecutorPort.computeruse.startRecording`。
- `recordingEnvelope`：包含 resource、started、metadataOnly、recordingId。
- `permissionsRequired`：包含麦克风读取/录制和 recording session；当 `destinationHint` 存在时追加 `artifact:write`，不使用 filesystem 写入权限。
- `providerMetadata`：只接收 runtime 返回的 public-safe metadata。

## 8. 错误边界

- malformed JSON：`INVALID_REQUEST`、`INVALID_CONTEXT`、`INVALID_TARGET`。
- 缺字段：`MISSING_RUNTIME_ID`、`MISSING_PURPOSE`。
- 非法字段：`INVALID_DEVICE_ID`、`INVALID_PERMISSION_LEASE`、`INVALID_RECORDING_LABEL`、`INVALID_DESTINATION_HINT`、`INVALID_MAX_DURATION`、`INVALID_AUDIO_FORMAT`、`INVALID_OUTPUT_FORMAT`。
- 作用域和治理：`DEVICE_SCOPE_REJECTED`、`GOVERNANCE_REJECTED`、`SCOPE_DENIED`。
- 依赖：`PROVIDER_UNAVAILABLE`、`PROVIDER_FAILURE`。

## 9. 依赖对象

- `runtime.execEngine.computeruse.startRecording`。
- `runtime.governancePlane.toolInvocationGrant`。
- `runtime.recordingSession.microphone`。

这些依赖只能通过 `dependencies.ts` 和 `BaseToolExecutorPort` 注入。baseTool 不导入音频库、不打开麦克风流、不启动 ffmpeg/PipeWire/portal、不写 artifact。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.microphoneStartRecording")`。
- runtime tool invocation bridge。
- TAP/agent 编排层。

## 11. 不应该做什么

- 不请求或释放麦克风权限。
- 不选择麦克风设备。
- 不停止录音或写入最终录音 artifact。
- 不调用 `omniBase` 分析音频。
- 不 fallback 到 shell、MCP、browser-use、本地音频 API、ffmpeg、PipeWire 或 portal。

## 12. 最小实现建议

保持 storage 七件套：

- `core.ts`：JSON 校验、dry-run、guard、scope、provider mapping、输出 envelope。
- `dependencies.ts`：只包装 `executor.computeruse.startRecording`。
- `bestPractice.ts`：handler、definition、practice selection、runtime metadata 注入。
- `anthropic.ts`、`openai.ts`、`deepmind.ts`：记录 provider practice 证据。
- `computeruse.microphoneStartRecording.md`：操作手册。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- 缺 runtimeId、缺 purpose。
- 非法 deviceId、permissionLeaseId、destinationHint、duration、audio format、outputFormat。
- missing/denied guard 返回 `GOVERNANCE_REJECTED`。
- missing provider 返回 `PROVIDER_UNAVAILABLE`。
- provider throw 映射 public-safe `PROVIDER_FAILURE`。
- handler 通过 `BaseToolInvokeRequest.invoke(...)` 调用。
- registry 通过 `createBaseToolRegistry().lookupHandler("computeruse.microphoneStartRecording")` 调用。

## 14. 与系统链路的关系

工具链路应为：

```text
model tool_call JSON
  -> invocation adapter
  -> execEngine bridge
  -> createBaseToolRegistry().lookupHandler("computeruse.microphoneStartRecording")
  -> BaseToolHandler.invoke
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.computeruse.startRecording
  -> normalized BaseToolInvokeResult
```

TAP/agent 可以在上层把它和 `computeruse.microphonePermissionRequest`、`computeruse.microphoneSelect`、`computeruse.microphoneStopRecording`、`omniBase` 或其他 baseTool 组合；本工具自身只承载开始麦克风录音的原子能力。
