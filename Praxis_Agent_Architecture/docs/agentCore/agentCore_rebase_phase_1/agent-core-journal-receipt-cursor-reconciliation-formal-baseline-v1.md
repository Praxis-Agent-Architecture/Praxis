# agentCore `journal / receipt / cursor / reconciliation` 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md` 的继续下钻文，专门冻结 `journal / receipt / cursor / reconciliation` 这组对象在 Praxis 宿主中的正式问题域定位。

本文只处理一件事：

- `journal / receipt / cursor / reconciliation` 分别是什么
- 为什么这四者都和恢复链路有关，但彼此不是同义词，也不属于同一层
- 它们和 `checkpoint / snapshot`、`resume / recover / hydrate`、`runtime-table`、运行对象之间的边界应该怎样稳定下来
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 schema、最终序列化格式、回放算法或对齐规则表

本文不重复宿主总纲，也不重复 `boot`、`runtime-table`、`resume / recover / hydrate`、`checkpoint / snapshot` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 schema
- 精确序列化格式
- journal replay 的最终算法
- reconciliation 规则表
- 各类 journal / receipt / cursor 的最终枚举
- 任何 JSON 字段名
- 完整 DSL 关键字
- `checkpoint / snapshot` 与这四者的最终并壳方式

第一版的目标不是一次性做出完整恢复材料规范，而是先把这四个问题域的正式边界固定下来。

## 2. 四者不是同义词

`journal / receipt / cursor / reconciliation` 都出现在恢复链路附近，但它们回答的问题并不相同。

### 2.1 `journal`

`journal` 更偏**事件/过程残留材料**。

白话讲，它回答的是：

- 过程里发生过什么
- 事件按什么顺序留下来了
- 哪些后续动作可以据此回放、追溯或继续读取

因此，`journal` 第一版冻结的核心是：

- 它属于材料层
- 它更偏事件流、过程痕迹、追加式残留
- 它不是恢复动作本身，也不是已经恢复好的状态

### 2.2 `receipt`

`receipt` 更偏**动作完成后的确认/回执材料**。

它回答的是：

- 某次动作是否做过
- 某个 dispatch、tool call、provision、bootstrap 或同步动作留下了什么确认痕迹
- 后续恢复时哪些已完成结果可以被重新承认或重新对齐

因此，`receipt` 第一版冻结的核心是：

- 它也属于材料层
- 它更偏完成确认，不等于事件流全貌
- 它不是动作本身，只是动作完成后的残留凭据

### 2.3 `cursor`

`cursor` 更偏**恢复或继续推进时的位置/进度指针材料**。

它回答的是：

- 过程推进到了哪里
- journal 或其他可读材料应从哪里继续读取
- resume 或 replay 的起点/续点大概落在哪

因此，`cursor` 第一版冻结的核心是：

- 它是位置材料，不是状态本体
- 它是过程推进的指针，不是完整事件流，也不是完整回执集合
- 它通常很轻，但对恢复和续接非常关键

### 2.4 `reconciliation`

`reconciliation` 更偏**恢复后的对齐问题域**。

它回答的是：

- 恢复出来的结果和现有 infra、snapshot、投影、运行态预期之间哪里一致、哪里不一致
- 当前更适合从 snapshot 侧补、从 infra 侧补，还是两边一起对齐
- 后续需要面对哪些差异与建议动作

因此，`reconciliation` 第一版冻结的核心是：

- 它不是材料层本体，而是恢复后的对齐问题域
- 它不是 `recover / hydrate / resume` 任何一个动作本身
- 它更像恢复之后才显影出来的一组差异、判定与建议

### 2.5 四者的最小区别

可以先把四者压缩成下面这组最小对象判断：

- `journal` 更偏过程残留
- `receipt` 更偏完成确认残留
- `cursor` 更偏位置与进度残留
- `reconciliation` 更偏恢复后的对齐问题域

第一版必须明确承认：

- 这四者不是同义词
- 它们不属于同一层
- 它们不要求和 `checkpoint / snapshot` 完全并壳
- 它们也不需要被强行写成某个单一总表

## 3. 与 `checkpoint / snapshot` 的关系

### 3.1 都在恢复材料层附近，但不是一回事

上位文档已经冻结：`checkpoint / snapshot` 属于恢复链路里的材料层。

本文继续承接这个判断，但要把边界再切细：

- `checkpoint / snapshot` 更像材料层的较大承载壳
- `journal / receipt / cursor` 更像材料层内部的不同材料问题域
- `reconciliation` 则处在恢复后的对齐问题域，不应被回缩成某种材料壳

因此，第一版不要求下面两件事：

- 不要求 `journal / receipt / cursor` 全部并进一个统一的 `checkpoint` 定义
- 不要求 `checkpoint / snapshot` 和这四者在命名或结构上完全统一

### 3.2 可以相邻，但不能互相冒充

合理的相邻关系可以存在，例如：

- checkpoint 记录某个 journal cursor
- snapshot 承载某批 receipt 或 runtime 切片
- recover 从 checkpoint / snapshot 中取出 cursor、receipt、journal 残留

