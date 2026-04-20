# agentCore runtime `resume / recover / hydrate` 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agent-core-boot-formal-baseline-v1.md` 的继续下钻文，专门冻结 `resume / recover / hydrate` 这条恢复链路的对象定位、彼此边界，以及它们和 `boot / runtime-table / checkpoint / snapshot` 的关系。

本文只处理一件事：

- `resume / recover / hydrate` 在 Praxis 宿主里分别是什么
- 为什么三者都围绕正式运行态恢复链路展开，但三者不是同义词
- 它们和 `boot`、`runtime-table`、`checkpoint / snapshot` 的关系如何稳定下来
- 为什么第一版只冻结对象边界与关系，不冻结完整恢复算法、完整 reconciliation 规则或最终快照 schema

本文不重复宿主总纲，也不重复 `runtime-table`、`compile / checker / exporter`、`boot` 各自已经冻结的上层定义。

本文明确不冻结以下内容：

- 完整恢复算法
- reconciliation 规则表
- 最终 checkpoint / snapshot schema
- hydrate 的对象图细节
- resume 的调度策略
- 恢复后的重启顺序
- 任何 JSON 字段名、完整 DSL 关键字或最终序列化格式

第一版的目标不是一次性定义完整恢复引擎，而是先把恢复链路里这三个动作的正式边界固定下来。

## 2. 三者不是同义词

`resume / recover / hydrate` 都和“让系统重新回到可继续运行状态”有关，但它们处理的不是同一个问题。

### 2.1 `resume`

`resume` 更偏“从已有运行过程继续下去”。

白话讲，它面对的前提通常是：运行过程本来就在，只是暂停了、挂起了、等待人类输入了，或者某些可继续对象已经被保留下来了，现在要把这条过程继续往前推。

因此，`resume` 第一版冻结的核心是：

- 它处理的是“已有过程的续接”
- 它关注的是“如何继续”，不是“如何从零找回”
- 它可以依赖恢复出来的状态，但不等于恢复本体

### 2.2 `recover`

`recover` 更偏“从持久化状态、快照或故障后遗状态里找回可用状态”。

它处理的问题是：系统原来的运行对象可能已经丢了、断了、崩了，或者只剩下一些持久化记录，现在要从这些剩余材料里把一份可继续使用的正式状态找回来。

因此，`recover` 第一版冻结的核心是：

- 它处理的是“怎么找回”
- 它面向 checkpoint、snapshot、journal、故障后遗状态这类恢复材料
- 它的目标是得到“可继续运行的正式状态基础”，而不是直接替代 boot

### 2.3 `hydrate`

`hydrate` 更偏“把恢复出来的状态重新灌回运行对象”。

它关注的不是“有没有找回来”，而是“找回来的这些状态，如何重新进入真正运行中的对象、容器、gateway、store 或 runtime 实例”。

因此，`hydrate` 第一版冻结的核心是：

- 它处理的是“如何灌回运行对象”
- 它通常发生在 recover 之后或之中
- 它不是最终运行态本身，而是从恢复结果走向运行态的一类正式动作

### 2.4 三者的最小关系

可以先把三者理解成下面这种常见关系：

```text
checkpoint / snapshot / journal / 持久化残留
  -> recover
  -> 可用状态基础
  -> hydrate
  -> 重新进入运行对象

已有挂起过程 / 已保留会话 / 可续接 envelope
  -> resume
  -> 继续推进运行过程
```

这张图不是完整算法，也不是唯一固定顺序，只是第一版要冻结的对象分工：

- `recover` 偏找回
- `hydrate` 偏灌回
- `resume` 偏续接

## 3. 与 `boot` 的关系

### 3.1 有关系，但不是等号

`resume / recover / hydrate` 都和 `boot` 有关系，但三者都不能直接等同于 `boot`。

`boot` 在上位文档里已经被固定成：

- `runtime-table` 的下游消费方
- 负责把正式装配结果变成真正运行中的 `agentCore runtime`

而本文三者处理的是恢复链路问题，不是重新定义启动本体。

### 3.2 `resume` 不等于 `boot`

`resume` 可能发生在系统已经 boot 过之后。

它解决的是已有运行过程如何继续往前推，而不是“如何把正式装配结果第一次启动成运行态”。某些实现里，resume 过程可能会触发一段重新进入运行态的动作，但这不意味着 `boot = resume`。

### 3.3 `recover` 不等于 `boot`

`recover` 解决的是“怎么从残留状态里找回可用状态”。

恢复之后，系统可能还需要重新进入运行态，但这个“进入运行态”的动作仍然属于 boot 或 boot 邻接动作，而不是 recover 本身的定义。

### 3.4 `hydrate` 不等于 `boot`

`hydrate` 是把恢复出的状态灌回运行对象。

这件事可能是 boot 邻域里的一个关键动作，但它仍然不是 boot 的本体。第一版只承认：boot 可能依赖 hydrate 型动作；不承认“boot 的定义就是 hydrate”。

## 4. 与 `runtime-table` 的关系

### 4.1 `runtime-table` 仍是正式装配结果

