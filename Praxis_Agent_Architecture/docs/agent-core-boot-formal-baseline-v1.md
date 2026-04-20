# agentCore boot 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agent-core-runtime-table-formal-baseline-v1.md` 与 `Praxis_Agent_Architecture/docs/agent-core-runtime-table-compile-checker-exporter-formal-baseline-v1.md` 的继续下钻文，专门冻结 `boot` 这一正式运行态启动子系统的对象定位、输入输出边界与下游关系。

本文要回答的是：

- `boot` 在 Praxis 宿主里到底是什么
- 为什么 `boot` 不是一个泛指“开始运行”的口语词，而是正式运行态启动子系统
- `boot` 为什么必须消费已经成立的 `runtime-table`
- `boot` 和 `compile / checker / exporter / runtime-table` 之间的关系应该怎样稳定下来
- `boot` 和 `resume / recover / hydrate / bootstrapProjectInfra` 这些现实路径之间应该如何区分

本文不重复宿主总纲，也不重复 `Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack / runtime-table` 各自已经冻结的上层定义。

本文明确不冻结以下内容：

- 启动顺序算法
- 内部状态机
- 恢复后的重启细节
- 并发模型
- 最终 runtime 对象字段
- 具体 receipt / snapshot / record 的完整 schema
- 任何 DSL 关键字、JSON 字段名或具体序列化格式

第一版的目标不是一次性定义完整启动引擎，而是先把 `boot` 这个子系统的对象边界固定下来。

## 2. `boot` 的定义

`boot` 不是“随便开始跑起来”的通俗动词。

在本文里，`boot` 指的是正式运行态启动子系统：它消费已经成立的 `runtime-table`，并把这份正式装配结果变成真正运行中的 `agentCore runtime`。

白话讲：

- `compile` 负责把声明汇成表
- `checker` 负责确认这张表成立
- `exporter` 负责把表导出来给内部或高级用户看
- `boot` 负责把这张表真的启动成运行态

因此，`boot` 不是上游声明层，也不是编译层本身，更不是把运行态再解释一遍的语义层。

## 3. `boot` 的职责

### 3.1 消费正式装配结果

`boot` 的首要职责，是消费已经成立的 `runtime-table`。

它读取的不是零散声明，也不是上游语义本体，而是编译后、可检查、可导出的正式结果。这个正式结果里至少会包含：

- 模型 / carrier 选择结果
- 能力解析结果
- PromptPack 装配结果引用
- 接口开放结果
- 接入位点或启动落点
- 宽度、约束、默认策略的生效结果

本文不写死这些结果的完整字段，也不冻结它们的最终 schema，只冻结 `boot` 需要消费它们这一事实。

### 3.2 进入真正的运行态

`boot` 的输出不是一份新的声明，不是新的编译结果，而是“已经运行起来的 `agentCore runtime`”。

换句话说，`boot` 的任务不是生成另一份说明文，而是把正式装配结果变成可执行、可交互、可继续承接后续请求的运行态。

### 3.3 不重新做上游工作

`boot` 不重新做这些事：

- 不重新做 `compile`
- 不重新做 `checker`
- 不重新解释 `PromptPack`
- 不重新解释能力系统
- 不重新解释 `ModelCarrier`
- 不重新解释 `InterfacePack`

`boot` 可以依赖这些上游成果，但不能把它们重新定义成自己的内部真相。

### 3.4 不是运行时的任意初始化口

`boot` 也不是泛泛意义上的“初始化一下就能跑”。

它是正式运行态启动子系统，所以它的输入必须能说明“这份运行态如何被装配”，它的输出必须能说明“这份运行态已经成立”。如果没有 `runtime-table` 的正式结果，`boot` 不能凭空把一份运行态补出来并声称那就是标准行为。

## 4. 输入与输出边界

### 4.1 输入边界

`boot` 的核心输入是 `runtime-table`。

除此之外，真实系统中可能还需要一些最小必要上下文，例如：

- 当前 workspace 或宿主上下文
- 运行环境里的外部句柄
- 与启动有关的持久化状态
- 与恢复有关的最小上下文片段

但本文不把这些外围上下文写成标准 schema，也不把它们升级成 boot 的定义本体。它们只是现实启动所需的辅助条件，而不是 boot 的上位对象。

### 4.2 输出边界

`boot` 的输出是正式运行中的 `agentCore runtime`。

这个输出应该能够被后续请求继续使用，能够承接运行时调用、能力分发、接口开放和状态推进。它不是一次性启动日志，也不是临时过渡对象。

### 4.3 中间过程不冻结

在输入到输出之间，可能存在若干内部中间步骤，例如：

