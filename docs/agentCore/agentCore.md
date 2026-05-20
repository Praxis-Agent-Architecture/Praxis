# agentCore 总指导文档

## 1. 文档定位

本文是当前 `src/agentCore/` 工程骨架的总指导文件。

它不是旧 `agentCore_rebase_phase_1` 文档线的继续扩写，也不是最终实现说明书。它的作用是：在真正进入代码实现前，把当前 `agentCore` 目录下 488 个 `.ts` 能力位点背后的模块关系、系统边界、调用主线、实现顺序和后续逐文件文档写作口径先统一起来。

接下来将要出现的 488 个 `.md` 文件，应当分别对应 488 个 `.ts` 文件。它们应承接本文的总设计，而不是重新发明另一套 agentCore。

本文的写作目标是“足够全面，但不替代逐文件文档”。也就是说，本文说明系统如何整体成立；每个文件的具体能力、输入输出、边界和最小实现，再由对应的逐文件 `.md` 展开。

## 2. 当前阶段的根本转向

当前阶段已经从“继续写大量长文档”转向“依据用户脑中的真实工程设计，直接编纂工程骨架并逐步实现”。

这就是当前的核心口径：弱文档，强构建。文档只保留能指导工程落地的定位、边界、接口、切片和验收口径，不再为了文档本身继续堆长篇抽象说明。

旧的 `agentCore_rebase_phase_1` 文档组仍然有参考价值，但只能作为 raw reference。它们不再自动决定当前 agentCore 的主线，尤其不能继续按 runner/executor/attempt/result 等外推链条无限扩写。

当前真正的主线是：

```text
工程骨架
  -> 文件能力注释
  -> 总指导文档
  -> 逐文件 md
  -> 类型契约
  -> 最小可测行为
  -> 真实实现
```

所以后续工作必须围绕 `src/agentCore/` 这套结构推进，而不是回到旧文档切片体系里。

## 3. agentCore 的总定位

`agentCore` 是 Praxis 的强运行核心。

它不是：

- Raxode/Raxos 的产品逻辑。
- 只包一层 provider API 的模型转发器。
- 只负责启动和监控的普通 runtime。
- 把所有高级模块都塞进来的混乱大包。
- 被某一家模型厂商字段形状绑死的适配器集合。

它应该是：

- Praxis 上层 Agent 应用真正使用的运行核心。
- `CMP / MP / TAP / multiagent` 等内置正式模块共同依赖的底座。
- 能统一接入 OpenAI、Anthropic、DeepMind/Gemini 和自定义上游格式的模型接入中心。
- 能承托基础工具原语，并让 TAP 在其上构建更高级工具系统的执行核心。
- 能提供治理、契约、调用、检查、debug、自修复和自适应的 runtime 中枢。
- 能让开发者通过稳定对象创建、持有、调用、观察、控制一个 Agent 的工程基础。

一句话：`agentCore` 是 Praxis 让 Agent 被构建出来、跑起来、被应用使用、被官方模块复用、被治理约束、被检查修复的核心底座。

## 4. 总体结构

当前一级结构如下：

```text
agentCore/
  agent_executionEngine/
  agent_modelAdapter/
  agent_interfaceAdapter/
  agent_runtimeImplementation/
```

四个部分不是平级堆放的工具箱，而是围绕 runtime 形成一条强主线：

```text
上层 Agent 应用
  -> runtime.applicationSurface
  -> runtime.invocationMethod
  -> runtime.governancePlane
  -> runtime.execEngine / runtime.modelAdapter / runtime.interfaceAdapter
  -> executionEngine / modelAdapter / interfaceAdapter
```

官方模块也必须走 runtime：

```text
CMP / MP / TAP / multiagent
  -> runtime.officialModuleSurface
  -> runtime.governancePlane
  -> runtime.execEngine / runtime.modelAdapter / runtime.interfaceAdapter
```

这意味着：`agent_runtimeImplementation` 是总承托面，`agent_executionEngine` 是执行身体，`agent_modelAdapter` 是模型上游进入 agentCore 的路径，`agent_interfaceAdapter` 是官方模块和自定义接口进入 agentCore 的接口层。

## 5. 四大模块职责

### 5.1 agent_executionEngine

`agent_executionEngine` 是 Agent 的执行身体。

它负责让 Agent 能够：