但第一版必须排除这些混写：

- 把 `journal` 直接写成 `checkpoint` 的同义词
- 把 `receipt` 直接写成 `snapshot` 的别名
- 把 `cursor` 写成“只要有 snapshot 就自动等于恢复位置”
- 把 `reconciliation` 写成某个材料文件里的固定字段壳

## 4. 与运行对象、`runtime-table` 的边界

### 4.1 不等于运行对象

这四者都不能直接冒充运行对象本身。

哪怕某个 receipt、cursor 或 journal entry 可以帮助恢复运行对象，它也只是恢复材料或对齐证据，不是“运行对象已经成立”。

白话讲：

- 运行对象是“正在工作的活体”
- `journal / receipt / cursor` 更像“留下来的痕迹或指针”
- `reconciliation` 更像“恢复后发现的差异问题域”

### 4.2 不等于 `runtime-table`

`runtime-table` 在上位文档里已经冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `journal / receipt / cursor` 不是正式装配结果
- `reconciliation` 也不是正式装配结果
- 它们可以帮助恢复过程重新靠近兼容的正式运行态，但它们不能直接冒充 `runtime-table`

因此，第一版必须明确：

- 不能把 journal replay 结果直接宣称为 `runtime-table`
- 不能把某个 receipt 集合直接宣称为正式装配结果
- 不能把 cursor 写成运行态真相
- 不能把 reconciliation summary 写成宿主装配定义

## 5. 与 `resume / recover / hydrate` 的关系

### 5.1 它们服务于恢复链路，但不是恢复动作本身

这四者和恢复链路的关系，应该被稳定理解成：

- 提供材料
- 提供位置
- 提供回执
- 提供对齐信息

而不是：

- 自己就是 `recover`
- 自己就是 `hydrate`
- 自己就是 `resume`

### 5.2 `recover`

`recover` 更偏读取和整理这些问题域：

- 读取 journal 残留
- 读取 cursor 所指向的位置
- 读取 receipt 确认哪些动作可能已完成
- 读取或生成 reconciliation 所需的对齐输入

但 `recover` 本身不是这些材料。

### 5.3 `hydrate`

`hydrate` 更偏处理恢复后已经规整过的结构化结果。

这意味着：

- 它不等于 journal replay
- 它不等于读取 receipt
- 它不等于 cursor 解析
- 它也不等于 reconciliation 的判定过程

它处理的是上面这些问题域已经为恢复提供好材料之后，怎样把恢复结果重新灌回运行对象。

### 5.4 `resume`

`resume` 更偏利用已经恢复并灌回的状态继续推进已有过程。

它可能利用：

- journal 里留下的过程痕迹
- cursor 所指示的续接位置
- receipt 证明哪些动作无需重做
- reconciliation 给出的风险或建议

但 `resume` 仍然不是这些材料本身。

### 5.5 不是固定唯一顺序

第一版不把这四者写成固定唯一顺序。

例如，本文不冻结：

- 必须先 journal 再 receipt 再 cursor 再 reconciliation
- reconciliation 一定发生在 hydrate 之前还是之后
- cursor 一定只能来自 journal，还是也可来自其他恢复材料

第一版只冻结：它们分别属于不同问题域，并围绕恢复链路提供不同类型的信息。

## 6. 现实锚点

### 6.1 `src/agent_core/checkpoint/*`

当前仓库里的 checkpoint 子系统已经证明，这个问题域不是拍脑袋概念。

例如：

- `CheckpointRecoveryResult` 里已经同时出现 `replayedEvents` 与 `resumeCursor`
- `recoverFromCheckpoint(...)` 说明恢复过程会把 checkpoint、snapshot state 与 journal replay 组合起来
- `checkpoint.record.journalCursor` 说明 checkpoint 和 cursor 材料已经在现实里相邻

这些现象支持本文判断：

- `journal` 是过程残留材料
- `cursor` 是恢复或续接的位置材料
- 它们可以被 checkpoint 承接，但不等于 checkpoint 本体

但本文同时明确：

- `journalCursor`
- `replayedEvents`
- `resumeCursor`

这些当前字段名只是现实证据，不直接升格成未来标准键名。

### 6.2 `src/agent_core/journal/*`

当前仓库里已经存在独立 journal 子系统：

- `encodeJournalCursor(...)` / `decodeJournalCursor(...)`
- `AppendOnlyEventJournal`
- `readFromCursor(...)`
- `readRunEvents(...)`

这说明：

- `journal` 已经具备事件流与读取边界
- `cursor` 已经具备位置指针边界

但这些函数名和当前 `journal:<segment>:<offset>` 形状，只能证明“问题域存在”，不能直接冻结成未来宿主标准。

### 6.3 `src/agent_core/cmp-runtime/runtime-snapshot.ts`

CMP snapshot 里已经出现：

- `dispatchReceipts`
- `snapshotCandidates`
- `checkedSnapshots`
- `snapshotRecords`

