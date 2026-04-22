# agentCore `journal replay result` 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-journal-replay-formal-baseline-v1.md` 的继续下钻文，专门冻结 `journal replay result` 在 Praxis 宿主中的正式问题域定位。

本文只处理一件事：

- `journal replay result` 在 Praxis 宿主里到底是什么
- 为什么它与 `journal replay` 过程本身、`journal` 本体、`recover`、`hydrate`、`resume`、`cursor`、`checkpoint / snapshot`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么第一版只冻结 `journal replay result` 的对象定位、边界与关系，不冻结最终 result schema、最终事件枚举或 batch 枚举、最终 cursor advancement 细则、去重/幂等/合并策略，以及最终 serialization / DSL 关键字 / JSON 字段名

本文不重复宿主总纲，也不重复 `journal replay`、`runtime resume / recover / hydrate`、`checkpoint / snapshot`、`journal / receipt / cursor / reconciliation`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 result schema
- 最终事件枚举
- 最终 batch 枚举
- 最终 cursor advancement 细则
- 去重/幂等/合并策略
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名

第一版的目标不是一次性把 replay result 做成完整恢复协议，而是先把 `journal replay result` 这个结果/产物问题域，从 `journal replay` 过程本身和周边上位对象里正式切出来。

## 2. `journal replay result` 是什么

`journal replay result` 第一版应被理解为：**`journal replay` 在读取、整理、重放 journal 残留材料之后，留给恢复链路继续消费的结果/产物问题域。**

白话讲，它更像“replay 跑完之后交出来的一包可继续使用的东西”，而不是：

- replay 正在进行时的动作本身
- journal 材料本身
- 完整恢复结果本身
- 已经灌回运行对象后的活体状态本身

它更接近回答下面这些问题：

- replay 之后，到底留下了哪些可供恢复链路继续消费的产物
- 这些产物里哪些属于事件重放所得，哪些只是位置推进线索
- 这些产物和完整恢复结果之间的边界在哪里
- 哪些结果只说明“replay 已完成到某一步”，而不能宣布“恢复已经完成”

因此，`journal replay result` 第一版冻结的核心是：

- 它是 `journal replay` 的结果/产物问题域
- 它位于材料层与恢复链路之间
- 它可以被 `recover` 消费
- 它不能冒充 `journal replay` 整个过程，也不能冒充完整恢复结果

## 3. `journal replay result` 不等于 `journal replay`

### 3.1 过程与产物必须分层

`journal replay` 更偏“读取、整理、重放”的过程问题域。

`journal replay result` 更偏“这个过程结束后留下了什么可继续消费的结果/产物”。

这两者的最小区别可以先压缩成：

- `journal replay` 回答“怎么读、怎么整理、怎么重放”
- `journal replay result` 回答“读完、整理完、重放完之后，交出了什么”

### 3.2 有 replay 过程，不自动等于 result 已定型

哪怕仓库里已经存在：

- `readFromCursor(...)`
- `readRunEvents(...)`
- 基于 journal 事件做 state projection 的路径

也只能证明 `journal replay` 过程问题域已经有现实轮廓，不自动意味着：

- `journal replay result` 的未来 schema 已经冻结
- 任何旧字段名已经自动成为未来标准
- replay 产物已经和恢复产物完全等同

### 3.3 第一版必须排除的混写

- 把 `journal replay result` 直接写成 `journal replay` 的别名
- 因为存在 replay 读取路径，就把过程函数名直接当成结果对象名
- 把 replay 中间态、临时缓冲或批处理过程直接写成正式 result

## 4. `journal replay result` 不等于 `journal`

### 4.1 `journal` 是材料，result 是材料消费后的产物

`journal` 更偏事件/过程残留材料本体。

`journal replay result` 则是对这些材料完成 replay 之后产出的结果/产物。

最小区别可以先压缩成：

- `journal` 回答“留下了什么材料”
- `journal replay result` 回答“这些材料被 replay 之后留下了什么可继续消费的产物”

### 4.2 没有 result，`journal` 也可以独立成立

哪怕系统里已经有 append-only journal、run event 读取能力和 cursor 记录，`journal` 这一层也已经成立。

但这不自动意味着：

- replay result 已经单独成立
- replay result 的边界已经清楚
- journal 材料已经等于恢复输入产物

### 4.3 第一版必须排除的混写

- 把 `journal replay result` 写成“journal 本体的另一种名字”
- 把 replay 后得到的事件集合直接写成“这就是 journal”
- 把 journal 存储壳和 replay 产物壳混成同一层

## 5. `journal replay result` 不等于 `recover`

### 5.1 result 是 `recover` 的输入，不是 `recover` 本身

