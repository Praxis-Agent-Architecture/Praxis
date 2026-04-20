# agentCore runtime-table compile / checker / exporter 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agent-core-runtime-table-formal-baseline-v1.md` 的继续下钻文，专门冻结 `runtime-table` 周边 `compile / checker / exporter` 三个子系统的职责边界与相互关系。

本文不重复宿主总纲，也不重复 `Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack / runtime-table` 各自已经冻结的上层定义。本文只处理一件事：`runtime-table` 这份正式装配结果，应该如何被编译出来、被检查、被导出，并继续交给下游消费。

本文要回答的是：

- 这条子系统链路为什么必须围绕 `runtime-table` 展开
- `compile`、`checker`、`exporter` 三者分别负责什么
- 它们彼此是什么关系，和 `runtime-table` 是什么关系
- 为什么第一版只冻结职责边界，不冻结完整步骤、完整规则表、完整导出格式或最终 schema

本文明确不冻结以下内容：

- 完整编译步骤
- 完整 checker 规则表
- exporter 的最终格式
- `runtime-table` 的最终字段 schema
- 任何 DSL 关键字的完整集合
- 任何 JSON 字段名的最终命名

## 2. 三者职责

### 2.1 compile

`compile` 的职责，是把上游声明块汇合成正式装配结果，也就是 `runtime-table`。

这里的 “compile” 只表示编译方向，不表示把整个 DSL parser、模板引擎、文本拼接器或全部语法处理器都塞进这一层。上游可以有解析、归一、展开、引用解析、选择计算等前置动作，但本文冻结的核心只有一件事：`compile` 负责把已经成立的声明输入，收束成可检查、可导出、可启动的正式结果。

换句话说：

- `compile` 负责“汇合成表”
- `compile` 不负责“直接执行运行时”
- `compile` 也不等于“整套 DSL 解析器本体”

### 2.2 checker

`checker` 的职责，是判断这份装配结果能不能成立，边界是否对得上，是否存在越界或缺口。

它检查的对象不是零散片段，而是编译后的正式结果。它要回答的不是“某一块声明写得漂不漂亮”，而是“这份装配结果作为一个正式对象，能不能被宿主接受、能不能被下游消费、有没有断裂或越界”。

因此，`checker` 不是 lint 杂项集合，也不是风格校对器。它可以吸收若干校验维度，但第一版冻结的重点是：

- 结果是否完整
- 上游输入是否正确汇合
- 选择面、开放面、承载面是否彼此对得上
- 是否存在缺口、冲突、越界、错误引用

### 2.3 exporter

`exporter` 的职责，是把正式装配结果交给框架内部或高级用户做审查、诊断、对齐。

它导出的对象应当是正式结果本身，而不是任意日志回放、调试打印、运行时噪声或临时变量 dump。`exporter` 的存在目的，是让 `runtime-table` 变得可见、可解释、可复核，而不是把系统退化成日志打印器。

因此，`exporter` 不是：

- 任意日志 dump
- 任意调试 trace 输出
- 把所有内部状态原样吐给外部

它只负责围绕正式装配结果做受控导出。

## 3. 围绕 runtime-table 的链路

这条链路的中心对象只有一个：`runtime-table`。

它不是 `compile`、`checker`、`exporter` 三者中的任何一个，也不是它们的副产物总称。更准确地说，三者都是围绕它工作的子系统。

可以把这条链路理解成下面的顺序：

```text
Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack
  -> compile
  -> runtime-table
  -> checker
  -> exporter
  -> boot
```

这里的 `boot` 只作为下游消费方出现，本文不定义 boot 自身。

### 3.1 上游先形成输入

在进入 `compile` 之前，上游已经分别形成自己的语义输入：

- `Spec / Class` 提供声明输入与复用组织
- `PromptPack` 提供提示语义块
- 能力系统提供能力名、映射表与宽度策略
- `ModelCarrier` 提供承载面分类与路径位阶
- `InterfacePack` 提供对外开放面

这些东西不是先被 `runtime-table` 反向发明出来，而是先各自成立，再进入汇合阶段。

### 3.2 compile 汇合成 runtime-table

`compile` 在这条链里承担“把散开的上游结果汇成正式装配结果”的工作。

这意味着它的关注点是汇合、展开、选择、对齐、收束，而不是直接启动运行态。运行态是否启动、如何启动，是 `runtime-table` 下游的事情。

### 3.3 checker 只检查 runtime-table

`checker` 的检查对象是 `runtime-table` 本身。

它要判断的是这份装配结果是否成立，而不是重新审判所有上游声明是否写得合理。上游声明当然可能也要有自己的局部验证，但那不等于这里的 checker。

### 3.4 exporter 只导出 runtime-table

`exporter` 导出的对象也是 `runtime-table` 本身。

它可以向内部审查者、高级用户、诊断流程或对齐流程提供视图，但它的中心仍然是正式装配结果，而不是临时过程数据。

### 3.5 boot 消费 runtime-table

`boot` 作为下游消费方，读取的是已经成立的 `runtime-table`。

本文只冻结这一点：boot 消费正式结果，不重新把上游声明当作唯一真相。至于 boot 的内部算法、状态机和启动顺序，本文不定义。

