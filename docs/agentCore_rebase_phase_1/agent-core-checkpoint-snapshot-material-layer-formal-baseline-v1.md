# agentCore checkpoint / snapshot 恢复材料层正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md` 的继续下钻文，专门冻结 `checkpoint / snapshot` 这一层在 Praxis 宿主中的正式对象定位。

本文只处理一件事：

- `checkpoint / snapshot` 为什么属于恢复链路里的材料层（material layer）
- 材料层和运行对象、`runtime-table`、`recover / hydrate / resume` 分别是什么关系
- 为什么第一版只冻结对象边界与关系，不冻结最终 schema、最终序列化格式或完整恢复算法

本文不重复宿主总纲，也不重复 `runtime-table`、`boot`、`resume / recover / hydrate` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 schema
- 精确序列化格式
- 日志回放（journal replay）算法
- reconciliation 规则表
- 各类 checkpoint / snapshot 的最终枚举
- 任何 JSON 字段名
- 完整 DSL 关键字

第一版的目标不是把材料层一次性做成完整存储规范，而是先把“它是什么、不是什么、给谁用、和谁相邻”这几件事固定下来。

## 2. 材料层的定义

`checkpoint / snapshot` 在本文里都被视为恢复链路里的**材料层**。

白话讲，材料层回答的是：

- 系统留下了什么
- 哪些运行态片段能被读回
- 哪些残留材料能支撑后续恢复动作

它不直接回答：

- 怎么完成恢复
- 怎么把状态灌回运行对象
- 怎么把挂起过程继续推进

因此，材料层的核心职责不是“自己完成恢复”，而是“留下什么、能读回什么、能支撑什么恢复动作”。

### 2.1 `checkpoint` 与 `snapshot`

`checkpoint` 和 `snapshot` 在现实系统里经常紧密相邻，但第一版不要求把二者完全等同，也不要求把它们彻底统一成一个词。

本文只冻结三点：

- 二者都属于恢复材料层
- 二者都可以承接运行态的持久化残留
- 二者都可能成为 `recover` 的读入材料来源

换句话说，后续实现可以继续区分：

- 哪些材料更像“checkpoint”
- 哪些材料更像“snapshot”
- 二者之间是否还存在 journal、receipt、cursor、record 之类的辅助残留

但这些细节不影响第一版的主结论：它们都不等于恢复动作本身。

### 2.2 材料层可以很丰富

材料层不必只是一份快照文件。

从宿主角度看，材料层完全可能同时包含：

- 运行态切片
- 持久化 record
- journal 残留
- replay cursor
- pool runtime snapshots
- cmp runtime snapshot
- checked snapshot / candidate snapshot 一类与上下文历史有关的可恢复材料

第一版承认材料层可以很丰富，但不把当前仓库里任何一个具体字段名、函数名或存储结构直接升格成未来标准。

## 3. 至少区分的四层对象

这一轮必须先把下面四层分开，不然后面恢复链路会继续混乱：

### 3.1 原始运行态 / 运行对象

这是系统“正在跑”的那一层。

它包含真实的 runtime object、容器、gateway、session、store、active lines、human gates、resume envelopes、运行中的 map / record 等运行对象。

这一层不是材料层本身。

### 3.2 持久化材料层

这是 `checkpoint / snapshot / journal` 残留所在的层。

它的职责是保留、承接、表达“哪些运行态痕迹被留下来了”，供恢复链路读取。它可以引用运行对象，也可以抽取运行对象切片，但不能被直接冒充成运行对象本身。

### 3.3 `recover` 之后得到的可用状态基础

这一层已经不再是原始材料壳，而是 `recover` 在读取、整理、核对材料层后得到的**可恢复状态基础**。

它可以理解成：

- 已读回
- 已规整
- 已经具备继续进入正式运行态的基础

但它还不必然等于“已经灌回运行对象”。

### 3.4 `hydrate` 之后重新进入运行对象的状态

这一层是恢复结果已经重新灌回运行对象、容器、gateway 或 runtime 实例后的状态。

它已经重新接近真实运行态，但它的成立依赖于前面的恢复链路，不应和材料层直接画等号。

### 3.5 四层关系

可以先把这四层理解成下面这种最小分层：

```text
原始运行态 / 运行对象
  -> 留下 checkpoint / snapshot / journal 残留
  -> 形成持久化材料层
  -> recover 读取与整理
  -> 得到可用状态基础
  -> hydrate 灌回运行对象
  -> 重新进入可操作运行态
```

这不是完整算法，也不是唯一固定顺序，只是第一版必须冻结的对象分层。

## 4. 与运行对象、`runtime-table` 的边界

### 4.1 材料层不是运行对象本身

材料层可能记录运行对象，也可能抽取运行对象切片，但它不是运行对象本体。

例如：

- 某个 runtime snapshot 可以携带一批运行态切片
- 某个 checkpoint recovery result 可以携带 run、state、cursor、pool runtime snapshots

但这些材料记录不能直接被宣称为“运行对象已经成立”。

白话讲，材料层更像“留下来的件”，不是“正在工作的活体”。