`recover` 更大，它处理的是怎样结合多类恢复材料，把系统带回可继续使用的正式状态基础。

`journal replay result` 只处理其中一小块：

- replay 之后交给恢复链路继续消费的结果/产物

因此，第一版必须明确：

- `journal replay result` 可以被 `recover` 消费
- 但它不能冒充完整恢复结果
- 它也不能被写成恢复链路的总代名词

### 5.2 `recover` 还会处理其他对象问题域

恢复链路仍然可能需要处理：

- `checkpoint / snapshot` 提供的恢复材料
- `cursor` 之外的恢复上下文
- runtime 兼容性与灌回前的整理结果

这些都说明：`recover` 不会被 `journal replay result` 一个结果问题域完全吞掉。

### 5.3 第一版必须排除的混写

- 把 `journal replay result` 直接宣布为“恢复完成结果”
- 把 replay 之后的事件产物直接写成“正式恢复状态”
- 把位置推进结果直接写成“恢复已经收口”

## 6. `journal replay result` 不等于 `hydrate`

`hydrate` 更偏把已经恢复出来、已经规整过的结果重新灌回运行对象。

`journal replay result` 处理的重点仍然只是：

- replay 之后交出来的结果/产物

因此：

- `journal replay result` 不等于把结果灌回运行对象
- `journal replay result` 不等于已重新成立的 session / gateway / store / runtime container
- `journal replay result` 不能直接宣称自己已经是 hydrated runtime

白话讲，result 更像“给恢复链路的一包中间成果”；hydrate 更像“把可用成果重新装回活体里”。

## 7. `journal replay result` 不等于 `resume`

`resume` 更偏利用已经可继续的状态，把原来的过程继续往前推。

它可能利用：

- 已恢复的状态基础
- 已灌回的运行对象
- 某些 replay 之后留下来的结果/产物

但这不意味着：

- `journal replay result` 已经等于“原过程继续起来了”
- replay 完成已经等于 resume 成功
- replay 结果已经等于续接中的活动运行态

因此，`journal replay result` 至多是 `resume` 之前或周边的一类输入产物，而不是续接动作本身。

## 8. `journal replay result` 不等于 `cursor`

### 8.1 result 可能携带位置推进信息，但不能和 `cursor` 混成同一对象

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 从哪里继续读
- 当前大概推进到哪里

`journal replay result` 则回答：

- replay 之后交出了哪些可供恢复链路继续消费的结果
- 其中是否附带了位置推进线索

因此，第一版必须明确：

- `journal replay result` 可能携带位置推进信息
- 但“携带位置推进信息”不等于“它就是 cursor”
- `cursor` 仍然是位置材料，`journal replay result` 仍然是 replay 产物问题域

### 8.2 第一版必须排除的混写

- 把 replay 结果中的位置推进线索直接写成 `cursor` 本体
- 把 `cursor` 的推进直接写成 replay result 的全部
- 把 replay 结果壳和位置指针壳写成同一层

## 9. `journal replay result` 不等于 `checkpoint / snapshot`

`checkpoint / snapshot` 在上位文档里已经冻结为恢复材料层。

`journal replay result` 与它们的关系应理解成：

- 它可能从这些材料层邻接关系中获得 replay 起点或上下文
- 它可以被放进恢复链路继续消费
- 它可以与 checkpoint record 或 snapshot 邻近出现

但它仍然不是：

- checkpoint 壳本身
- snapshot 壳本身
- 任一持久化材料文件的别名

白话讲，`checkpoint / snapshot` 更像“留下来的材料壳”；`journal replay result` 更像“拿这些材料去 replay 之后形成的结果产物”。

## 10. `journal replay result` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `journal replay result` 不是正式装配结果
- replay 产物不能直接宣称为 `runtime-table`
- 就算 replay 结果看起来更接近正式状态，也不等于它已经是宿主装配中心对象

因此，第一版必须排除下面这些混写：

- 把 replay result 写成正式 runtime 装配表
- 把 replay result 的某份事件结果写成 `runtime-table`
- 把“replay 能帮助恢复正式状态”偷换成“replay result 就是正式状态定义”

## 11. `journal replay result` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `journal replay result` 只是在 replay 之后留下的一组结果/产物。

因此，第一版必须明确：

- replay result 不是运行对象本体
- replay result 不能冒充活的运行时容器
- replay result 完成不等于运行对象已经恢复成立

## 12. `journal replay result` 的最小层级关系