- 接收文本、图像、音频、视频等输入。
- 暴露文本、图像、音频、视频等输出。
- 组织模型调用前的 promptPack 输入包。
- 维护主循环和状态机。
- 复用已有 agentCore 实例或运行对象。
- 暴露执行过程事件。
- 调用基础工具原语。
- 让 TAP 可以基于基础工具原语继续构建高级工具系统。

它不是 provider 调用层，也不是官方模块内部策略层。它关注的是 Agent 运行过程本身。

### 5.2 agent_modelAdapter

`agent_modelAdapter` 是模型上游进入 agentCore 的接入和统一使用层。

它负责：

- 把 OpenAI、Anthropic、DeepMind/Gemini 等官方调用面接进来。
- 把不兼容官方形式的自定义上游作为 provider route 接进来。
- 通过 schema / route / protocol 把不同 provider、不同 endpoint、不同格式整理成 Praxis 稳定请求和事件。
- 通过 toolBridge 把 Praxis 工具语义转换成 provider 可理解的 tool schema。

它的目标是：用户接入 auth/API/自定义上游后，agentCore 使用 AI 的方式仍然稳定一致，不需要上层业务到处为 provider 做特殊适配。

### 5.3 agent_interfaceAdapter

`agent_interfaceAdapter` 是接口接入层。

它负责：

- 定义 `CMP / MP / TAP / multiagent` 的基础接口。
- 定义自定义接口如何进入 agentCore。
- 管理自定义接口的定义、复用、规则约束和生命周期。

它不负责实现 CMP、MP、TAP、multiagent 的内部策略。它只负责保证这些模块和自定义接口能通过稳定边界接入 agentCore。

### 5.4 agent_runtimeImplementation

`agent_runtimeImplementation` 是 agentCore 的运行核心承托面。

它负责：

- 让开发者和上层应用真正使用 agentCore。
- 让官方模块统一复用 agentCore。
- 拉起执行引擎、模型适配层、接口适配层。
- 管理 runtime 的契约、治理、调用、检查、debug、自修复、自适应。
- 让 agentCore 不只是“能跑”，而是“能被稳定构建、调用、观察、治理和维护”。

它不是普通启动器。它是整个 agentCore 对外可用性的中心。

## 6. executionEngine 细分

### 6.1 IOTransceiver

`IOTransceiver` 管输入输出收发。

`inputReceiver` 接收文本、图像、音频、视频等输入材料。它需要把外部输入变成执行引擎可消费的输入对象，并保留来源、格式、任务边界和上下文线索。

`outputExposer` 暴露文本、图像、音频、视频等输出结果。它需要让上层应用、runtime 事件订阅、UI 或外部系统能拿到 Agent 的输出。

它不直接做模型理解、工具调用或上下文压缩。

### 6.2 promptPack

`promptPack` 是模型输入前的上下文装配与输入包管理面。

这个点非常重要。`promptPack` 不是最终 provider payload，也不是只把 system prompt 和 user prompt 拼成字符串的工具。

它负责统筹：

- system prompt。
- user prompt。
- tool 摘要。
- 命令注入。
- 上下文材料。
- CMP 交给 agentCore 的上下文结果。
- memory、文件、检索、运行事件等可能进入模型输入的材料。
- 不同材料之间的分层、裁剪、排序、合并和注入。

正确链路是：

```text
user input / command / tool summary / CMP material / memory material
  -> promptPack 整理上下文包和 prompt 输入参数
  -> runtime.modelAdapter / promptLoweringRuntime
  -> agent_modelAdapter / schema
  -> route / protocol
  -> provider registry / transport
  -> provider or customFormat
```

CMP 的上下文管理应该围绕 promptPack 展开。CMP 负责更高级的上下文策略，promptPack 负责把上下文真正整理成模型输入前的统一输入包。

### 6.3 coreLogic

`coreLogic` 管执行推进。

它包含：

- `mainLoop`：Agent 执行主循环。
- `stateEngine`：状态机。
- `reuseInvoker`：agentCore 实例、能力集合或运行对象复用入口。
- `eventExposurePlane`：运行过程事件暴露面。

`reuseInvoker` 尤其重要。它不只是缓存调用结果，而是为 agentCore 被打包复用做准备。未来开发者、CMP、MP、TAP、multiagent、OAO 场景，都应该能以稳定对象方式复用 agentCore，而不是每次从零临时组装。

### 6.4 eventExposurePlane

