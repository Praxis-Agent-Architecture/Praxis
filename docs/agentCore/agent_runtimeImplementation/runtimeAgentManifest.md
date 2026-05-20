# runtimeAgentManifest

> 对应源码：`src/agentCore_runtimeImplementation/runtimeAgentManifest.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 当前文件：`runtimeAgentManifest.ts`。
- 角色概括：把 OAO 的 Agent class/instance 编译成 runtime 可执行、可治理、可审计的 `AgentManifest` 契约。

## 2. 文件职责

这个文件定义 `PraxisAgent`、`PraxisAgentArchetype`、`HarnessSpec`、`AgentManifest` 和 `compileAgent`。它让用户可以用 OO 方式写 Agent 或成熟 Agent archetype，但 runtime 只执行编译后的声明式 manifest。

## 2.1 文件名语义拆解

- `runtime`：服务 Praxis runtime kernel。
- `AgentManifest`：运行时事实来源，不是用户 class 本体。
- 工程含义：把 authoring surface 和 execution surface 分开，避免 runtime 执行任意 class 内部逻辑；开发者写 class，runtime 只信 manifest。

## 3. 目录语义

`agent_runtimeImplementation` 是 runtime 内核层。本文件处在根运行面，是因为 AgentManifest 会被 invocation、modelAdapter、execEngine、session/event 和 inspection 多个 runtime surface 共同读取。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / OAO AgentManifest 编译面。
- 核心目的：把 PraxisAgent class 或 instance 编译为 runtime 只读执行合同。
- 能力要求1：支持 class 与 instance 两种 OAO authoring 输入，并生成稳定 manifestHash。
- 能力要求2：Harness 保持声明式，runtime 后续只执行 AgentManifest，不直接执行 Agent class 内部逻辑。
- 边界：只定义 agent 编译合同，不启动进程、不读取文件、不调用模型、不执行工具。
- 对接：需要服务 PraxisRuntimeKernel、runtime.invocationMethod、runtime.modelAdapter 和 runtime.execEngine。
- 实现提示：Agent Archetype 只编译声明式 spec 和 stable refs，不能把函数体或 provider 字段形状塞进 runtime 执行真相。

## 5. 需要提供的能力

- 提供 `PraxisAgent` 抽象类作为 OAO 的最小 authoring 单位。
- 提供 `PraxisAgentArchetype` 作为成熟 Agent 模式承接层。
- 提供 `model`、`harness`、`tool`、`tools`、`policy`、`loop` 这些声明式 helper。
- 提供 `endpoint`、`modelFleet.auto`、`PromptPack`、`markdown`、`markdownFile`、`append`、`replaceLastLines`、`mainLoop.standard`、`sandbox.hostObserved`、`sandbox.temp`、`toolPolicies.bapr/yolo/permissive/standard/restricted/codingAgentFull`、`session`、`statePlane` 这些 authoring spec helper。
- 支持 `compileAgent(AgentClass)` 和 `compileAgent(instance)`。
- 输出稳定 `manifestHash`、model carrier、ModelFleet、PromptPack authoring refs/patches、MainLoop hook refs、Sandbox、BaseTool policy matrix、Session、StatePlane、FrameworkCore contract、tools、policy、loop、storage 和 runtimeRequirements。
- 提供 `validateAgentManifest` 和 `inspectAgentManifest`，让 rax/CI/debug 可以只拿 manifest 做校验和摘要检查，不要求重新实例化 Agent class。
- 明确 constructor 只允许声明配置，runtime 不把它当执行入口。
- Agent/archetype 顶层声明的 PromptPack 会同步进入 `manifest.promptPack` 与 `manifest.harness.promptPack`，保证开发者 authoring 面和当前 Kernel 消费面一致。
- Prompt patch helper 会生成稳定 patchId，并把 `sceneTrigger` / `stateTrigger` 保留为触发元数据；重复 patchId 会在 compile 阶段被拒绝，避免 prompt diff/audit ref 歧义。
- 默认工具策略是 `toolPolicies.standard()`，默认沙箱是 `sandbox.hostObserved()`。
- `host-observed` 表示没有真实容器隔离，但 runtime 仍然记录、治理、预算和审批行为；这是比假装 sandbox 更诚实的默认宿主模式。

## 6. 输入边界

- 输入必须是 `PraxisAgent` class 或 instance。
- class 编译只能调用无参 constructor；带配置的 Agent 使用 instance 形式。
- identity、model、harness 是最小必需字段；archetype 可额外声明 modelFleet、promptPack、mainLoop、sandbox、toolPolicy、session、statePlane。
- Harness 内容必须保持可序列化、可检查、可合并，不应携带 live process 或 raw secret。
- MainLoop hook 必须是 stable refs，例如 strategyRef、handlerRef、policyRef，不能是函数体。
- ModelFleet endpoint 必须落到显式 endpoint family / protocol family / capability role，不靠 runtime 猜字符串。
- Prompt patch 的 `patchId` 必须在 `patches` 与 `stateMachineMutations` 合并范围内唯一；需要同场景多 patch 时应显式传入不同 `patchId`。
- Sandbox 必须声明稳定 `sandboxId/profile/filesystem/network/shell`；ToolPolicy 必须声明稳定 `matrixId/profile`。

## 7. 输出边界

- 成功输出 `praxis.agentManifest.v1`。
- manifest 包含 identity、model、modelFleet、promptPack、mainLoop、sandbox、toolPolicy、session、statePlane、frameworkCore、harness、source、verification 和 hash。
- `frameworkCore` 明确记录 PromptPack 正式入口、MainLoop/CoreLogic 正式入口、ModelDecision 变体、BaseTool canonical mount chain、session/state/event 记录面、approval 界面面、inspection/debug 状态，以及 TAP/CMP/MP/multiagent 的 contract-only bridge 状态。
- 输出不包含 raw credential、provider 私有响应或工具执行结果。
- promptPack 在这里是内部材料包 authoring refs，不是 provider payload builder。

## 8. 错误边界

- 缺 Agent、缺 identity、缺 model、缺 harness 都返回 public-safe compile error。
- 非法 modelFleet、prompt patch、mainLoop hook、sandbox limit、BaseTool policy matrix、session、statePlane 都返回 public-safe compile error。
- 重复 PromptPack patchId 会被视为非法 prompt patch，因为 audit/diff/state-machine prompt mutation 都需要稳定且不歧义的引用。
- 非法 sandbox/profile 或 policy/profile shape 会在 compile 阶段被拒绝，不进入 runtime 执行。
- manifest 校验会拒绝 hash 不匹配、frameworkCore 缺失、顶层 view 与 harness view 不一致、以及疑似 raw secret 字段。
- class constructor 抛错只映射为 `INVALID_AGENT_CLASS`。
- 错误停在 compile/manifest 边界，不触发模型、工具或 IO。

## 9. 依赖对象

- Node crypto hash。
- `CredentialRef` 和 provider reasoning 类型。
- 下游 runtime surfaces：`PraxisRuntimeKernel`、`runtime.modelAdapter`、`runtime.execEngine`、`runtime.invocationMethod`。
- BaseTool policy matrix 只使用 family/group/toolId 语义，不依赖 executor namespace。

## 10. 被谁调用

- `PraxisRuntimeKernel.run(agent, task)`。
- 后续 `rax build/run/inspect`。
- OAO/DSL 编译层。
- runtime inspection/debug 和 manifest verification。

## 11. 不应该做什么

- 不读取文件、不打开网络、不启动进程。
- 不解析 auth、不保存 raw secret。
- 不实现真实 sandbox 容器。
- 不实现 TAP/CMP/MP/multiagent 的具体能力。
- 不把 PromptPack 变成字符串拼接器或 provider payload。
- 不把 mainLoop 变成任意 JS 执行器。
- 不重写 BaseTool handler 或按 executor namespace 重分类工具。

## 12. 最小实现建议

- 保持 manifest v1 仍能被 `PraxisRuntimeKernel.runManifest` 执行。
- 新字段要同时出现在顶层 authoring spec 和 harness 的声明式对象中，方便 runtime inspection 与后续 DSL/rax 使用。
- PromptPack 字段尤其要保持顶层 manifest 与 harness view 镜像一致，直到 `PraxisRuntimeKernel` 完全切到正式 promptPack/mainLoop 合同。
- 需要 live 能力时只记录 runtimeRequirements，不在 compile 阶段执行。
- 检查明显错误，但不要在 compile 阶段探测 provider、读 markdownFile 或启动 sandbox。

## 13. 最小测试建议

- 测 class 编译、instance 编译、hash 稳定性。
- 测缺关键字段的 public-safe 错误。
- 测 constructor 配置只影响声明式 harness。
- 测 Agent Archetype 的 modelFleet、promptPack patch、mainLoop hook refs、sandbox、toolPolicy、session、statePlane 能编译进 manifest。
- 测 archetype PromptPack 同时落入 `manifest.promptPack` 和 `manifest.harness.promptPack`，以及 scene-triggered patchId 不冲突。
- 测 `host-observed` sandbox 和 bapr/yolo/permissive/standard/restricted policy profiles 都能落入 manifest 顶层和 harness view。
- 测 `validateAgentManifest` 的 hash 稳定、malformed manifest public-safe error，以及 `inspectAgentManifest` 的开发者可读摘要。
- 测函数式 mainLoop body 和非法 prompt patch 被拒绝。

## 14. 与系统链路的关系

它位于 `PraxisAgent -> compileAgent -> AgentManifest -> PraxisRuntimeKernel.runManifest` 的前半段，是 runtime 从“用户编码对象”进入“可执行合同”的入口。
