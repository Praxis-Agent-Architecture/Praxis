# agentCore `journal replay` 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md` 的继续下钻文，专门冻结 `journal replay` 在 Praxis 宿主中的正式问题域定位。

本文只处理一件事：

- `journal replay` 在 Praxis 宿主里到底是什么
- 为什么它与 `journal`、`recover`、`hydrate`、`resume`、`checkpoint / snapshot`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么第一版只冻结 `journal replay` 的对象定位、边界与关系，不冻结最终 replay 算法、最终事件顺序规则、去重/幂等细则或 cursor 窗口细节

本文不重复宿主总纲，也不重复 `runtime-table`、`resume / recover / hydrate`、`checkpoint / snapshot`、`journal / receipt / cursor / reconciliation` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 replay 算法
- 最终事件顺序规则
- 去重/幂等细则
- replay window / batch / cursor 的算法细节
- 最终 schema
- 精确序列化格式
- 各类 replay 结果的最终枚举
- 任何 JSON 字段名
- 完整 DSL 关键字

第一版的目标不是一次性做出完整 replay engine，而是先把 `journal replay` 这个问题域从周边对象中正式切出来。

## 2. `journal replay` 是什么

`journal replay` 第一版应被理解为：**从 journal 残留材料中读取、整理、重放出可供恢复链路消费的结果或过程的问题域**。

白话讲，它更像一层“消化 journal 材料”的工作，而不是这些材料本身，也不是最终恢复动作本身。

它回答的问题更接近：

- 现在手里有哪些 journal 残留材料可以继续读
- 这些材料应从哪里开始读、读到哪里为止
- 读出来的事件或过程痕迹，怎样整理成可被恢复链路消费的 replay 结果
- replay 之后，恢复链路能拿到哪些可继续使用的输入

它不直接回答：

- `journal` 作为材料层本体到底长什么样
- `recover` 最终如何把所有恢复材料拼成完整可用状态
- `hydrate` 怎样把状态重新灌回运行对象
- `resume` 怎样让已有过程继续推进
- `runtime-table` 怎样重新成立

因此，`journal replay` 第一版冻结的核心是：

- 它是一个围绕 journal 残留材料展开的读取/整理/重放问题域
- 它可以同时表现为一个过程，或这个过程产出的 replay 结果
- 它服务恢复链路，但不能冒充整个恢复链路
- 它依赖位置材料与材料层边界，但不等于位置材料或材料层本体

## 3. `journal replay` 不等于 `journal`

### 3.1 `journal` 是材料，`journal replay` 是材料消费问题域

`journal` 更偏事件/过程残留材料本身。

`journal replay` 更偏对这些残留材料的读取、整理和重放。

这两者最小区别可以先压缩成：

- `journal` 回答“留下了什么”
- `journal replay` 回答“这些留下来的东西怎样被继续读取和重放”

### 3.2 没有 replay，`journal` 也可以成立

哪怕系统里已经存在 append-only journal、cursor、segments、run events，`journal` 这个对象也已经成立。

但这不自动意味着：

- replay 已经成立
- replay 边界已经清楚
- replay 的结果已经等于恢复后的状态

因此，`journal` 可以单独存在，`journal replay` 则是对这些材料进一步消费的问题域。

### 3.3 `journal replay` 不能反过来吞掉 `journal`

第一版必须排除下面这些混写：

- 把 `journal replay` 写成 `journal` 的别名
- 因为存在 `readFromCursor(...)` 就把读取动作直接等同为 `journal` 本体
- 把 replay 结果直接写成“这就是 journal”

白话讲，仓库里留下来的“事件日志”是材料；怎么把这些材料再读出来、整理好、重放给恢复链路，是另一层事。

## 4. `journal replay` 不等于 `recover`

### 4.1 `recover` 更大，`journal replay` 更窄

`recover` 处理的是：怎样从 checkpoint、snapshot、journal、cursor 以及其他故障后遗材料里，找回一份可继续使用的状态基础。

`journal replay` 只处理其中一小块：

