# praxisRuntimeKernel

> 对应源码：`src/runtimeImplementation/praxisRuntimeKernel.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 当前文件：`praxisRuntimeKernel.ts`。
- 角色概括：第一条可用 Agent v1 纵向链路。

## 2. 文件职责

这个文件执行已编译的 `AgentManifest`，把 text IO、codex responses、BaseTool runtime mount、session/state/event 串成最小可用 Agent。它是 kernel，不是 promptPack 或 mainLoop 的终局设计。

## 2.1 文件名语义拆解

- `PraxisRuntimeKernel`：Praxis agentCore 的可执行 runtime kernel。
- `runManifest`：runtime 只执行 manifest。
- `run`：用户语法糖，内部先 compile。

## 3. 目录语义

`agent_runtimeImplementation` 负责治理、契约、调用、执行承托和记录。本文件横向调用多个 runtime surface，但不吞并它们的内部语义。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / PraxisRuntimeKernel。
- 核心目的：执行已编译 AgentManifest，把 text IO、codex responses、BaseTool mount 和 session/event 记录串成第一条可用 agent 链。
- 能力要求1：runtime 执行 manifest，不直接执行 Agent class 内部逻辑，run(agent) 只作为 compile 后的语法糖。
- 能力要求2：支持 codex_responses 模型调用、一次工具调用回填、BaseToolExecutorPort 注入和最小 session/state/event 记录。
- 边界：不设计 promptPack 终局语义，不加厚 mainLoop/coreLogic 动作原语，不吞并 baseTool storage 语义。
- 对接：需要服务 OAO compile、runtime.modelAdapter、runtime.execEngine、IOTransceiver 和后续 inspection/debug。
- 实现提示：先提供可测试纵向闭环，再由用户监督 promptPack 与 mainLoop/coreLogic 的正式设计。

## 5. 需要提供的能力

- `run(agent, task)` 先 compile 再执行。
- `runManifest(manifest, task)` 创建 session，接 text input，调用 model，执行工具，暴露 text output。
- 调用 `runtime.modelAdapter.modelInvocationRuntime` 的 codex responses live path。
- 通过 `invokeMountedBaseTool` 进入 registry/handler/executor 链。
- 把 model/tool/io/state/event 写入 session store。

## 6. 输入边界

- 输入是 `AgentManifest` 或 `PraxisAgent` 加 text task。
- live model 必须显式传入 auth、providerCaller、`allowProviderCall` 和 `dryRun:false`。
- 工具执行走 manifest policy 与 runtime executor，不能绕过 BaseTool mount。
- promptPack 当前只是 runtime shim，等待用户单独设计。

## 7. 输出边界

- 成功输出 final text、modelCalls、toolCalls、events、session state snapshot。
- 失败输出 public-safe runtime error 和已记录状态。
- 不输出 raw secret，不提升 provider 原始字段为 Praxis 公共语义。

## 8. 错误边界

- compile、text input、model invocation、tool invocation、text output 分别有稳定错误码。
- provider 和 tool 失败会先记录 invocation，再以 public-safe error 返回。
- session store 只保存可审计摘要和 public-safe payload。

## 9. 依赖对象

- `runtimeAgentManifest`
- `runtime.modelAdapter/modelInvocationRuntime`
- `runtime.execEngine/baseToolRuntimeMount`
- `runtime.execEngine/baseToolExecutorPortFactory`
- `IOTransceiver/textReceiver` 与 `textExposer`
- `runtimeSessionStateEventStore`

## 10. 被谁调用

- 未来 `rax run`。
- 上层应用 runtime surface。
- First Agent smoke、integration tests、后续 raxode agent bootstrap。
- inspection/debug/replay surface。

## 11. 不应该做什么

- 不重做 `basic_toolLayer`。
- 不把 promptPack 终局策略写死。
- 不加厚 mainLoop/coreLogic 动作原语。
- 不把 MCP/computeruse/omni 高级策略放进 kernel。

## 12. 最小实现建议

- 第一版只支持 text input/output、codex responses、一次工具调用回填。
- 保持 providerCaller 和 executor 可注入，方便测试和未来应用宿主接管。
- 等 promptPack 和 mainLoop 审计完成后，把 shim 替换为正式 surface。

## 13. 最小测试建议

- 测无工具 agent 的 model 调用闭环。
- 测 model 请求 baseTool 后工具结果回填。
- 测 session/state/event 是否可读。
- 测 missing provider/auth/tool failure 的 public-safe 错误。

## 14. 与系统链路的关系

它证明 `AgentObject -> compileAgent -> AgentManifest -> runManifest -> model/baseTool/session/event -> final output` 这条链已经可运行，是后续 promptPack、mainLoop/coreLogic、TAP/CMP/MP 接入的基准。