这说明 receipt 与 snapshot 材料层在现实里已经相邻，但这不等于：

- 所有 receipt 都只能住在 CMP snapshot
- receipt 的未来标准一定等于当前 `DispatchReceipt`
- snapshot 必须成为 receipt 的唯一总表

### 6.4 `src/agent_core/cmp-runtime/runtime-recovery.ts`

CMP recovery 已经在恢复时把多类材料拆开：

- `dispatchReceipts` 被恢复成独立 map
- `snapshotCandidates` / `checkedSnapshots` / `snapshotRecords` 各自单列
- `hydrateCmpRuntimeSnapshotWithReconciliation(...)` 把 hydrate 与 reconciliation 分开承接

这支持本文的判断：

- `receipt` 不等于 snapshot 本体
- `reconciliation` 不是材料层本体，而是恢复后的对齐问题域

但当前 `dispatchId`、`candidateId`、`snapshotId` 这些键名，仍然只是现实证据，不直接升格成未来标准。

### 6.5 `src/agent_core/cmp-runtime/recovery-reconciliation.ts`

这个文件已经明确说明：

- 存在 `aligned / degraded / snapshot_only / infra_only`
- 存在 `hydrate_from_snapshot / hydrate_from_infra / reconcile_snapshot_and_infra`

这说明 reconciliation 在现实中已经是一个正式问题域，而不是空泛概念。

但本文仍然只冻结：

- `reconciliation` 是恢复后的对齐问题域

本文不冻结：

- 当前 status 名字
- 当前 recommendedAction 名字
- 当前 summary 字段集合

因为这些仍然只是现有实现证据，不是未来标准本体。

### 6.6 `src/agent_core/ta-pool-runtime/runtime-snapshot.ts` 与 `runtime-recovery.ts`

TAP 侧已经出现：

- `resumeEnvelopes`
- `pendingReplays`
- reviewer / provisioner durable snapshot

这说明：

- cursor 之外，恢复链路还可能有更高层的续接材料
- receipt 之外，动作确认与恢复续接也可能以 envelope 或 durable snapshot 形式存在

这进一步支持本文判断：材料层可以很丰富，不应被压成单一总表。

### 6.7 `src/agent_core/cmp-types/cmp-context.ts` 与 `cmp-object-model.ts`

这些类型文件已经存在：

- `SnapshotCandidate`
- `CheckedSnapshot`
- `CmpSnapshotRecord`
- 一批 context event / delta / request / package record

这说明当前宿主已经在把“过程痕迹、候选材料、检查后材料、对象级记录”拆成不同对象层。

它们支持本文的方向：未来材料层应继续按问题域分层，而不是把所有恢复证据揉成一个对象。

但这些类型名本身仍然只是现实锚点，不直接冻结为未来标准命名。

## 7. 当前不冻结的内容

第一版只冻结：

- `journal / receipt / cursor / reconciliation` 各自的对象定位
- 它们彼此不是同义词、不是同一层
- 它们与 `checkpoint / snapshot`、`resume / recover / hydrate`、`runtime-table`、运行对象的边界

第一版明确不冻结：

- 最终 schema
- 精确序列化格式
- journal replay 的完整算法
- reconciliation 的规则表
- 各类 journal / receipt / cursor / reconciliation 的最终枚举
- 它们是否需要统一进某个单一总表
- 它们与 `checkpoint / snapshot` 的最终并壳方案

## 8. 与前面文档的分工

前面文档已经分别冻结了：

- 宿主总纲
- `Spec / Class`
- `PromptPack`
- 能力系统
- `ModelCarrier`
- `runtime-table`
- `InterfacePack`
- `compile / checker / exporter`
- `boot`
- `resume / recover / hydrate`
- `checkpoint / snapshot` 材料层

而本文只继续下钻下面这件事：

- `journal / receipt / cursor / reconciliation` 作为更细的恢复材料与对齐问题域，应该如何被正式区分

也就是说，本文不回答：

- 完整恢复引擎怎么实现
- 具体 schema 长什么样
- replay 顺序怎么跑
- reconciliation 规则怎么定

本文只回答：

- 这四者在未来宿主里分别应该被当成什么对象问题域

## 9. 第一版结论

可以把本文的冻结结论压缩成九点：

- `journal` 是事件/过程残留材料。
- `receipt` 是动作完成后的确认/回执材料。
- `cursor` 是恢复或继续推进时的位置/进度指针材料。
- `reconciliation` 是恢复后的对齐问题域。
- 这四者彼此不是同义词，不是同一层。
- 第一版不要求这四者和 `checkpoint / snapshot` 完全并壳。
- 它们与 `resume / recover / hydrate` 的关系是“提供材料/位置/回执/对齐信息”，不是这些动作本身。
- 第一版只冻结对象定位、边界、与恢复链路的关系，不冻结最终 schema、序列化格式、回放算法、对齐规则表、最终枚举。
- 不把这四者写成固定唯一顺序，也不把它们写成某个必须存在的单一总表。