- 围绕 journal 残留材料做读取
- 围绕 replay 边界做整理
- 产出可供 `recover` 消费的 replay 结果或 replay 过程产物

因此，`journal replay` 可以服务 `recover`，但不能冒充整个恢复动作。

### 4.2 `recover` 可以不用被缩成 replay

恢复链路可能还要处理：

- checkpoint 中已有的 base state
- snapshot 内已有的运行态切片
- cursor 所提供的位置材料
- receipt 或 reconciliation 邻近问题域给出的其他输入

这些都说明：`recover` 不会被 `journal replay` 一个问题域完全吞掉。

### 4.3 第一版必须排除的混写

- 把 `recover` 直接写成“把 journal replay 跑一遍”
- 把 `journal replay` 结果直接宣布为“恢复已完成”
- 把 replay 游标推进直接宣布为“正式状态已找回”

## 5. `journal replay` 不等于 `hydrate`

`hydrate` 更偏“把已经恢复出来、已经规整过的结果重新灌回运行对象”。

`journal replay` 处理的重点则仍然是：

- 读 journal
- 整理 replay 输入
- 产出供恢复链路继续消费的 replay 结果

因此：

- `journal replay` 不等于把状态灌回运行对象
- `journal replay` 不等于重新长出运行态 map / object / gateway
- `journal replay` 结果本身不能直接宣称为 hydrated runtime

白话讲，`journal replay` 更像“把旧材料读明白”；`hydrate` 更像“把整理好的结果重新装回活体里”。

## 6. `journal replay` 不等于 `resume`

`resume` 更偏“利用已经可继续的状态，把已有过程继续往前推”。

它可能会利用：

- 已恢复的状态基础
- 已灌回的运行对象
- 某些 replay 结果或 replay 之后的续接材料

但这不意味着：

- replay 本身就是 `resume`
- replay 结果已经等于“原过程继续起来了”
- replay cursor 的推进已经等于“系统恢复续跑成功”

因此，`journal replay` 最多只是 `resume` 之前或周边的一段支撑问题域，而不是续接动作本身。

## 7. 与 `cursor`、`checkpoint / snapshot` 的边界

### 7.1 `journal replay` 可能依赖 `cursor`，但不等于 `cursor`

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 从哪里继续读
- 当前大概推进到哪里

`journal replay` 则回答：

- 从这个位置开始，怎样继续读取 journal
- 读出来的材料怎样整理和重放

因此，第一版必须明确：

- `cursor` 是位置材料
- `journal replay` 是消费这些位置材料与 journal 材料的过程问题域
- 二者可以相邻，但不能混成一层

### 7.2 `journal replay` 不是 `checkpoint / snapshot`

`checkpoint / snapshot` 在上位文档里已经被冻结为恢复材料层。

它们可以承载：

- base state
- run 切片
- runtime snapshots
- journal cursor
- 其他恢复残留材料

`journal replay` 与它们的关系应理解成：

- 它可能读取由 checkpoint 提供的 cursor 起点
- 它可能基于 snapshot 邻近的恢复上下文工作
- 它可以把 replay 结果交给 `recover`

但它仍然不是：

- checkpoint 壳本身
- snapshot 壳本身
- 任一材料文件的同义词

## 8. `journal replay` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `journal replay` 不是正式装配结果
- replay 结果不能直接宣称为 `runtime-table`
- replay 过程也不能偷换成重新定义 `runtime-table`

这件事要特别强调，因为 replay 之后可能会出现更接近正式状态的结果，但“更接近”不等于“已经是正式装配结果”。

## 9. `journal replay` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `journal replay` 只是在恢复链路周边，从历史残留材料里读出、整理出、重放出一些可用结果。

因此，第一版必须明确：

- replay 结果不是运行对象本体
- replay 过程不能冒充活的运行时容器
- replay 完成不等于运行对象已经恢复成立

## 10. `journal replay` 的最小层级关系