`runtime-table` 在上位文档里已经冻结为正式装配产物、一等产物、运行态中心对象。

本文直接承接这个结论：

- `runtime-table` 是正式装配结果
- 它不是恢复链路的临时替代品
- 它不是 checkpoint / snapshot 的别名

### 4.2 恢复链路可能依赖或重建与之兼容的正式结果

恢复链路关心的是：系统如何回到“可继续运行的正式状态”。

这意味着它有两种合理方向：

- 依赖已有 `runtime-table` 对应的正式装配结果继续恢复
- 在必要时重建与既有 `runtime-table` 兼容的运行态落点

但第一版只冻结方向，不冻结具体做法。

### 4.3 恢复不是重新定义 `runtime-table`

恢复链路不能把自己写成 `runtime-table` 的重新定义器。

也就是说：

- `recover` 不是重新发明一份新 `runtime-table`
- `hydrate` 不是把 snapshot 直接冒充成 `runtime-table`
- `resume` 不是绕开 `runtime-table` 后另起一套运行时真相

### 4.4 恢复不是偷换成编译动作

恢复链路也不能把自己偷换成 `compile`。

`compile` 在上位文档里已经固定成：把上游声明汇合成正式装配结果。恢复链路关注的是“如何从已存在的运行态残留里回到正式状态”，不是重新回到声明输入层再走一遍声明编译。

白话讲：

- `compile` 解决“如何形成正式装配结果”
- 恢复链路解决“正式运行态断了以后，如何回到可继续运行的正式状态”

## 5. 与 `checkpoint / snapshot` 的关系

### 5.1 `checkpoint / snapshot` 是恢复材料，不是恢复本身

`checkpoint / snapshot` 更像恢复链路里的材料层。

它们回答的是：

- 系统留下了什么
- 哪些运行态片段被持久化了
- 哪些对象还能被读回

而不是直接回答：

- 怎么找回
- 怎么灌回
- 怎么继续运行

### 5.2 `recover` 面向材料层

在三者里，`recover` 与 checkpoint / snapshot 的关系最直接。

它会读取、整理、核对这些恢复材料，并产出一份“可继续使用的状态基础”。但本文不把任何一个现有 checkpoint 字段或 snapshot 字段直接升格成新宿主标准。

### 5.3 `hydrate` 面向恢复结果，而不是原始快照文件

`hydrate` 更应该面向恢复后的结构化结果，而不是直接面向原始持久化壳。

也就是说，它处理的是“已经被 recover 整理过、确认可用的状态”，再把这些状态灌入 runtime object、gateway、store 或 session 容器中。

### 5.4 `resume` 可以利用 checkpoint / snapshot 产出的恢复基础

`resume` 本身不一定直接读取 checkpoint / snapshot，但它完全可能依赖恢复链路已经找回并灌回的状态基础，然后继续推进原来的运行过程。

因此：

- `checkpoint / snapshot` 更偏材料层
- `recover` 更偏找回层
- `hydrate` 更偏灌回层
- `resume` 更偏续接层

## 6. 恢复链路关注什么

恢复链路第一版关注的是：

- 如何回到可继续运行的正式状态
- 如何保证这份状态仍然和宿主正式边界兼容
- 如何把恢复动作和启动动作区分开
- 如何把找回、灌回、续接这三类动作区分开

它不关注：

- 重新走一遍完整声明输入层
- 重新定义 PromptPack、能力系统、ModelCarrier、InterfacePack 的总规则
- 把某个旧系统快照字段直接宣布成未来标准

也就是说，恢复链路不是另一条“重新声明 agentCore”的入口，而是一条“把正式运行态找回来并续上”的下游子系统链路。

## 7. 现实锚点

本文只把现有仓库里的实现形状当作现实锚点，用来说明恢复链路不是拍脑袋概念；这些锚点不能反向绑死未来标准字段。

### 7.1 `src/agent_core/runtime.ts`

`src/agent_core/runtime.ts` 里已经能看到明显分开的现实路径：

- `recoverTapRuntimeSnapshot(runId)` 先从 `CheckpointStore.recoverRun(...)` 读回恢复结果，再抽取 TAP runtime snapshot
- `recoverAndHydrateTapRuntime(runId)` 会在 recover 之后继续调用 `hydrateRecoveredTapRuntimeSnapshot(...)`
- `continueRecoveredTapRuntime(runId)` 则继续往下处理 replay backlog、resumable session 和 envelope
- `recoverCmpRuntimeSnapshot(snapshot)` 会先清空并重建当前 CMP runtime 内部容器，再基于 `hydrateCmpRuntimeSnapshotWithReconciliation(...)` 产出 hydrated state 和 reconciliation summary

这些路径说明，当前仓库里已经天然存在：

- recover
- hydrate
- continue / resume

这样的现实分层。

### 7.2 `src/agent_core/checkpoint/*`

checkpoint 子系统也已经给了恢复链路一个很清楚的现实材料层：

