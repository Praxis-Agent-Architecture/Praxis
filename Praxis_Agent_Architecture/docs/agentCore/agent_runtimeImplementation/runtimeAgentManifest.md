# runtimeAgentManifest

> 对应源码：`Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 当前文件：`runtimeAgentManifest.ts`。
- 角色概括：把 OAO 的 Agent class/instance 编译成 runtime 可执行、可治理、可审计的 `AgentManifest` 契约。

## 2. 文件职责

这个文件定义 `PraxisAgent`、`HarnessSpec`、`AgentManifest` 和 `compileAgent`。它让用户可以用 OO 方式写 Agent，但 runtime 只执行编译后的声明式 manifest。

## 2.1 文件名语义拆解

- `runtime`：服务 Praxis runtime kernel。
- `AgentManifest`：运行时事实来源，不是用户 class 本体。
- 工程含义：把 authoring surface 和 execution surface 分开，避免 runtime 执行任意 class 内部逻辑。

## 3. 目录语义

`agent_runtimeImplementation` 是 runtime 内核层。本文件处在根运行面，是因为 AgentManifest 会被 invocation、modelAdapter、execEngine、session/event 和 inspection 多个 runtime surface 共同读取。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / OAO AgentManifest 编译面。
- 核心目的：把 PraxisAgent class 或 instance 编译为 runtime 只读执行合同。
- 能力要求1：支持 class 与 instance 两种 OAO authoring 输入，并生成稳定 manifestHash。
- 能力要求2：Harness 保持声明式，runtime 后续只执行 AgentManifest，不直接执行 Agent class 内部逻辑。
- 边界：只定义 agent 编译合同，不启动进程、不读取文件、不调用模型、不执行工具。
- 对接：需要服务 PraxisRuntimeKernel、runtime.invocationMethod、runtime.modelAdapter 和 runtime.execEngine。
- 实现提示：先保证最小可运行字段、稳定 hash、public-safe 错误，再等待 promptPack/mainLoop 设计加厚。

## 5. 需要提供的能力

- 提供 `PraxisAgent` 抽象类作为 OAO 的最小 authoring 单位。
- 提供 `model`、`harness`、`tool`、`tools`、`policy`、`loop` 这些声明式 helper。
- 支持 `compileAgent(AgentClass)` 和 `compileAgent(instance)`。
- 输出稳定 `manifestHash`、model carrier、tools、policy、loop、storage、promptPack 占位和 runtimeRequirements。
- 明确 constructor 只允许声明配置，runtime 不把它当执行入口。

## 6. 输入边界

- 输入必须是 `PraxisAgent` class 或 instance。
- class 编译只能调用无参 constructor；带配置的 Agent 使用 instance 形式。
- identity、model、harness 是最小必需字段。
- Harness 内容必须保持可序列化、可检查、可合并，不应携带 live process 或 raw secret。

## 7. 输出边界

- 成功输出 `praxis.agentManifest.v1`。
- manifest 包含 identity、model、harness、source、verification 和 hash。
- 输出不包含 raw credential、provider 私有响应或工具执行结果。

## 8. 错误边界

- 缺 Agent、缺 identity、缺 model、缺 harness 都返回 public-safe compile error。
- class constructor 抛错只映射为 `INVALID_AGENT_CLASS`。
- 错误停在 compile/manifest 边界，不触发模型、工具或 IO。

## 9. 依赖对象

- Node crypto hash。
- `CredentialRef` 和 provider reasoning 类型。
- 下游 runtime surfaces：`PraxisRuntimeKernel`、`runtime.modelAdapter`、`runtime.execEngine`、`runtime.invocationMethod`。

## 10. 被谁调用

- `PraxisRuntimeKernel.run(agent, task)`。
- 后续 `rax build/run/inspect`。
- OAO/DSL 编译层。
- runtime inspection/debug 和 manifest verification。

## 11. 不应该做什么

- 不读取文件、不打开网络、不启动进程。
- 不解析 auth、不保存 raw secret。
- 不设计 promptPack 终局结构。
- 不把 mainLoop 动作原语写进 manifest compiler。

## 12. 最小实现建议

- 保持 manifest v1 小而能跑。
- 新字段优先放到 harness 的声明式对象中。
- 需要 live 能力时只记录 runtimeRequirements，不在 compile 阶段执行。

## 13. 最小测试建议

- 测 class 编译、instance 编译、hash 稳定性。
- 测缺关键字段的 public-safe 错误。
- 测 constructor 配置只影响声明式 harness。

## 14. 与系统链路的关系

它位于 `PraxisAgent -> compileAgent -> AgentManifest -> PraxisRuntimeKernel.runManifest` 的前半段，是 runtime 从“用户编码对象”进入“可执行合同”的入口。
