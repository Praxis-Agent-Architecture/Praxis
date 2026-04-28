# computeruse.cameraCapturePhoto

对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto.ts`

## 1. 文件位置

- 所属模块：`agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/cameraAccess`。
- 当前 entry：`computeruse.cameraCapturePhoto.ts`。
- storage 实现：`src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto/`。

## 2. 文件职责

公开摄像头拍照基础工具的 canonical storage 实现、handler、definition 和类型。

这个 entry 文件只提供稳定导出面；工具 contract、provider practice、runtime port 包装和结果归一化都在 storagePool 中完成。

## 2.1 文件名语义拆解

- `computeruse`：计算机使用基础工具家族。
- `cameraCapturePhoto`：请求 runtime 从摄像头采集一张照片并返回 artifact。
- 这是基础工具原语，不是 TAP 的高级工具，也不决定是否先用 shell、MCP、browser-use 或 omni。

## 3. 目录语义

- `baseTools/computeruseBase` 是模型可调用的公共 entry 层。
- `storagePool/baseToolStorage/computeruseBase` 是实现和 provider practice 层。
- runtime 负责摄像头访问、图像采集、artifact 存储、privacy cleanup 和真实媒体依赖。

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / computeruseBase / cameraAccess / cameraCapturePhoto entry。
- 核心目的：公开摄像头拍照基础工具的 canonical storage 实现、handler、definition 和类型。
- 边界：entry 层只做薄导出，不持有摄像头访问、图像采集、artifact 存储、TAP 策略或 runtime 副作用。
- 对接：通过 builtin baseTool registry、BaseToolHandler.invoke 和 BaseToolExecutorPort.computeruse.captureCameraPhoto 接入 runtime。
- 实现提示：保持显式导出，真实实现继续放在 storagePool/baseToolStorage/computeruseBase。

## 5. 需要提供的能力

- 导出 `cameraCapturePhotoHandler` 供 registry 挂载。
- 导出 `cameraCapturePhotoBaseToolDefinition` 供工具发现和描述使用。
- 导出 `planCameraCapturePhoto` / `executeCameraCapturePhoto` 供兼容测试和局部调用。
- 导出 public-safe 类型，支撑 runtime inspection 和 TAP 高级工具组合。

## 6. 输入边界

- `target.cameraId` 或 `cameraId`：要采集照片的 runtime 摄像头设备 id。
- `target.purpose` 或 `purpose`：拍照目的。
- `target.outputFormat` 或 `outputFormat`：可选输出 MIME 目标。
- `target.permissionLeaseId` 或 `leaseId`：可选 runtime permission lease 元数据。
- `context.dryRun` / `context.guard` / scope 字段：执行边界和治理材料。
- `BaseToolInvokeRequest.runtimeId/sessionId/toolCallId`：handler 路径注入的运行态元数据。

## 7. 输出边界

- dry-run 返回 metadata-only artifact envelope，并包含 normalized target。
- 真实执行成功返回 `captured`、`artifactId`、`mimeType`、runtime entry 和 audit metadata。
- 输出不包含图像二进制、不包含 provider 私有错误、不包含 TAP 策略判断。

## 8. 错误边界

- malformed JSON 返回 `INVALID_REQUEST` / `INVALID_CONTEXT` / `INVALID_TARGET`。
- 缺 runtimeId、cameraId 或 purpose 返回对应 missing 错误。
- 非法 cameraId、purpose、outputFormat 或 permission lease 返回对应 invalid 错误。
- `dryRun:false` 缺 guard 返回 `GOVERNANCE_REJECTED`。
- 缺 runtime provider 返回 `PROVIDER_UNAVAILABLE`，provider 失败返回 public-safe `PROVIDER_FAILURE`。

## 9. 依赖对象

- `BaseToolExecutorPort.computeruse.captureCameraPhoto`：唯一真实摄像头照片采集入口。
- `runtime.governancePlane.toolInvocationGrant`：真实执行 guard 来源。
- `runtime.artifactStore.cameraPhoto`：照片 artifact 写入、MIME typing、retention 和 cleanup 所有权。
- TAP 高级工具系统：负责编排、审批 UX、artifact 消费和 fallback 策略。

## 10. 被谁调用

- `createBaseToolRegistry().lookupHandler("computeruse.cameraCapturePhoto")`。
- runtime execEngine 的 baseTool invocation bridge。
- TAP 高级工具系统和 agent 编排层。

## 11. 不应该做什么

- 不要在 entry 或 storage 中隐藏调用 shell、portal、本地摄像头命令、浏览器自动化、文件系统写入或 provider SDK。
- 不要在 baseTool 中决定是否优先用 MCP、shell、browser-use 或 omni。
- 不要做人脸识别、图像理解或视频录制；这些是其他 camera/vision/omni 能力。

## 12. 最小实现建议

- entry 必须保持显式导出，不使用 bare `export *`。
- storage `core.ts` 负责 JSON 校验、target normalization、outputFormat validation、dry-run、guard、provider missing/failure 和输出归一化。
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

`computeruse.cameraCapturePhoto` 是 cameraAccess 的照片 artifact 原语。TAP/agent 可以把它和 camera permission request、camera select、`omniBase`、`mcpBase`、`shellBase` 组合，但这个 baseTool 自己不做策略编排。

完整 ToolSkill 调用手册放在 storage 文档：

`src/storagePool/baseToolStorage/computeruseBase/cameraAccess/computeruse.cameraCapturePhoto/computeruse.cameraCapturePhoto.md`

## 15. Storage 操作手册对齐点

- storage Markdown 使用与截图组一致的章节：`Use This Tool`、`Call Shape`、`Required Inputs`、`Optional Inputs`、`Runtime Behavior`、`Returns`、`Example`、`Avoid`。
- `Call Shape` 必须展示完整 `BaseToolInvokeRequest`，而不是只展示裸 JSON input。
- `Runtime Behavior` 必须写清真实副作用只走 `BaseToolExecutorPort.computeruse.captureCameraPhoto`，缺 runtime provider 返回 `PROVIDER_UNAVAILABLE`。
- `Avoid` 必须写清不隐藏 shell、portal、browser-use、MCP、media/device/provider SDK 依赖，也不自动调用 `omniBase`。