- `CheckpointRecoveryResult` 会同时带出 `state`、`run`、`poolRuntimeSnapshots`、`cmpRuntimeSnapshot`、`replayedEvents`、`resumeCursor`
- `recoverFromCheckpoint(...)` 说明恢复不是简单读一个快照文件，而是“checkpoint + journal replay + base state” 的组合结果
- `createPoolRuntimeCheckpointSnapshot(...)` 说明 snapshot 本身承载的是运行态切片，而不是未来标准 runtime 对象本体

这支持本文的判断：`checkpoint / snapshot` 是恢复材料层，不是恢复动作本身。

### 7.3 `src/agent_core/cmp-runtime/runtime-recovery.ts`

CMP 这边已经把 hydrate 和 reconciliation 分成了明确对象：

- `hydrateCmpRuntimeSnapshot(...)` 负责把 snapshot 规整并灌入一批运行态 map / record 容器
- `hydrateCmpRuntimeSnapshotWithReconciliation(...)` 在 hydrate 结果之上，再补 reconciliation record 与 summary

这说明恢复链路不只是“读回”，还包含“对齐”和“找回后能否成立”的进一步判断。

### 7.4 `src/agent_core/cmp-runtime/recovery-reconciliation.ts`

`recovery-reconciliation.ts` 进一步说明：

- 恢复之后可能存在 `aligned / degraded / snapshot_only / infra_only` 等状态差异
- 恢复链路里可能需要给出 `hydrate_from_snapshot / hydrate_from_infra / reconcile_snapshot_and_infra` 这类建议动作

这些现实锚点足够证明：恢复之后往往还会遇到“是否对齐、怎么对齐”的问题域，这不是拍脑袋概念。  
但本文仍然只把 `reconciliation` 视为恢复后的对齐问题域，不把它写成 `resume / recover / hydrate` 三者本体，也不把这些 status、reason、action 的字段名直接冻结成未来标准。

### 7.5 `src/agent_core/ta-pool-runtime/runtime-recovery.ts`

TAP 这边也已经给出另一种形状：

- `serializeTapRuntimeSnapshot(...)` 和 `serializePoolRuntimeSnapshots(...)` 说明 snapshot 材料层和运行态对象层是分开的
- `hydrateTapRuntimeSnapshot(...)` 负责把 snapshot 重新组织成 human gates、replays、activation attempts、resume envelopes、reviewer snapshots、tma sessions 等运行态容器

这说明 hydrate 并不是一个空词，而是“把恢复材料重新灌回可操作对象集合”的正式动作。

## 8. 与前面九份文档的分工

这份文档的分工很窄，只处理恢复链路边界，不替代前面的九份基线文：

- `agent-core-host-design-baseline-v1.md` 管宿主总纲
- `agent-core-spec-class-declaration-model-v1.md` 管 `Spec / Class`
- `agent-core-promptpack-semantics-and-provider-carrier-mapping-baseline-v1.md` 管 `PromptPack`
- `agent-core-capability-name-mapping-and-width-strategy-baseline-v1.md` 管能力系统
- `agent-core-modelcarrier-formal-baseline-v1.md` 管 `ModelCarrier`
- `agent-core-runtime-table-formal-baseline-v1.md` 管 `runtime-table` 本体
- `agent-core-interfacepack-formal-baseline-v1.md` 管 `InterfacePack`
- `agent-core-runtime-table-compile-checker-exporter-formal-baseline-v1.md` 管 `compile / checker / exporter`
- `agent-core-boot-formal-baseline-v1.md` 管 `boot`

而本文只负责继续回答：

- `boot` 之后或附近，恢复链路里的 `resume / recover / hydrate` 各自是什么
- 它们彼此如何区分
- 它们与 `runtime-table / checkpoint / snapshot` 的关系如何稳定下来

## 9. 当前不冻结的内容

第一版只冻结对象定位、彼此边界，以及它们和 `boot / runtime-table / checkpoint / snapshot` 的关系。

本文不定义：

- 完整恢复算法
- 完整 reconciliation 规则表
- 最终 checkpoint / snapshot schema
- hydrate 的对象图细节
- resume 的调度策略
- `resume / recover / hydrate` 的完整编排顺序
- reconciliation 是否必须出现，以及它与恢复链路的最终编排关系
- 恢复后是否必须重新经过某些 checker 门禁
- 恢复后 runtime object 的最终字段结构

## 10. 结论

第一版要冻结的重点可以压缩成六点：

- `resume / recover / hydrate` 都属于正式运行态恢复链路的相关子系统，但三者不是同义词。
- `resume` 偏续接已有运行过程，`recover` 偏从持久化状态或故障残留里找回可用状态，`hydrate` 偏把恢复状态重新灌回运行对象。
- 三者都和 `boot` 有关系，但都不能直接等同于 `boot`。
- 恢复链路可能依赖或重建与 `runtime-table` 兼容的正式结果 / 运行态，但恢复不是重新定义 `runtime-table`，也不是把恢复动作偷换成编译动作。
- `checkpoint / snapshot` 是恢复材料层，不是恢复动作本身。
- 后续实现者如果要继续往下走，第一步不是先发明完整恢复状态机，而是先围绕这份基线，把“找回、灌回、续接、与 boot 的接缝”继续收紧。