`eventExposurePlane` 让执行过程可观察。

它需要暴露：

- 输入接收事件。
- 输出回复事件。
- 中断事件。
- UI 事件。
- 基础工具调用事件。
- 官方模块调用事件。
- 多 Agent 调用事件。

它不负责真正执行能力，而负责把执行过程变成 runtime 可观察、可调试、可订阅、可治理的事件流。

### 6.5 basic_toolLayer

`basic_toolLayer` 是 Agent 基础工具原语层。

它是 agentCore 的一部分，因为没有这些基础能力，Agent 很难成立，TAP 也无从构建高级能力系统。

`baseTools` 当前覆盖：

- codeBase：代码读写、编辑、LSP、调试、测试。
- shellBase：命令生成、命令执行、进程控制、交互控制、沙箱和权限。
- gitBase：仓库、分支、文件、暂存区、提交、远端、stash、检查和高级操作。
- mcpBase：连接、鉴权、工具、资源、调用、订阅、缓存和监控。
- computeruseBase：截图、录屏、鼠标、键盘、摄像头、麦克风。
- omniBase：图像、音频、视频生成和转换。
- searchBase：搜索、抓取、事实锚定。
- skillBase：skill 生成、迭代、管理、删除、搜索、总结。

`officeBase` 不再作为后续 baseTool 完成目标推进。文档、表格、演示和 PDF 这类 Office 能力应迁移到 TAP 的高级工具系统中承接；baseTools 只保留 Agent 成立所需的底层原语。

当前已按 baseTool 厚度推进完成的家族是 `shellBase`、`gitBase`、`mcpBase`、`codeBase`、`searchBase` 和 `skillBase`。后续 baseTool 完成目标只剩 `computeruseBase` 和 `omniBase`。

TAP 应基于这些基础原语继续构建更高级的工具治理、审批、选择、替换、组合和专业能力库。比如未来替代 CAD 画手的能力库应属于 TAP 的高级能力系统，但它仍然需要底层工具原语支持。

## 7. modelAdapter 细分

### 7.1 schema

`schema` 管 Praxis 内部稳定模型请求和事件协议。

当前包括：

- `RaxModelRequest`
- `RaxPreparedModelRequest`
- `RaxModelEvent`
- `RaxModelResponse`
- `RaxUsage`

这里的任务是让上层只面对 Praxis 自己的请求、流式事件、工具调用和 usage 统计，不直接依赖 provider 原始字段。

### 7.2 route / protocol

`route` 管端点、鉴权、transport 和请求准备；`protocol` 管 OpenAI Chat、OpenAI-compatible、Responses、Anthropic Messages、Google GenerateContent 等协议的字段转换。

这里吸收不同 SDK/API 的差异，把它们统一成 `prepare()`、`stream()`、`generate()` 三种能力。白话说，route 决定“往哪里发”，protocol 决定“怎么说话”。

### 7.3 provider / registry

`provider` 和 `registry` 管 provider 定义、模型目录、兼容性矩阵和默认路由注册。

这里负责描述一个 provider 支持哪些协议、工具调用、流式 usage、native option 白名单和 auth env 入口。自定义网关不再靠旧 customFormat 层兜底，而是注册成 provider route。

### 7.4 toolBridge

`toolBridge` 管 Praxis 工具定义和 provider tool schema 之间的转换。

它负责工具名映射、JSON schema 归一、provider tool call 回升，以及工具结果回填的最低兼容。白话说，工具系统可以保持 Praxis 语义，模型端看到的是各 provider 能理解的工具格式。

`applicationAdapter` 不应该保存 provider 私有字段。它应该通过 `RaxModelClient` 或 runtime bridge 使用模型能力。

## 8. interfaceAdapter 细分

### 8.1 basic_interfaceLayer

`basic_interfaceLayer` 定义内置正式模块接口。

包括：

- `cmpInterface`
- `mpInterface`
- `tapInterface`
- `multiagentInterface`

这些接口让官方模块以稳定方式进入 agentCore。

### 8.2 custom_interfaceLayer

`custom_interfaceLayer` 定义自定义接口的接入方式。

它需要提供：

- 自定义接口定义。
- 自定义接口管理。
- 自定义接口复用。
- 自定义接口规则约束。

所有自定义接口最终仍应受 runtime governance 和 runtime contract 约束。

## 9. runtimeImplementation 细分

### 9.1 runtime.applicationSurface

