# baseToolRuntimeMount

> 对应源码：`src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.execEngine`。
- 当前文件：`baseToolRuntimeMount.ts`。
- 角色概括：把 baseTool 的 registry handler、runtime 调用入口、治理契约和 `BaseToolExecutorPort` 串成统一挂载点。

## 2. 文件职责

这个文件负责把已经完成的 175 个 baseTool 接入 runtime 的统一运行链路。

它不是单个工具实现，也不是 provider 实现；它只把 `adaptRuntimeToolInvocation`、`bridgeExecEngineInvocation`、`createBaseToolRegistry().lookupHandler` 和 `handler.invoke({ executor })` 收束为一个 runtime 可调用的窄接口。

## 2.1 文件名语义拆解

- 原始文件名：`baseToolRuntimeMount.ts`。
- 命名片段：`baseTool` / `Runtime` / `Mount`。
- 工程含义：这是 runtime 中 `runtime.execEngine` 表面下的 baseTool 挂载能力点，重点是让上层应用或官方模块通过 runtime 稳定调用基础工具。
- 第一实现重点：固化 registry handler 到 `BaseToolExecutorPort` 的调用链，避免每个 baseTool 都写一份散落 wrapper。
- 边界提醒：runtime 是承托面，不应吞并 executionEngine、modelAdapter、interfaceAdapter 的内部实现。

## 3. 目录语义

- 执行引擎运行绑定层：把 executionEngine 安全拉入 runtime 生命周期、状态和调用面。
- 本文件位于 `runtime.execEngine`，说明它只负责执行引擎的运行态挂载，不负责模型 provider、接口协议或官方模块策略。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
- 核心目的：把 baseTool registry、tool invocation envelope 和 BaseToolExecutorPort 串成统一运行时挂载点。
- 能力要求1：需要让所有内置 baseTool 通过同一条 runtime 链路进入 handler.invoke。
- 能力要求2：如果后续发现语义不足，应优先补 runtime port 契约，而不是给单个工具写散落 wrapper。
- 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
- 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 接收 runtimeId、sessionId、toolId、input、executor、caller、scope、contract 和 governance 上下文。
- 生成基础工具调用 envelope，并经过 invocation adapter 与 execEngine invocation bridge。
- 通过 baseTool registry 查询 handler，最后调用 `BaseToolHandler.invoke`。
- 调用 handler 前执行 baseTool support preflight，确认所需 executor port 不是缺失或单纯 unavailable 占位。
- 把工具结果、事件、挂载链路和 executor port 信息返回给 runtime 调试、审计和观察面。
- 保持 runtime 治理和契约可见，不让上层绕过统一入口直接调工具。

## 6. 输入边界

- 输入必须包含 `runtimeId`、`sessionId`、`toolId` 和 `BaseToolExecutorPort`。
- 工具输入保持为普通 record，由具体 baseTool 的 handler/core 校验实际 schema。
- `readinessMode` 控制管理面行为：默认阻断缺真实 executor support 的工具，`observe` 只记录不阻断，`require-ready` 会把待审批状态也拦下。
- `implementedPortPaths` 声明当前 runtime 已真实实现或已注入 backend 的 port；未声明的 delegated port 不会被误判为真实可用。
- scope、contract、governance、metadata 只作为 runtime 调用上下文进入，不应该混入 provider 私有对象。

## 7. 输出边界

- 成功时输出 mounted invocation 描述、原始 `BaseToolInvokeResult` 和聚合事件。
- mounted invocation 暴露 runtime 链路信息，例如 registry、adapter、bridge、executor port、family 和 preflight readiness。
- 工具业务输出仍由 baseTool handler 自己决定，runtime mount 不改写 provider 结果。

## 8. 错误边界

- 缺少 runtimeId、sessionId、toolId 或 executor 时返回 input 类错误。
- adapter、bridge、registry、handler 抛错分别映射到稳定错误码。
- runtime support preflight 发现缺真实 executor support 时返回 `RUNTIME_SUPPORT_UNAVAILABLE`，停在 runtime-state 边界，不进入 handler。
- handler 抛异常时不泄漏内部错误细节，只返回 public-safe 的 `HANDLER_THROWN`。
- 治理和契约失败必须停在 runtime 侧，不进入 handler 真实 dispatch。

## 9. 依赖对象

- `agentCore.basicTool.invocationAdapter`
- `runtime.execEngine.invocationBridge`
- `agentCore.basicTool.registry`
- `BaseToolHandler.invoke`
- `BaseToolExecutorPort`
- `runtime.execEngine.baseToolSupportCatalog`
- `runtime.contractSurface`
- `runtime.governancePlane`
- `runtime.invocationMethod`

依赖关系通过显式参数、接口或 runtime context 进入，不在文件内部形成不可替换的全局执行器。

## 10. 被谁调用

- 上层 Agent 应用。
- TAP/CMP/MP/multiagent 官方模块。
- runtime invocationMethod 的 tool 调用入口。
- runtime inspection、debug、自修复和测试面。

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface。

## 11. 不应该做什么

- 不要实现 shell、git、filesystem、MCP、LSP、computeruse 等具体执行逻辑。
- 不要给 175 个 baseTool 写手工分发分支。
- 不要绕过 baseTool registry 或 `BaseToolExecutorPort`。
- 不要把 provider 原始字段、密钥、内部错误直接暴露给上层。

## 12. 最小实现建议

- 第一版只提供 `invokeMountedBaseTool` 这一条统一链路。
- 保留 registry 和 executor 注入，便于测试、官方模块和未来 rax/raxode 自定义运行环境复用。
- 后续可以在同层增加 executor port factory、runtime event persistence 和 resource governor，但不要把具体工具逻辑塞进本文件。

## 13. 最小测试建议

- 验证合法请求能通过 registry handler 调到 `BaseToolExecutorPort`。
- 验证缺少 executor 时不进入 registry 和 handler。
- 验证未知 toolId 返回 registry 类错误。
- 验证缺少真实 executor support 时 preflight 不进入 handler。
- 验证返回事件包含 adapter 与 bridge 事件，方便 runtime debug 和审计串联。

## 14. 与系统链路的关系

它是 baseTool 挂载进 runtime 的第一条真实主链路：用户或官方模块先进入 runtime，再经过 invocationMethod 和 execEngine，最后由 baseTool handler 调用 runtime 注入的 executor port。

这份文档服务后续编码：当继续把所有 baseTool 接入 runtime 时，应优先扩展 executor port 和 runtime mount，而不是修改每个工具文件。