可以先把 `journal replay` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> 形成可供 recover 消费的 replay 结果或 replay 过程产物
  -> recover 结合其他恢复材料整理出可用状态基础
  -> hydrate 把恢复结果灌回运行对象
  -> resume 利用已恢复且可继续的状态继续推进过程
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `journal replay` 站在材料层和恢复动作之间
- 它负责“把 journal 材料消化成可继续使用的东西”
- 它不是材料层总壳，也不是恢复链路总动作

## 11. 现实锚点

下面这些现实锚点只用于证明：`journal replay` 这个问题域在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段、函数名、状态名或 DSL 关键字。

### 11.1 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现非常明确的现实信号：

- `recoverFromCheckpoint(...)` 会先基于 `checkpoint?.record.journalCursor` 决定是 `readFromCursor(...)` 还是 `readRunEvents(...)`
- `replayedEvents` 被单独产出
- `resumeCursor` 被单独产出
- `projectStateFromEvents(...)` 使用 replay 出来的事件去推进恢复状态

这些现象支持本文判断：

- `journal replay` 已经被当成恢复输入的一部分
- 它服务 `recover`
- 但它没有被写成 `recover` 的全部

同时也要明确：

- `replayedEvents`
- `resumeCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准命名。

### 11.2 `src/agent_core/journal/append-only-log.ts`

当前 journal 子系统已经清楚展示出三种边界：

- `appendEvent(...)` 负责写入 journal
- `readFromCursor(...)` 负责从某个位置之后继续读取
- `readRunEvents(...)` 负责按 run 读取已有事件材料

这说明：

- `journal` 作为材料层本体已经存在
- 围绕 cursor 的读取边界已经存在
- `journal replay` 的现实入口确实落在“继续读取并消费这些材料”附近

但本文仍然只把这些函数名当作现实锚点，不把它们直接冻成未来宿主标准 API。

### 11.3 `src/agent_core/runtime.ts`

当前 runtime 路径已经把几件事分开了：

- `recoverAndHydrateTapRuntime(runId)` 把 recover 与 hydrate 相邻承接
- `continueRecoveredTapRuntime(runId)` 则继续处理恢复之后的续接动作

这说明现实代码里已经天然承认：

- replay / recover / hydrate / continue-resume 不是同一个动作
- `journal replay` 即使为恢复服务，也不应冒充后续的 hydrate 或 resume

同样地，这些函数名只是现实证据，不直接升格成未来正式术语表。

## 12. 当前不冻结的内容

第一版只冻结：

- `journal replay` 的正式定位
- 它与 `journal`、`recover`、`hydrate`、`resume`、`checkpoint / snapshot`、`runtime-table`、运行对象之间的边界
- 它为什么应当被理解成“消化/读取/重放 journal 材料”的问题域

第一版明确不冻结：

- 最终 replay 算法
- 最终事件顺序规则
- 去重/幂等细则
- replay window / batch / cursor 的精确策略
- 最终 schema
- 精确序列化格式
- 各类 replay result 的最终枚举
- 任何旧字段名、函数名、状态名是否继续保留

## 13. 第一版结论

可以把本文的冻结结论压缩成十点：

- `journal replay` 不等于 `journal`；前者是材料消费问题域，后者是残留材料本体。
- `journal replay` 不等于 `recover`；它只能服务恢复，不能冒充整个恢复动作。
- `journal replay` 不等于 `hydrate`；它不负责把结果灌回运行对象。
- `journal replay` 不等于 `resume`；它不负责让已有过程继续推进。
- `journal replay` 不是 `runtime-table`；replay 结果不能直接宣称为正式装配结果。
- `journal replay` 不是运行对象本身；它只能提供恢复输入，不能直接冒充活的运行态。
- `journal replay` 更像“从 journal 残留材料中读取、整理、重放出可供恢复链路消费的结果/过程”。
- `journal replay` 可以依赖 `cursor` 等位置材料，但不能和 `cursor` 混成一层。
- `journal replay` 可以服务于 `recover`，但不能被写成恢复链路的总代名词。
- 旧代码里的字段名、函数名、状态名只提供现实证据，不直接升格成未来标准。