这是上层 Agent 应用使用 agentCore 的主要入口。

它需要支持：

- 构建 runtime。
- 创建 runtime。
- 返回 runtime handle。
- 提供 runtime client。
- 创建 runtime session。
- 挂载上层应用。
- 桥接应用生命周期。
- 暴露应用可见上下文。
- 提供应用事件订阅。
- 管理应用可见导出。
- 提供应用侧 sandbox。

未来开发者应能通过这个面真正 new 出或获取一个可用 agentCore 对象。

### 9.2 runtime.officialModuleSurface

这是 CMP、MP、TAP、multiagent 使用 agentCore 的主要入口。

它需要支持：

- CMP runtime bridge。
- MP runtime bridge。
- TAP runtime bridge。
- multiagent runtime bridge。
- 官方模块能力契约。
- 官方模块生命周期端口。
- 官方模块状态桥。
- 官方模块治理端口。
- 官方模块事件总线。

官方模块不应该绕开 runtime。它们也应该实践同一套 agentCore 使用方式。

### 9.3 runtime.governancePlane

这是 runtime 的治理总面。

它需要处理：

- 治理策略登记。
- 治理策略编译。
- 治理规则评估。
- 权限解析。
- 作用域守卫。
- 开发者契约门禁。
- 模块治理桥。
- TAP 审批治理桥。
- 治理审计。
- 治理违规报告。

治理面不是日志系统。它决定 agentCore 能不能安全地被开发者、官方模块、工具系统、模型调用和外部控制复用。

### 9.4 runtime.contractSurface

这是 runtime 的契约面。

它需要定义：

- 公共契约。
- 内部契约。
- 调用契约。
- 能力契约。
- 事件契约。
- 状态契约。
- 错误契约。
- 扩展契约。

后续实现应先从这里长类型，不要先写散乱实现再反推接口。

### 9.5 runtime.invocationMethod

这是 runtime 的统一调用方法层。

它需要承托：

- Agent 调用。
- 工具调用。
- 模型调用。
- 接口调用。
- 流式调用。
- 批量调用。
- 调用信封。
- 调用路由。
- 调用结果面。

所有上层调用都应该先进入 invocationMethod，再经过治理和对应 runtime surface。

### 9.6 runtime.execEngine / runtime.modelAdapter / runtime.interfaceAdapter

这三块是运行态绑定面。

- `runtime.execEngine` 拉起 `agent_executionEngine`。
- `runtime.modelAdapter` 拉起 `agent_modelAdapter`。
- `runtime.interfaceAdapter` 拉起 `agent_interfaceAdapter`。

它们不应该变成新的业务系统，而应该负责绑定、桥接、状态一致性、生命周期和运行时调用接入。

### 9.7 runtime.behaviorExposure

行为暴露面用于让外部知道 Agent 正在做什么。

它应暴露行为事件、行为 trace、观察端口和行为 runtime surface。

### 9.8 runtime.capabilityExposure

能力暴露面用于让外部知道当前 Agent 有哪些能力、哪些能力可用、能力契约是什么。

它应服务上层应用、官方模块和管理面。

### 9.9 runtime.modeExposure

模式暴露面用于管理 runtime 的运行模式。

例如 normal、debug、safe、recovery、maintenance 等模式以后都可以在这里表达。

### 9.10 runtime.externalControl

外部调控面用于承接外部控制请求。

它需要接收、守卫、审计外部控制命令，不允许外部系统直接改 runtime 内部状态。

### 9.11 runtime.managementPlane

管理面用于操作者或系统管理 runtime。

它要处理命令路由、策略门禁、资源管控、变更规划、回滚、治理桥接和访问会话。

### 9.12 runtime.inspection

运行检查面用于检查 runtime 是否健康、是否满足契约、治理是否生效、模块是否挂载、surface 是否 ready。

它是后续系统可维护性的基础。

### 9.13 runtime.debug

debug 面用于开发者诊断。

它要支持 trace、snapshot、state diff、contract probe、governance probe、module attachment probe 和 replay hook。

### 9.14 runtime.selfRepair

自修复面用于有限、受治理的故障恢复。

它需要故障分类、修复计划、修复策略、修复门禁、修复回滚、修复升级和沙盒修复。

### 9.15 runtime.adaptiveRuntime

自适应面用于 runtime 在受控范围内根据环境变化调整自己。