### 4.2 材料层不能冒充 `runtime-table`

`runtime-table` 在上位文档里已经冻结为正式装配结果、一等产物、运行态中心对象。

材料层不能直接冒充 `runtime-table`，原因很简单：

- `runtime-table` 回答的是“宿主最终如何正式装配和启动这份 agentCore 运行态”
- 材料层回答的是“恢复链路现在手里还有哪些可读回残留材料”

两者可以发生关系，但不是一回事。

因此，第一版明确排除下面两种混写：

- 把 `checkpoint / snapshot` 直接写成 `runtime-table` 的别名
- 把某份恢复材料直接写成“这就是正式装配结果”

### 4.3 材料层与运行对象之间必须经过恢复动作

材料层要回到运行对象层，中间至少要经过恢复链路中的动作。

这意味着：

- 原始持久化材料不能直接被当成已经恢复好的运行对象
- 原始 snapshot / checkpoint 也不能直接冒充 hydrated state
- 是否还需要 reconciliation、校验、补齐或其他 boot 邻接动作，第一版不定义

第一版只冻结一条硬边界：**材料层到运行对象层之间必须承认存在恢复动作，不允许直接抹平。**

## 5. 与 `recover / hydrate / resume` 的关系

### 5.1 `recover` 读取和整理材料层

`recover` 是三者里与材料层关系最直接的动作。

它读取、整理、核对 `checkpoint / snapshot / journal` 残留，并产出“可用状态基础”。

因此：

- 材料层是 `recover` 的输入来源之一
- `recover` 不是材料层本身
- `recover` 的结果也不应再被退回称作“原始 snapshot”

### 5.2 `hydrate` 处理恢复后的结构化结果

`hydrate` 处理的重点不是原始材料壳，而是 `recover` 之后已经规整过、可被灌回运行对象的结构化结果。

所以：

- `hydrate` 不等于“读取快照文件”
- `hydrate` 也不等于“直接从持久化壳复活”
- 它更接近“把恢复结果重新灌入运行对象体系”

### 5.3 `resume` 利用已恢复并灌回的状态继续推进

`resume` 可能利用已经恢复并灌回的状态继续推进原有过程。

它不一定直接读材料层，但它完全可能依赖：

- `recover` 已经找回的可用状态基础
- `hydrate` 已经重建出的运行对象

因此，`resume` 与材料层是隔一层或多层相邻，而不是直接等同。

### 5.4 一条最小关系图

可以把三者与材料层的关系先理解成：

```text
checkpoint / snapshot / journal 残留
  -> recover
  -> 可用状态基础
  -> hydrate
  -> 重新进入运行对象
  -> resume
  -> 继续推进已有过程
```

这张图只表达对象方向，不冻结完整编排顺序，也不宣称所有系统都必须严格按单线顺序运行。

## 6. 现实锚点

下面这些现实锚点只用于说明“材料层”不是拍脑袋概念；它们不能反向绑死未来标准字段。

### 6.1 `src/agent_core/checkpoint/*`

`checkpoint` 子系统已经明确说明：恢复输入不只是一个单文件快照。

例如：

- `CheckpointSnapshotData` 同时带有 `run`、`state`、`sessionHeader`、`poolRuntimeSnapshots`、`cmpRuntimeSnapshot`
- `CheckpointRecoveryResult` 同时带有 `checkpoint`、`state`、`run`、`poolRuntimeSnapshots`、`cmpRuntimeSnapshot`、`replayedEvents`、`resumeCursor`
- `recoverFromCheckpoint(...)` 说明恢复结果来自“checkpoint + journal replay + base state”的组合

这些都支持本文的判断：

- 材料层是真实存在的
- 它不是单一壳
- 它也不是恢复动作本身

### 6.2 `src/agent_core/cmp-runtime/runtime-snapshot.ts`

CMP 这边已经有非常明确的 `CmpRuntimeSnapshot` 对象。

它承载的是：

- project repos
- lineages
- events
- deltas
- active lines
- snapshot candidates
- checked snapshots
- requests
- section records
- snapshot records
- promoted projections
- package records
- context packages
- dispatch receipts
- sync events
- infra state

这说明“snapshot 作为材料层容器”在当前仓库里已经有现实形状，但本文不把 `CmpRuntimeSnapshot` 的字段原样升格为未来材料层标准 schema。

### 6.3 `src/agent_core/cmp-runtime/runtime-recovery.ts`

CMP 恢复路径已经天然区分了两件事：

- `hydrateCmpRuntimeSnapshot(...)` 把 snapshot 重新组织成运行态 map / record 容器
- `hydrateCmpRuntimeSnapshotWithReconciliation(...)` 在 hydrate 结果之上继续给出 reconciliation 结果

这正好支持本文的边界：

- snapshot 是材料
- hydrate 是动作
- reconciliation 是恢复后的对齐问题域

三者不是一回事。

### 6.4 `src/agent_core/cmp-runtime/recovery-reconciliation.ts`

`recovery-reconciliation.ts` 说明恢复之后还可能出现：