可以先把 `journal replay result` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> 形成 journal replay result
  -> recover 消费该 result，并结合其他恢复材料整理出可用状态基础
  -> hydrate 把恢复结果灌回运行对象
  -> resume 利用已恢复且可继续的状态继续推进过程
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `journal replay result` 站在 `journal replay` 与 `recover` 之间
- 它更像 replay 之后留下、可供恢复链路继续消费的结果/产物
- 它可以被 `recover` 消费，但不能冒充完整恢复结果
- 它可能携带位置推进信息，但不能和 `cursor` 混成同一对象

## 13. 现实锚点

下面这些现实锚点只用于证明：`journal replay result` 这个问题域在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 13.1 `src/agent_core/checkpoint/checkpoint-types.ts`

当前 checkpoint 恢复类型里，`CheckpointRecoveryResult` 已经把几类东西拆开表达：

- `replayedEvents`
- `resumeCursor`
- 其他恢复结果字段

这说明现实代码里已经天然承认：

- replay 之后会留下单独可消费的结果
- 位置推进线索可以和 replay 事件结果并列出现
- 这两者都不自动等于完整恢复结果

但本文同时明确：这些旧字段名只是现实证据，不直接升格成未来标准。

### 13.2 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现更具体的现实信号：

- `recoverFromCheckpoint(...)` 会先根据 `checkpoint?.record.journalCursor` 决定读取路径
- replay 出来的结果会先落成 `replayedEvents`
- 位置推进信息会单独落成 `resumeCursor`
- `projectStateFromEvents(...)` 会继续消费 replay 出来的事件去推进恢复状态

这些现象支持本文判断：

- `journal replay result` 已经在现实里被当成可被恢复链路继续消费的产物
- 它与 `cursor` 相邻，但没有被写成同一个对象
- 它服务 `recover`，但没有被写成 `recover` 的全部

### 13.3 `src/agent_core/journal/append-only-log.ts`

当前 journal 子系统已经清楚展示出材料读取与结果产物之间的边界：

- `readFromCursor(...)` 负责从某个位置之后继续读取
- `readRunEvents(...)` 负责按 run 读取已有事件材料

这些函数本身更接近 replay 过程侧入口，不是 replay result 本体。

这正好支持本文的分层判断：

- 读取动作属于 `journal replay` 过程问题域
- 读取之后留下并交给恢复链路消费的内容，才更接近 `journal replay result` 问题域

### 13.4 `src/agent_core/runtime.ts`

当前 runtime 路径也已经把后续链路分开了：

- `recoverTapRuntimeSnapshot(runId)` 负责 recover 侧读取
- `recoverAndHydrateTapRuntime(runId)` 把 recover 与 hydrate 相邻承接
- `continueRecoveredTapRuntime(runId)` 则继续处理恢复之后的续接动作

这说明现实代码里已经天然承认：

- replay 产物
- recover
- hydrate
- continue / resume

不是同一个动作，也不应被强行写成同一个对象。

## 14. 当前不冻结的内容

第一版只冻结：

- `journal replay result` 的正式定位
- 它与 `journal replay` 过程本身、`journal`、`recover`、`hydrate`、`resume`、`cursor`、`checkpoint / snapshot`、`runtime-table`、运行对象之间的边界
- 它为什么更像 replay 之后交给恢复链路继续消费的结果/产物问题域

第一版明确不冻结：

- 最终 result schema
- 最终事件枚举 / batch 枚举
- 最终 cursor advancement 细则
- 去重/幂等/合并策略
- 最终 serialization / DSL 关键字 / JSON 字段名
- 任何旧字段名、函数名、状态名是否继续保留

## 15. 第一版结论

可以把本文的冻结结论压缩成十二点：

- `journal replay result` 不等于 `journal replay` 整个过程；前者是结果/产物问题域，后者是读取、整理、重放的过程问题域。
- `journal replay result` 不等于 `journal`；前者是材料消费后的产物，后者是事件/过程残留材料本体。
- `journal replay result` 不等于 `recover`；它可以被恢复链路消费，但不能冒充完整恢复结果。
- `journal replay result` 不等于 `hydrate`；它不负责把结果灌回运行对象。
- `journal replay result` 不等于 `resume`；它不负责让已有过程继续推进。
- `journal replay result` 不等于 `cursor`；它最多携带位置推进信息，不能和位置指针材料混成同一对象。
- `journal replay result` 不是 `checkpoint / snapshot`；它不是材料壳本身，而是 replay 之后的产物问题域。
- `journal replay result` 不是 `runtime-table`；它不能直接宣称为正式装配结果。
- `journal replay result` 不是运行对象本身；它不能直接冒充活的运行态。
- `journal replay result` 更像 replay 之后留下、可供恢复链路继续消费的结果/产物。
- `journal replay result` 可以被 `recover` 消费，但不能冒充完整恢复结果。
- 旧代码里的字段名、函数名、状态名只是现实证据，不直接升格成未来标准。
