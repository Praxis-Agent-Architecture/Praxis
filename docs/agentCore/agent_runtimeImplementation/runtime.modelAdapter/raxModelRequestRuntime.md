# raxModelRequestRuntime

> 对应源码：`src/runtimeImplementation/runtime.modelAdapter/raxModelRequestRuntime.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.modelAdapter`。
- 当前文件：`raxModelRequestRuntime.ts`。
- 角色概括：把 runtime 调用模式接到新的 `RaxModelRequest` / `RaxModelClient` 请求层，同时保留治理和契约后的 invocation 证据链。

## 2. 文件职责

`raxModelRequestRuntime` 是 runtime 到新 modelAdapter 请求层的薄桥。

它接收已经构造好的 `RaxModelRequest`，按 `prepare`、`stream` 或 `generate` 模式调用 `RaxModelClient`，并把结果包装回 runtime 可串联的结构。

## 2.1 文件名语义拆解

- `raxModelRequest`: Praxis 内部稳定模型请求语义。
- `Runtime`: 说明它不是 provider SDK helper，而是 runtime 调用桥。
- 工程含义：上层应用或 invocation surface 可以通过这个文件统一触发 provider 请求路径，同时保留 invocationId、事件和错误边界。

## 3. 目录语义

- `runtime.modelAdapter` 承接 runtime 调用、治理、契约和 modelAdapter provider 请求。
- `raxModelRequestRuntime` 在 runtime invocation/application surface 与 `src/modelAdapter` 之间。
- provider 字段形状、protocol lowering、transport、auth 都属于 `src/modelAdapter`。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / RaxModelRequest 调用桥。
- 核心目的：把 runtime 调用模式接到新的 RaxModelClient prepare/stream/generate 请求层。
- 边界：不选择 provider route、不解析产品配置、不实现重试策略；provider 字段形状归 src/modelAdapter。
- 对接：上接 runtime invocation/application surface，下接 modelAdapter 的 RaxModelRequest、RaxModelClient、protocol 和 transport。
- 实现提示：保持 prepare/stream/generate 三种模式可注入、可测试，并保留事件与 invocationId 供上层串联。

## 5. 需要提供的能力

- 接收 `RaxModelRequest`。
- 支持 `prepare`、`stream`、`generate` 三种模式。
- 支持注入 `RaxModelClient`，便于测试和上层替换。
- 为请求补 `invocationId`。
- 返回 prepared request、过程事件或折叠后的 response。
- 捕获 provider/transport/protocol 错误并转为 runtime 错误结果。

## 6. 输入边界

- 输入必须包含 `request: RaxModelRequest`。
- `client` 是可选依赖注入；缺省使用默认 model client。
- `mode` 只决定 runtime 如何消费 client 结果，不决定 provider route。
- provider/model/auth/metadata 已经在 `RaxModelRequest` 或 registry completion 阶段确定。

## 7. 输出边界

- 成功输出包含 `runtimeId`、`invocationId`、events，以及可选 prepared/response。
- `prepare` 模式输出 redacted provider request。
- `stream` 模式输出 RaxModelEvent 列表。
- `generate` 模式输出折叠后的 RaxModelResponse。

## 8. 错误边界

- provider、protocol、transport、auth 或请求构造错误统一进入失败结果。
- 错误至少包含稳定 `code` 和 `message`。
- 不在这里解析 provider 文本；provider 错误分类由 `src/modelAdapter/route/errorClassification.ts` 提供。

## 9. 依赖对象

- `RaxModelRequest`
- `RaxModelClient`
- `RaxModelEvent`
- `RaxPreparedModelRequest`
- `RaxModelResponse`
- `foldRaxModelEvents`

## 10. 被谁调用

- runtime invocation surface
- application runtime
- Raxode 这类上层产品的模型调用桥
- devdoctor / smoke / integration tests

## 11. 不应该做什么

- 不选择 provider route。
- 不读取产品级配置。
- 不解析 secret 文件。
- 不实现 retry/fallback 策略。
- 不把 provider 原始字段提升为 public runtime contract。

## 12. 最小实现建议

- 保持函数入口窄，只接收 runtime id、invocation id、mode、request 和 client。
- `prepare` 直接调用 client.prepare。
- `stream` 收集 async events。
- `generate` 复用 stream 后用 `foldRaxModelEvents` 折叠。
- 错误捕获要保留 code，供上层 diagnostics 使用。

## 13. 最小测试建议

- 测试 prepare 模式返回 redacted request。
- 测试 stream 模式返回事件且不折叠 response。
- 测试 generate 模式返回 response 和 usage。
- 测试 provider 错误被包装为失败结果。
- 测试注入 mock client，不依赖真实网络。

## 14. 与系统链路的关系

它是 runtime 调用链最后进入 modelAdapter provider 请求层的入口。推荐链路是：上层先用 `RaxProviderRegistry.completeModelRequest()` 完成 provider/model/route/auth，再把完成后的 `RaxModelRequest` 交给这里执行。