- 运行态对象装配
- 依赖实例初始化
- 接口前门挂接
- 运行时快照恢复
- 外部模块接入

但本文不冻结这些中间步骤的顺序、数量和实现方式。第一版只冻结“输入是什么、输出是什么、它们之间属于 boot”。

## 5. 与 `runtime-table`、`compile`、`checker`、`exporter` 的关系

### 5.1 与 `runtime-table` 的关系

`boot` 是 `runtime-table` 的下游消费方。

这句话是第一版最重要的边界之一：`boot` 不是上游声明层，不是编译层，也不是把 `runtime-table` 再倒推回去的反向解释器。它只消费已经成立的正式结果。

因此，`runtime-table` 是 `boot` 的对象来源，`boot` 是 `runtime-table` 的运行态落点。

### 5.2 与 `compile` 的关系

`compile` 负责把上游声明汇合成 `runtime-table`；`boot` 负责消费这份 `runtime-table` 并启动运行态。

两者之间有先后关系，但不是同一个职责：

- `compile` 解决“如何形成正式装配结果”
- `boot` 解决“如何把正式装配结果变成运行态”

本文不把 `boot` 重新写成 `compile` 的某个阶段，也不把 `compile` 直接等同于启动逻辑。

### 5.3 与 `checker` 的关系

`checker` 负责判断这份装配结果能不能成立；`boot` 负责消费已经成立的结果。

第一版只冻结到这里，不再往下规定：

- `boot` 是否必须等待 `checker` 通过
- `boot` 是否允许旁路某些检查结果
- `checker` 与 `boot` 之间是否存在更细的状态门禁

这些都属于后续实现设计，而不是本文要冻结的对象边界。

### 5.4 与 `exporter` 的关系

`exporter` 负责导出正式装配结果给内部或高级用户审查；`boot` 负责消费正式装配结果并启动运行态。

因此，`exporter` 不是 `boot` 的必经前置步骤，`boot` 也不是 `exporter` 的延伸输出。

第一版只冻结这点，不冻结是否存在某些调试流程会先导出再启动，也不冻结具体工具链顺序。

## 6. 与 `resume / recover / hydrate / bootstrapProjectInfra` 的关系

### 6.1 这些路径是真实路径，但不能反向升格为标准

当前仓库里已经能看到一批和启动、恢复、重入、基础设施拉起相关的现实路径，例如：

- `createRuntime`
- `createAgentCoreRuntime`
- `createRunFromSource`
- `bootstrapCmpProjectInfra`
- `recoverCmpRuntimeSnapshot`
- `hydrateRecoveredTapRuntimeSnapshot`
- `resumeTmaSession`
- `recoverAndHydrateTapRuntime`

这些路径说明，仓库里确实存在围绕启动与恢复的现实分工。

但本文必须强调：这些现实路径只是锚点，不是标准本体。不能因为现有代码里有这些函数，就把它们直接提升成 boot 的冻结定义，也不能把某个现有字段形状当成未来标准的唯一答案。

### 6.2 `resume`

`resume` 表示的是“从已有运行过程继续下去”。

它关注的是续接、恢复、继续执行，而不是重新定义 boot 本体。某些系统里 `resume` 可能会触发一段重新进入运行态的过程，但那不等于 `boot` 这个概念本身被定义为 `resume`。

### 6.3 `recover`

`recover` 关注的是“从持久化状态、快照或故障后遗状态里找回可用状态”。

它和 `boot` 有关系，因为恢复后往往需要回到某种可运行状态；但它不是 `boot` 的同义词。`recover` 解决的是“怎么找回”，`boot` 解决的是“怎么把正式结果启动成运行态”。

### 6.4 `hydrate`

`hydrate` 关注的是“把恢复出来的状态重新灌回运行对象”。

它通常是恢复链路中的一个动作，但不是 `boot` 的定义核心。本文承认 `boot` 可能会依赖 hydrate 型动作来完成运行态成立，但不把 hydrate 过程本身升格为 boot 的标准定义。

### 6.5 `bootstrapProjectInfra`

`bootstrapProjectInfra` 关注的是项目基础设施、仓库、工作区或外部资源的拉起。

它和 boot 有交集，因为真正启动运行态时，常常需要基础设施先准备好。但它仍然是基础设施拉起，不是 boot 本体。本文不把项目基础设施 bootstrap 的具体流程写成 boot 的标准动作。

### 6.6 结论

这些路径都和 boot 有关系，但关系不是等号。

第一版只冻结：

- `boot` 可以与它们发生协作
- `boot` 可以在它们之后、之中或附近出现
- `boot` 不能被它们替代
- `boot` 也不能反过来把它们的当前实现细节变成标准

## 7. 现实锚点