## 4. 与前面七份文档的分工

这份文档不替代前面七份基线文，而是把它们收束到运行态装配结果的工作线上。

- `agent-core-host-design-baseline-v1.md` 冻结宿主总纲与中心对象位阶，本文不重复那一层。
- `agent-core-spec-class-declaration-model-v1.md` 冻结声明与复用模型，本文把它们当作 `compile` 的上游输入。
- `agent-core-promptpack-semantics-and-provider-carrier-mapping-baseline-v1.md` 冻结提示语义层，本文把它们当作需要汇入 `runtime-table` 的一部分。
- `agent-core-capability-name-mapping-and-width-strategy-baseline-v1.md` 冻结能力名、映射表与宽度策略，本文只承认它们会进入编译结果，不重写其规则。
- `agent-core-modelcarrier-formal-baseline-v1.md` 冻结承载面与 surface 分类，本文只承认编译结果需要保留这些落点。
- `agent-core-interfacepack-formal-baseline-v1.md` 冻结对外前门与接入面，本文只承认这些开放结果会进入 `runtime-table`。
- `agent-core-runtime-table-formal-baseline-v1.md` 冻结 `runtime-table` 的对象定位、产物边界、检查用途与导出用途，本文只继续下钻它周围的 `compile / checker / exporter` 职责边界。

因此，这份文档的定位很窄：不再谈“上游分别是什么”，而是谈“上游如何被汇进表、如何被验表、如何被导表”。

## 5. 现实锚点

本文只把现有仓库里的实现形状当作现实锚点，不把它们直接升级成新标准的最终 schema。

### 5.1 source -> normalized -> compiled

`src/agent_core/goal/` 里已经有一条清晰的三段式路径：

- `createGoalSource` 先把输入收成源层对象
- `normalizeGoal` 再把源层整理成规范化对象
- `compileGoal` 最后把规范化对象编译成 `GoalFrameCompiled`

对应的类型定义也已经把这三层拆开：

- `GoalFrameSource`
- `GoalFrameNormalized`
- `GoalFrameCompiled`

这说明“编译后会有正式结果”不是拍脑袋概念，而是仓库里已经存在的真实结构。

### 5.2 compiled -> run

`src/agent_core/runtime.ts` 里，`createCompiledGoal(source)` 会先调用 `normalizeGoal`，再调用 `compileGoal`，然后 `createRunFromSource(input)` 把编译后的 `goal` 放进运行态。

`src/agent_core/types/kernel-run.ts` 里的 `RunRecord.goal` 也说明运行态持有的是编译后的目标，而不是原始输入。

这条现实路径支持本文的判断：`compile` 产出的不是临时变量，而是可进入运行态的正式结果。

### 5.3 snapshot / checker / exporter 的现实形状

`src/agent_core/runtime.ts` 里还能看到另一组现实锚点：

- `createTapCheckpointSnapshot` 会把 `run`、state、session header、pool runtime snapshots、`cmpRuntimeSnapshot` 汇总成快照
- `writeTapDurableCheckpoint` 会先写 fast checkpoint，再写 durable checkpoint
- `createCmpRuntimeSnapshot` 会把 `CheckedSnapshot`、snapshot record、projection、runtime package 等对象汇总出来
- `getCmpCheckedSnapshot`、`listCmpCheckedSnapshots`、`resolveCheckedSnapshot` 提供了围绕 checked snapshot 的查询与检查入口
- `materializeContextPackage` 会以 `CheckedSnapshot` 为输入，继续生成 runtime projection 与 context package

这些形状说明，仓库里已经存在“候选对象、检查结果、导出/查询面、下游物化面”这样的现实分层。

本文不把这些现有字段直接绑定为未来标准字段，但可以据此确认：`checker` 和 `exporter` 并不是抽象空词，它们在仓库里已经有可观察的现实轮廓。

## 6. 当前不冻结的内容

第一版只冻结职责边界和关系，不冻结完整机制。

本文不定义：

- `compile` 的完整展开步骤
- `checker` 的完整规则表
- `exporter` 的最终输出格式
- `runtime-table` 的最终 schema
- 是否引入中间 IR
- 是否存在多种 exporter 后端
- 是否存在多种 checker 视图
- 具体 DSL 关键字和具体 JSON 字段名

也就是说，本文只确认以下结论已经成立：

- `compile` 汇合声明块，形成 `runtime-table`
- `checker` 检查 `runtime-table` 能否成立
- `exporter` 导出 `runtime-table` 给内部或高级用户审查
- 三者都不是 `runtime-table` 本身，而是围绕它工作的子系统
- `boot` 只作为 `runtime-table` 的下游消费方出现

## 7. 结论

第一版要冻结的，不是一个完整编译器，也不是一张完整规则表，而是这条链路的职责边界：

- `compile` 负责把上游声明汇合成正式装配结果
- `checker` 负责判断装配结果能否成立
- `exporter` 负责把正式结果导出给内部或高级用户
- `runtime-table` 是三者共同围绕的中心对象
- `boot` 是下游消费方，不在本文定义范围内

这样冻结之后，后续实现即使在细节上变化，也不会把职责边界、对象关系和 `runtime-table` 的中心地位弄乱。
