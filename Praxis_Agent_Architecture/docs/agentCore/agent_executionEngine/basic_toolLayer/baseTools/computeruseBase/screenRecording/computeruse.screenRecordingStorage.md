# computeruse.screenRecordingStorage

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts`
> Storage ToolSkill：`Praxis_Agent_Architecture/src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage/computeruse.screenRecordingStorage.md`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording`。
- 当前文件：`computeruse.screenRecordingStorage.ts`。
- 角色概括：薄 entry 层，只公开屏幕录制存储 baseTool 的类型、definition、handler、planner/executor 和 practice selector。

## 2. 文件职责

`computeruse.screenRecordingStorage` 把“结束/归档一个 runtime 屏幕录制 session，并产出 video artifact”做成稳定的底层能力原语。

它不负责开始录屏、不负责视频分析、不负责媒体转码、不负责调用 `omni.viewVideo`，也不负责 shell/MCP/browser fallback。它只定义调用契约、dry-run、guard、scope、provider missing/failure、runtime entry、artifact envelope 和审计输出。

## 2.1 文件名语义拆解

- `computeruse`：计算机使用底层能力族。
- `screenRecording`：目标资源来自 runtime-owned 屏幕录制 session。
- `Storage`：能力是 finalization/storage，返回 `artifactId` 和 `mimeType`，不是启动录制或消费视频内容。

## 3. 目录语义

- entry 层：`src/agentCore/.../baseTools/computeruseBase/screenRecording/computeruse.screenRecordingStorage.ts`。
- storage 层：`src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.screenRecordingStorage/`。
- storage 层包含 `core.ts`、`bestPractice.ts`、`dependencies.ts`、`anthropic.ts`、`openai.ts`、`deepmind.ts` 和 ToolSkill markdown。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenRecording / screenRecordingStorage entry。
- 核心目的：公开屏幕录制存储基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有录屏 session、视频字节、媒体编码、artifact 存储、TAP 高级工具策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.stopRecording 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- unknown JSON 输入校验。
- `recordingRef + storageTarget + retentionPolicy` target 规范化。
- dry-run 计划输出，且 dry-run 不调用 provider。
- `dryRun:false` 时必须存在 affirmative guard。
- 缺 runtime provider 时返回 `PROVIDER_UNAVAILABLE`。
- provider throw 或 malformed provider result 映射为 public-safe `PROVIDER_FAILURE`。
- 真执行只通过 `BaseToolExecutorPort.computeruse.stopRecording` 返回 video artifact；`storageTarget`、`retentionPolicy` 和返回的 `storageUri` 是 runtime contract 的一等字段，不塞进 metadata 当隐式语义。

## 6. 输入边界

主要输入：

- `purpose`：本次归档录屏的目的。
- `target.recordingRef`：start-recording 工具返回的 recording session handle。
- `target.storageTarget`：runtime storage destination，只允许 `artifact://`、`session://`、`runtime://` 或 `memory://`。
- `target.retentionPolicy`：可选，默认 `session-scoped`。
- `context.dryRun`、`context.guard`、`context.requestedScopes`、`context.allowedScopes`。

输入必须是普通 JSON 可验证对象；错误标量、null、数组和坏嵌套对象不能抛 raw `TypeError`。

## 7. 输出边界

成功输出包含：

- `kind: "agentCore.basicTool.computeruse.screenRecordingStorage"`。
- `dispatch: "dry-run" | "runtime-computeruse"`。
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.stopRecording"`。
- `storageEnvelope.resource: "screen-recording"`。
- dry-run 下 `metadataOnly: true`。
- 真执行下 `artifactId`、`mimeType` 和可选 `storageUri`。

## 8. 错误边界

稳定错误包括 `INVALID_REQUEST`、`INVALID_CONTEXT`、`INVALID_TARGET`、`MISSING_RUNTIME_ID`、`MISSING_PURPOSE`、`MISSING_RECORDING_REF`、`INVALID_RECORDING_REF`、`MISSING_STORAGE_TARGET`、`INVALID_STORAGE_TARGET`、`INVALID_RETENTION_POLICY`、`SCOPE_DENIED`、`CONTRACT_REJECTED`、`GOVERNANCE_REJECTED`、`PROVIDER_UNAVAILABLE` 和 `PROVIDER_FAILURE`。

这些错误都必须 public-safe，不泄漏 ffmpeg、PipeWire、portal、窗口系统、文件路径、stack trace 或 provider 私有细节。

## 9. 依赖对象

- `BaseToolExecutorPort.computeruse.stopRecording`，其中 `recordingId`、`storageTarget`、`retentionPolicy`、`purpose`、返回的 `storageUri` 都属于显式 runtime contract。
- runtime governance / TAP guard。
- runtime recording session 和 artifact storage。

`dependencies.ts` 只包装 runtime port，不直接 import 或 spawn ffmpeg、PipeWire、portal、shell、browser driver、MCP client 或 OS automation 包。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.screenRecordingStorage")`。
- `BaseToolHandler.invoke(...)`。
- runtime execEngine bridge。
- TAP/agent 上层编排。

## 11. 不应该做什么

- 不启动录屏。
- 不分析、转码、压缩或播放视频。
- 不把视频交给 `omni.viewVideo`。
- 不 fallback 到 shell、MCP、browser-use、Playwright、Puppeteer、ffmpeg、PipeWire 或 portal。
- 不把 browser-use 变成 computeruseBase 语义。
- 不在 entry 层复制 storage 实现。

## 12. 最小实现建议

以 storage `core.ts` 为唯一 contract 中心，entry 文件保持显式导出。新增相邻 screenRecording 工具时复用同族 handler/registry/runtime-chain 测试形状。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- 缺 runtimeId、缺 purpose、缺 recordingRef、缺 storageTarget、非法 storageTarget/retentionPolicy。
- denied guard 返回 `GOVERNANCE_REJECTED`。
- missing provider 返回 `PROVIDER_UNAVAILABLE`。
- provider throw 返回 public-safe `PROVIDER_FAILURE`。
- fake `executor.computeruse.stopRecording` 被调用。
- handler 通过 `BaseToolInvokeRequest` 调用。
- registry 通过 `createBaseToolRegistry().lookupHandler(...)` 调用。

## 14. 与系统链路的关系

标准链路：

```text
model tool_call JSON
  -> invocation adapter
  -> execEngine bridge
  -> createBaseToolRegistry().lookupHandler("computeruse.screenRecordingStorage")
  -> BaseToolHandler.invoke(request)
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.computeruse.stopRecording
  -> BaseToolInvokeResult
```

## 15. ToolSkill 文档边界

storage markdown 必须是可操作手册，包含 `Use This Tool`、`Call Shape`、`Required Inputs`、`Optional Inputs`、`Runtime Behavior`、`Returns`、`Example` 和 `Avoid`。