例如能力降级、provider fallback、资源调优、模块再平衡，都应该通过这里表达，并受治理面约束。

## 10. 关键系统链路

### 10.1 上层 Agent 应用调用链

```text
Agent application
  -> runtime.applicationSurface/agentRuntimeClient
  -> runtime.invocationMethod/agentInvocationEntrypoint
  -> runtime.governancePlane
  -> runtime.execEngine
  -> agent_executionEngine/coreLogic
  -> outputExposer / behaviorExposure / eventExposurePlane
```

### 10.2 模型调用链

```text
user input / command / tool summary / CMP material / memory material
  -> agent_executionEngine/promptPack
  -> runtime.modelAdapter/promptLoweringRuntime
  -> agent_modelAdapter/schema
  -> agent_modelAdapter/route + protocol
  -> agent_modelAdapter/provider registry + transport
  -> provider or customFormat
```

注意：`promptPack` 是上下文装配和输入包管理面，不是最终 provider payload。

### 10.3 工具调用链

```text
runtime.invocationMethod/toolInvocationEntrypoint
  -> runtime.governancePlane
  -> TAP approval bridge
  -> runtime.execEngine
  -> agent_executionEngine/basic_toolLayer/baseTools
  -> eventExposurePlane
```

### 10.4 官方模块调用链

```text
CMP / MP / TAP / multiagent
  -> runtime.officialModuleSurface
  -> officialModuleGovernancePort
  -> corresponding runtime bridge
  -> execEngine / modelAdapter / interfaceAdapter
```

## 11. 逐文件 md 文档的写作口径

你已经准备了 488 个 `.md` 文件，每个文件对应一个 `.ts` 文件。后续逐文件文档应遵循同一套结构，不要重新发明总架构。

建议每个逐文件文档至少包含：

```text
1. 文件位置
2. 文件职责
3. 需要提供的能力
4. 输入边界
5. 输出边界
6. 错误边界
7. 依赖对象
8. 被谁调用
9. 不应该做什么
10. 最小实现建议
11. 最小测试建议
```

逐文件文档应该服务后续实现，不应该写成抽象论文。

## 12. 后续实现总顺序

第一批建议从运行契约和 runtime 使用入口开始：

```text
1. runtime.contractSurface
2. runtime.applicationSurface
3. runtime.governancePlane
4. runtime.invocationMethod
5. runtime.officialModuleSurface
```

第二批接模型和上下文：

```text
6. agent_executionEngine/promptPack
7. agent_modelAdapter/schema
8. agent_modelAdapter/route + protocol
9. agent_modelAdapter/provider registry + toolBridge
10. runtime.modelAdapter
```

第三批接执行引擎：

```text
11. agent_executionEngine/coreLogic
12. agent_executionEngine/IOTransceiver
13. agent_executionEngine/basic_toolLayer
14. runtime.execEngine
```

第四批接接口、治理完善和运行质量面：

```text
15. agent_interfaceAdapter
16. runtime.interfaceAdapter
17. runtime.inspection
18. runtime.debug
19. runtime.selfRepair
20. runtime.adaptiveRuntime
```

这个顺序的原则是：先让 agentCore 能被创建、被调用、被治理，再让模型和上下文进入，再拉执行引擎，再补官方模块接口和运行质量面。

## 13. 不要做的事

后续实现时必须避免：

- 不要让 provider 字段形状反向定义 agentCore。
- 不要把 promptPack 写成简单 prompt 字符串拼接器。
- 不要把 baseTools 和 TAP 高级工具系统混成一层。
- 不要让官方模块绕过 runtime。
- 不要让上层应用直接碰 executionEngine 内部状态。
- 不要把 runtime 写成普通启动器。
- 不要把 488 个文件全部一次性填满。
- 不要把 Raxode/Raxos 产品逻辑写回 agentCore 内核。

## 14. 当前结论

当前 `agentCore` 的正确理解是：

```text
强 runtime 承托
  + 执行身体
  + 模型上游接入与统一抽象
  + 官方模块和自定义接口接入
  + 基础工具原语
  + promptPack 上下文装配
  + 治理/契约/调用/检查/debug/修复/自适应
```

它的目标不是“先写完所有文件”，而是先把每个能力位点的职责、边界和最小行为确立出来，然后逐步构建一个可 new、可调用、可观察、可治理、可被官方模块复用的 Praxis 强运行核心。