- `aligned / degraded / snapshot_only / infra_only`
- `hydrate_from_snapshot / hydrate_from_infra / reconcile_snapshot_and_infra`

这些现实锚点证明：材料层之后确实可能还会遇到对齐判断。  
但本文仍然只把这些内容视为恢复后的问题域，不把现有 status、reason、action 字段名直接冻成材料层标准。

### 6.5 `src/agent_core/ta-pool-runtime/runtime-snapshot.ts`

TAP 这边的 `TapPoolRuntimeSnapshot` 与 `PoolRuntimeSnapshots` 也给了材料层一个很清楚的现实形状。

它们承载的是：

- human gates / contexts / events
- pending replays
- activation attempts
- resume envelopes
- reviewer durable snapshot
- tool reviewer sessions
- provisioner durable snapshot
- tma sessions
- agent records

这说明材料层完全可以保留非常丰富的运行态切片，但“丰富”不等于“已经恢复完毕”。

### 6.6 `src/agent_core/ta-pool-runtime/runtime-recovery.ts`

TAP 恢复路径也已经明确展示出：

- `serializeTapRuntimeSnapshot(...)` / `serializePoolRuntimeSnapshots(...)` 负责把运行态切片稳定成可持有材料
- `hydrateTapRuntimeSnapshot(...)` / `hydratePoolRuntimeSnapshots(...)` 再把这些材料灌回运行态 map / object 结构

这进一步支持本文的关键判断：**材料层和运行对象层之间必须承认存在灌回动作，不能直接抹平。**

### 6.7 `src/agent_core/cmp-types/cmp-context.ts` 与 `cmp-object-model.ts`

这两处类型也说明，CMP 域里已经天然存在一批“更偏材料记录”的对象：

- `SnapshotCandidate`
- `CheckedSnapshot`
- `CmpSnapshotRecord`
- `CmpSectionRecord`
- `ContextEvent`
- `ContextDelta`

这些对象未必都等于宿主层的统一材料标准，但它们共同说明一件事：当前仓库早就不是只有“运行对象”一种形状，还已经存在大量围绕历史、快照、检查、记录、来源锚点的材料化对象。

本文承认这些现实形状的重要性，但不把其中某一个字段或某一种 record 直接提升为未来材料层标准。

## 7. 与前面十份文档的分工

这份文档只处理恢复链路里的材料层，不替代前面十份基线文：

- `agent-core-host-design-baseline-v1.md` 管宿主总纲
- `agent-core-spec-class-declaration-model-v1.md` 管 `Spec / Class`
- `agent-core-promptpack-semantics-and-provider-carrier-mapping-baseline-v1.md` 管 `PromptPack`
- `agent-core-capability-name-mapping-and-width-strategy-baseline-v1.md` 管能力系统
- `agent-core-modelcarrier-formal-baseline-v1.md` 管 `ModelCarrier`
- `agent-core-runtime-table-formal-baseline-v1.md` 管 `runtime-table`
- `agent-core-interfacepack-formal-baseline-v1.md` 管 `InterfacePack`
- `agent-core-runtime-table-compile-checker-exporter-formal-baseline-v1.md` 管 `compile / checker / exporter`
- `agent-core-boot-formal-baseline-v1.md` 管 `boot`
- `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md` 管 `resume / recover / hydrate`

而本文只继续回答：

- `checkpoint / snapshot` 为什么被定义为恢复材料层
- 材料层与运行对象、`runtime-table`、恢复动作之间的边界是什么
- 后续如果继续下钻材料层，应围绕哪些对象问题收紧

## 8. 当前不冻结的内容

第一版只冻结材料层的对象定位、与恢复链路的关系，以及它与运行态 / 装配结果的边界。

本文不定义：

- 最终 schema
- 精确序列化格式
- 日志回放算法
- reconciliation 规则表
- 各类 snapshot / checkpoint 的最终枚举
- journal / receipt / cursor 的最终统一模型
- 材料层与存储后端的最终分层
- hydrate 后运行对象图的最终结构

## 9. 结论

第一版需要固定下来的重点可以压缩成八点：

- `checkpoint / snapshot` 属于恢复链路里的材料层，不是恢复动作本身。
- 至少要区分四层：原始运行态 / 运行对象、持久化材料层、`recover` 后的可用状态基础、`hydrate` 后重新进入运行对象的状态。
- 材料层的职责是“留下什么、能读回什么、能支撑什么恢复动作”，不是“自己完成恢复”。
- `checkpoint` 和 `snapshot` 有关系，但第一版不要求完全等同或完全统一；重点是都属于恢复材料层。
- 材料层不能冒充 `runtime-table`，也不能冒充运行对象本身。
- `recover` 读取整理材料层，`hydrate` 处理恢复后的结构化结果，`resume` 可能利用已恢复并灌回的状态继续推进过程。
- 材料层可以很丰富，但不能把现有仓库某个字段名或函数名直接升格成未来标准。
- 后续实现者如果要继续往下走，第一步不是先发明完整恢复 schema，而是先围绕这份基线，把“材料层留下什么、恢复链路读什么、和运行态之间如何切层”继续收紧。