本文把现有仓库代码当作现实锚点，只说明“为什么消费编译结果进入运行态不是拍脑袋概念”，不把这些锚点直接绑死为未来标准字段。

### 7.1 `src/agent_core/runtime.ts`

`src/agent_core/runtime.ts` 里已经能看到一条清晰路径：

- `createCompiledGoal(source)` 会先把输入整理成规范化目标，再编译成 `GoalFrameCompiled`
- `createRunFromSource(input)` 会把编译后的目标放进运行态

这说明“编译结果进入运行态”在现有仓库里不是抽象口号，而是已经存在的真实路径。

同时，这个文件里还存在若干和启动、恢复、重入相关的现实入口，例如 `bootstrapCmpProjectInfra`、`recoverCmpRuntimeSnapshot`、`recoverAndHydrateTapRuntime`、`resumeTmaSession` 等。它们说明现有运行态确实需要处理启动与恢复的组合问题。

但这些都只能证明方向成立，不能反向决定 boot 的最终标准。

### 7.2 `src/agent_core/types/kernel-run.ts`

`src/agent_core/types/kernel-run.ts` 里的 `RunRecord.goal` 持有的是 `GoalFrameCompiled`。

这说明运行态记录的不是原始输入，而是编译后的目标。它支持本文关于 boot 的判断：真正的运行态启动，消费的是正式结果，而不是未整理的上游声明。

### 7.3 `src/agent_core/live-agent-chat.ts`

`src/agent_core/live-agent-chat.ts` 里可以看到更贴近宿主现实的组合面：

- `createRuntime`
- `createAgentCoreRuntime`
- `bootstrapCmpProjectInfra`
- `recoverCmpRuntimeSnapshot`
- `createRunFromSource`

这些路径说明，当前宿主确实已经存在“runtime 构造、项目基础设施 bootstrap、恢复快照、从源创建运行”的现实组合。

但它们仍然只是实现锚点，不是 boot 基线要冻结的函数名清单。

### 7.4 `src/rax/runtime.ts`

`src/rax/runtime.ts` 体现的是 facade / runtime 组合方向。

它说明 `rax` 这层不是单纯的薄壳，而是把能力路由、兼容配置、MCP 运行态、技能运行态和 `cmp` runtime 组合成更上层门面的现实层。

这对 boot 的意义在于：boot 不是孤立单点，而是处于运行态与门面之间的正式启动层。但本文仍然不把 `rax` 的当前组合方式直接升格成 boot 的标准实现。

### 7.5 `src/agent_core/capability-types/*`

`src/agent_core/capability-types/*` 里已经能看到能力系统的现实类型：

- `CapabilityManifest`
- `CapabilityBinding`
- `CapabilityInvocationPlan`
- `CapabilityLease`
- `CapabilityResultEnvelope`
- `CapabilityPool`
- `KernelCapabilityGateway`

这些类型说明，运行态里确实已经存在能力注册、调度、执行与回传的现实结构。

它们对 boot 的支持在于：boot 启动出来的运行态，不是空壳，而是必须能够挂接能力池、网关和结果通路的正式运行对象。

## 8. 当前不冻结的内容

第一版只冻结 boot 的对象定位、输入输出边界，以及它和上游 / 下游对象的关系，不冻结以下内容：

- 启动顺序算法
- 内部状态机
- 并发模型
- 恢复后的重启细节
- `boot` 是否同步、异步或分阶段执行的最终策略
- `boot` 是否必须依赖某些辅助 bootstrap helper 的最终策略
- 最终 runtime 对象字段
- 启动 receipt / snapshot / record 的完整 schema
- `boot` 与 `resume / recover / hydrate` 的具体编排细节
- `boot` 与项目基础设施 bootstrap 的具体流程

这意味着本文不负责把实现细节一次性发明完，而是先给后续实现者一个稳定、可继续设计的边界。

## 9. 结论

`boot` 第一版的冻结重点可以压缩为五点：

- `boot` 是正式运行态启动子系统，不是泛指“开始运行”的口语词。
- `boot` 是 `runtime-table` 的下游消费方，不是上游声明层。
- `boot` 的职责是把已经成立的 `runtime-table` 变成真正运行中的 `agentCore runtime`。
- `boot` 不能重新做 `compile / checker`，也不能重新解释 `PromptPack / 能力系统 / ModelCarrier / InterfacePack` 的总规则。
- `resume / recover / hydrate / bootstrapProjectInfra` 都是现实路径和相关动作，但不能把它们当前的实现细节直接升格成 boot 的标准。

后续实现者如果要继续往下走，第一步不是先把 `boot` 变成某个具体函数名，而是先围绕这份基线，把启动边界、恢复边界和运行态边界继续收紧。
