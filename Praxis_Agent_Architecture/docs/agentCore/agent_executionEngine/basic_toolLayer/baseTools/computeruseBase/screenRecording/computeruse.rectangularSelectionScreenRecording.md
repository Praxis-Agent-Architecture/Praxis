# computeruse.rectangularSelectionScreenRecording

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts`
> Storage ToolSkill：`Praxis_Agent_Architecture/src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording/computeruse.rectangularSelectionScreenRecording.md`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/screenRecording`。
- 当前文件：`computeruse.rectangularSelectionScreenRecording.ts`。
- 角色概括：薄 entry 层，只公开区域录屏 baseTool 的类型、definition、handler、planner/executor 和 practice selector。

## 2. 文件职责

`computeruse.rectangularSelectionScreenRecording` 把“开始录制一个矩形屏幕区域”做成稳定的底层能力原语。

它不负责选择区域、不负责浏览器控制、不负责媒体编码细节、不负责调用 `omni.viewVideo`，也不负责 shell/MCP fallback。它只定义调用契约、dry-run、guard、scope、provider missing/failure、runtime entry、recording session handle 和审计输出。

## 2.1 文件名语义拆解

- `computeruse`：计算机使用底层能力族。
- `rectangularSelection`：目标是一个已由 runtime/TAP 提供或批准的矩形区域。
- `ScreenRecording`：能力是启动录屏 session，返回 `recordingId`，不是停止录屏或读取最终视频。

## 3. 目录语义

- entry 层：`src/agentCore/.../baseTools/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording.ts`。
- storage 层：`src/storagePool/baseToolStorage/computeruseBase/screenRecording/computeruse.rectangularSelectionScreenRecording/`。
- storage 层包含 `core.ts`、`bestPractice.ts`、`dependencies.ts`、`anthropic.ts`、`openai.ts`、`deepmind.ts` 和 ToolSkill markdown。

## 4. 源码头部能力注释

entry 文件说明它只公开 canonical storage 实现，不持有区域选择、屏幕访问、录屏流、媒体编码、TAP 策略或 runtime 副作用。

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / screenRecording / rectangularSelectionScreenRecording entry。
- 核心目的：公开区域录屏基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有区域选择、屏幕访问、录屏流、媒体编码、TAP 高级工具策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.startRecording 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- unknown JSON 输入校验。
- `displayId + rect/region + coordinateSpace` target 规范化。
- dry-run 计划输出，且 dry-run 不调用 provider。
- `dryRun:false` 时必须存在 affirmative guard。
- 缺 runtime provider 时返回 `PROVIDER_UNAVAILABLE`。
- provider throw 或 malformed provider result 映射为 public-safe `PROVIDER_FAILURE`。
- 真执行只通过 `BaseToolExecutorPort.computeruse.startRecording` 返回 `recordingId`。

## 6. 输入边界

主要输入：

- `purpose`：本次区域录屏目的。
- `target.rect` / `target.region` / top-level `rect` / top-level `region`：矩形区域。
- `target.displayId`：可选显示器 id，默认 `primary-display`。
- `target.maxDurationMs`、`target.frameRate`、`target.includeCursor`、`target.includeAudio`、`target.outputFormat`、`target.destinationHint`。
- `context.dryRun`、`context.guard`、`context.requestedScopes`、`context.allowedScopes`。

输入必须是普通 JSON 可验证对象；错误标量、null、数组和坏嵌套对象不能抛 raw `TypeError`。

## 7. 输出边界

成功输出包含：

- `kind: "agentCore.basicTool.computeruse.rectangularSelectionScreenRecording"`。
- `dispatch: "dry-run" | "runtime-computeruse"`。
- `runtimeEntry.port: "BaseToolExecutorPort.computeruse.startRecording"`。
- `recordingEnvelope.target: "region"`。
- dry-run 下 `metadataOnly: true`。
- 真执行下 `recordingId`。

## 8. 错误边界

稳定错误包括 `INVALID_REQUEST`、`INVALID_CONTEXT`、`INVALID_TARGET`、`MISSING_RUNTIME_ID`、`MISSING_PURPOSE`、`MISSING_RECT`、`INVALID_DISPLAY_ID`、`INVALID_RECT`、`RECT_TOO_LARGE`、`INVALID_COORDINATE_SPACE`、`INVALID_MAX_DURATION`、`INVALID_FRAME_RATE`、`INVALID_INCLUDE_CURSOR`、`INVALID_INCLUDE_AUDIO`、`INVALID_OUTPUT_FORMAT`、`INVALID_DESTINATION_HINT`、`SCOPE_DENIED`、`CONTRACT_REJECTED`、`GOVERNANCE_REJECTED`、`PROVIDER_UNAVAILABLE` 和 `PROVIDER_FAILURE`。

这些错误都必须 public-safe，不泄漏 ffmpeg、PipeWire、portal、窗口系统、文件路径、stack trace 或 provider 私有细节。

## 9. 依赖对象

- `BaseToolExecutorPort.computeruse.startRecording`。
- runtime governance / TAP guard。
- runtime recording session 和 artifact storage。

`dependencies.ts` 只包装 runtime port，不直接 import 或 spawn ffmpeg、PipeWire、portal、shell、browser driver、MCP client 或 OS automation 包。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.rectangularSelectionScreenRecording")`。
- `BaseToolHandler.invoke(...)`。
- runtime execEngine bridge。
- TAP/agent 上层编排。

## 11. 不应该做什么

- 不自动选择区域。
- 不自动停止录屏。
- 不把视频交给 `omni.viewVideo`。
- 不 fallback 到 shell、MCP、browser-use、Playwright、Puppeteer、ffmpeg、PipeWire 或 portal。
- 不把 browser-use 变成 computeruseBase 语义。
- 不在 entry 层复制 storage 实现。

## 12. 最小实现建议

以 storage `core.ts` 为唯一 contract 中心，entry 文件保持显式导出。新增相邻 screenRecording 工具时复用同族 handler/registry/runtime-chain 测试形状。

## 13. 最小测试建议

- dry-run 不调用 provider。
- malformed JSON 不抛 raw TypeError。
- 缺 runtimeId、缺 purpose、缺 rect、非法 rect/display/coordinateSpace/frameRate/destination。
- denied guard 返回 `GOVERNANCE_REJECTED`。
- missing provider 返回 `PROVIDER_UNAVAILABLE`。
- provider throw 返回 public-safe `PROVIDER_FAILURE`。
- fake `executor.computeruse.startRecording` 被调用，且 target 为 `region`。
- handler 通过 `BaseToolInvokeRequest` 调用。
- registry 通过 `createBaseToolRegistry().lookupHandler(...)` 调用。

## 14. 与系统链路的关系

标准链路：

```text
model tool_call JSON
  -> invocation adapter
  -> execEngine bridge
  -> createBaseToolRegistry().lookupHandler("computeruse.rectangularSelectionScreenRecording")
  -> BaseToolHandler.invoke(request)
  -> storage bestPractice.ts
  -> storage core.ts
  -> BaseToolExecutorPort.computeruse.startRecording
  -> BaseToolInvokeResult
```

## 15. ToolSkill 文档边界

storage markdown 必须是可操作手册，包含 `Use This Tool`、`Call Shape`、`Required Inputs`、`Optional Inputs`、`Runtime Behavior`、`Returns`、`Example` 和 `Avoid`。
