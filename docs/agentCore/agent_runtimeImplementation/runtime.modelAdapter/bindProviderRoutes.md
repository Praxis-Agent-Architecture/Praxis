# bindProviderRoutes

> 对应源码：`src/runtimeImplementation/runtime.modelAdapter/bindProviderRoutes.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.modelAdapter`。
- 当前文件：`bindProviderRoutes.ts`。
- 角色概括：把 modelAdapter provider route 以 runtime binding 的形式暴露给上层应用、官方模块和 inspection/devdoctor，并接受 runtime 契约与治理门禁。

## 2. 文件职责

`bindProviderRoutes` 负责把已知 provider route 引用绑定到 runtime.modelAdapter 表面。

它不做 provider 调用，也不读取 auth secret；它只把“哪些 provider route 已经被 runtime 挂载”变成稳定、可审计、可治理的结构。

## 2.1 文件名语义拆解

- `bind`: 把外部准备好的对象挂到 runtime surface。
- `ProviderRoutes`: 挂载对象是 provider route 引用，不是 provider SDK 客户端。
- 工程含义：它是 runtime.modelAdapter 的 provider 绑定点，让 runtime 知道当前可用的 provider/protocol route。

## 3. 目录语义

- `runtime.modelAdapter` 是模型适配运行承托面，需要接住契约、治理和 provider route 暴露边界。
- `bindProviderRoutes` 处在 registry/client 之上、runtime surface 之下。
- provider 原始字段、HTTP body、protocol lowering 都留在 `src/modelAdapter`。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / provider route 绑定面。
- 核心目的：记录 runtime 可用的 provider routes，不直接执行 provider 调用。
- 边界：只绑定 provider route 引用和 metadata，不读取密钥、不探测 provider、不发送请求。
- 对接：上接 runtime.modelAdapter 绑定面，下接 modelAdapter registry/client 暴露的 provider route。
- 实现提示：保持纯函数和结构化错误，让上层应用、devdoctor 和 runtime inspection 可直接消费绑定结果。

## 5. 需要提供的能力

- 校验 `runtimeId`、`caller`、`routeGroup.id` 和 routes。
- 规范化 provider、routeId、protocolId。
- 输出 `runtime.modelAdapter.providerRoutes` 绑定结果。
- 去重输出 providers 列表。
- 保留 `metadata` 给上层诊断。
- 返回结构化错误，方便 runtime inspection/devdoctor 判断失败原因。

## 6. 输入边界

- 输入只包含 runtime id、调用方、route group、runtime ready 状态、contract gate 和 governance gate。
- route 只保存 `provider`、`routeId`、`protocolId` 这类引用信息。
- 不接收 provider SDK 对象、secret、原始 HTTP body 或 providerOptions。

## 7. 输出边界

- 成功输出 `ProviderRouteBinding`。
- 输出包括 binding id、runtime id、route group id、caller、routes、providers、metadata 和 dry-run 状态。
- 输出不暴露 provider 原始字段形状，也不泄漏 auth。

## 8. 错误边界

- 缺少 runtime id、caller、route group、route group id 时返回 input 类错误。
- runtime 未 ready、contract 拒绝、governance 拒绝时返回对应边界错误。
- routes 为空时返回 binding 类错误。
- 错误对象必须 `publicSafe: true`。

## 9. 依赖对象

- `ModelAdapterRuntimeCaller`
- `ModelAdapterRuntimeGate`
- modelAdapter registry/client 产生或描述的 provider route 引用
- runtime governance 和 contract surface 的判定结果

## 10. 被谁调用

- runtime.modelAdapter 组合面
- application surface
- official module surface
- devdoctor / inspection / debug 工具

## 11. 不应该做什么

- 不读取密钥。
- 不探测 provider。
- 不发送 HTTP 请求。
- 不构造 provider body。
- 不替代 `RaxProviderRegistry` 或 `RaxModelClient`。

## 12. 最小实现建议

- 保持为纯函数。
- 所有字符串输入先 trim 再判断。
- 对 routes 做最小合法化和 provider 去重。
- contract/governance/runtime-ready 优先失败，避免产生误导性的绑定结果。

## 13. 最小测试建议

- 测试最小合法 route group 可绑定。
- 测试 provider 去重和 protocolId trim。
- 测试缺少 route group、空 routes、runtime not ready、governance rejected。
- 测试输出不会包含 secret 或 provider 原始字段。

## 14. 与系统链路的关系

它是 provider registry/client 到 runtime.modelAdapter 的桥。上游可以先用 `RaxProviderRegistry` 组织 provider，再通过这里把 provider route 能力挂到 runtime；真正模型调用仍走 `RaxModelRequest`、protocol 和 transport。
