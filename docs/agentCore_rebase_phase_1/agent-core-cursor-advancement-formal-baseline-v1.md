# agentCore `cursor advancement` 正式基线 v1

## 1. 定位

本文承接：

- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-journal-replay-formal-baseline-v1.md`
- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-journal-replay-result-formal-baseline-v1.md`

专门冻结 `cursor advancement` 在 Praxis 宿主中的正式问题域定位。

本文只处理一件事：

- `cursor advancement` 在 Praxis 宿主里到底是什么
- 为什么它与 `cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`checkpoint / snapshot`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么它更像“位置是否推进、推进到哪、推进结果怎样被承认”的问题域，而不是这些上位对象的别名
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 advancement algorithm、最终推进规则表、去重/幂等/冲突合并细则、replay window / batch policy、最终 schema / serialization / DSL / JSON 字段名 / 枚举

本文不重复宿主总纲，也不重复 `journal replay`、`journal replay result`、`runtime resume / recover / hydrate`、`checkpoint / snapshot`、`journal / receipt / cursor / reconciliation`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 advancement algorithm
- 最终推进规则表
- 去重/幂等/冲突合并细则
- replay window / batch policy
- 最终 result schema
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名
- 任何最终枚举名

第一版的目标不是一次性把位置推进机制做成完整协议，而是先把 `cursor advancement` 这个问题域从 `cursor`、`journal replay`、`journal replay result`、恢复链路动作以及运行态对象里正式切出来。

## 2. `cursor advancement` 是什么

`cursor advancement` 第一版应被理解为：**围绕 replay / 恢复链路，对“位置是否推进、推进到哪里、推进结果怎样被承认并继续交给下游使用”的问题域。**

白话讲，它更像“位置推进判定层”，而不是：

- 位置指针材料本身
- replay 整个读取/整理/重放过程本身
- replay 完成后交出的整包结果本身
- 完整恢复动作本身
- 完整续接动作本身

它更接近回答下面这些问题：

- 当前这次 replay 或恢复链路有没有形成新的可承认推进
- 这次推进到底落到了哪个位置
- 这个推进是临时读到，还是已经可以被下游承认
- 推进结果该作为 replay/result 邻接信息出现，还是应该继续交给 `recover` / `resume` 使用

因此，`cursor advancement` 第一版冻结的核心是：

- 它是一个围绕位置推进判定与推进结果边界的问题域
- 它站在 `cursor` 材料、`journal replay` 过程与 `journal replay result` 产物之间的窄层位置
- 它可以服务 `recover` 或 `resume`
- 它不能冒充 `cursor`、`journal replay`、`journal replay result`、`recover`、`resume` 这些更大或更基础的对象

## 3. `cursor advancement` 不等于 `cursor`

### 3.1 `cursor` 是位置材料，`cursor advancement` 是位置推进问题域

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 当前位置是什么
- 从哪里继续读
- 当前记录落在什么位置

`cursor advancement` 则回答的是：

- 这次是否形成了新的位置推进
- 如果形成推进，应当推进到哪里
- 这个推进结果是否已经可以被下游承认

最小区别可以先压缩成：

- `cursor` 回答“位置是什么”
- `cursor advancement` 回答“位置有没有推进，以及推进如何被承认”

### 3.2 没有 advancement，`cursor` 也可以独立成立

哪怕系统里已经存在：

- `journalCursor`
- `resumeCursor`
- 某个 checkpoint 记录的最后位置

`cursor` 这一层也已经成立。

但这不自动意味着：

- `cursor advancement` 已经被单独定义清楚
- 任何位置变化都已经形成正式推进判定
- 任一旧字段都已经等于未来 advancement 标准

### 3.3 第一版必须排除的混写

- 把 `cursor advancement` 直接写成 `cursor` 的别名
- 因为旧代码里出现 `resumeCursor`，就把单个位置字段直接写成完整 advancement 问题域
- 把“记录了当前位置”直接偷换成“已经完成推进判定”

## 4. `cursor advancement` 不等于 `journal replay`

### 4.1 replay 更大，advancement 更窄

`journal replay` 更偏：

- 从材料层读取事件
- 整理事件
- 重放事件
- 为恢复链路形成可继续消费的输入

`cursor advancement` 只处理其中一条更窄的问题线：

- replay 之后位置是否推进
- 推进落点在哪里
- 这个推进如何被承认

因此，第一版必须明确：

- `cursor advancement` 可以出现在 replay 旁边
- 但它不等于 replay 整个过程
- 也不能被写成 replay 的总代名词

### 4.2 replay 可以存在，而 advancement 仍然只是其中一个子问题

哪怕现实代码里已经有：

- `readFromCursor(...)`
- `readRunEvents(...)`
- replay 之后继续 `projectStateFromEvents(...)`

也只能说明 replay 问题域已经存在。

这不自动意味着：

- advancement algorithm 已经冻结
- replay 的每一次读取都自动等于正式推进
- replay 过程本身已经完全吞掉 advancement 问题域

### 4.3 第一版必须排除的混写

- 把 `cursor advancement` 写成“把 replay 跑完”本身
- 把 replay window / batch policy 偷换成 advancement 定义
- 因为 replay 会读位置，就把 advancement 并回 replay 总体

## 5. `cursor advancement` 不等于 `journal replay result`

### 5.1 result 是更大的 replay 产物壳，advancement 是其中一条边界问题域

`journal replay result` 更偏 replay 结束后交出来的一组可继续消费的结果/产物。

`cursor advancement` 则更偏其中关于位置推进的那条问题线：

- 有没有推进
- 推进到哪
- 推进结果怎样被承认

因此，第一版必须明确：

- `cursor advancement` 可能出现在 replay result 旁边
- 它甚至可能是 replay result 里的一个邻接结果面向
- 但它不等于 replay result 整体

### 5.2 advancement 可以被 result 承载，但不能被 result 吞掉

现实里一个 replay result 可能同时带有：

- replayed events
- 位置推进线索
- 其他恢复链路继续消费的产物

这说明：

- `cursor advancement` 可以作为 result 邻域存在
- 但它仍然只是 result 里关于位置推进承认的一条问题域
- 不能因为它落在 result 旁边，就把它缩写成 replay result 的全部

### 5.3 第一版必须排除的混写

- 把 `cursor advancement` 直接写成 `journal replay result`
- 把 replay result 中的其他事件结果、批次结果、恢复输入结果一并并入 advancement 定义
- 把“有 advancement 信息”偷换成“这就是完整 replay result”

## 6. `cursor advancement` 不等于 `recover`

### 6.1 `recover` 更偏找回可用状态基础

`recover` 处理的是：

- 如何结合 checkpoint、snapshot、journal、cursor 等恢复材料
- 找回一份可继续使用的状态基础

`cursor advancement` 只处理其中更窄的一块：

- 与位置推进有关的判定
- 与推进承认有关的结果边界

因此：

- `cursor advancement` 可以服务 `recover`
- 但它不能冒充整个恢复动作

### 6.2 advancement 只能提供位置推进线索，不能冒充完整恢复

即使某次推进结果对恢复很关键，也只能说明：

- 下游恢复链路多拿到了一条位置推进线索
- 或多拿到了一条可继续承认的位置落点

这仍然不等于：

- 状态已经完整找回
- 恢复已经收口
- 恢复材料已经全部对齐

### 6.3 第一版必须排除的混写

- 把 `cursor advancement` 写成“恢复完成判定”
- 把“位置推进已承认”写成“恢复已经完成”
- 把 advancement 结果直接写成完整 recovery result

## 7. `cursor advancement` 不等于 `resume`

### 7.1 `resume` 更偏让已有过程继续推进

`resume` 更偏：

- 利用已经可继续的状态
- 让已有过程重新往前走

`cursor advancement` 则更偏：

- 为续接链路提供位置推进线索
- 为续接链路提供位置承认边界

因此：

- advancement 可以帮助 `resume`
- 但它不等于 `resume`

### 7.2 advancement 不是完整续接动作

即使某次 advancement 已经表明：

- replay 从旧位置推进到了新位置
- 某个位置结果可以继续被承认

也不等于：

- 原过程已经成功续跑
- 所有运行对象已经恢复完成
- 调度、消息、session、gateway 已经全部接上

### 7.3 第一版必须排除的混写

- 把 `cursor advancement` 写成 resume policy
- 把“推进到某个位置”写成“原过程已经续接完成”
- 把位置推进判定偷换成完整 resume 动作

## 8. `cursor advancement` 不等于 `checkpoint / snapshot`

`checkpoint / snapshot` 在上位文档里已经被冻结为恢复材料层与材料壳。

`cursor advancement` 与它们的关系应理解成：

- 它可能使用某个 checkpoint 中记录的位置作为比较基线
- 它可能把推进结果交给恢复链路继续消费
- 它可能与材料壳相邻出现

但它仍然不是：

- checkpoint 壳本身
- snapshot 壳本身
- 任一持久化材料文件的别名

白话讲，`checkpoint / snapshot` 更像“材料壳”；`cursor advancement` 更像“对位置是否推进的判定边界”。

## 9. `cursor advancement` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `cursor advancement` 不是正式装配结果
- 它不能直接宣称为 `runtime-table`
- 它也不能反向重写正式运行态定义

哪怕某次 advancement 会影响恢复链路怎样接近正式运行态，也不等于 advancement 本身已经是装配中心对象。

## 10. `cursor advancement` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `cursor advancement` 只是在 replay / 恢复链路周边，对位置推进与推进承认边界做判断。

因此，第一版必须明确：

- advancement 结果不是运行对象本体
- advancement 不能冒充活的运行时容器
- advancement 成立不等于运行对象已经恢复成立

## 11. 为什么它更像“位置推进 / 推进判定 / 推进结果边界”问题域

### 11.1 它处理的是“是否推进”，不是“位置材料本体”

如果只谈 `cursor`，我们只是在谈一个位置材料。

一旦谈 `cursor advancement`，问题马上变成：

- 这次读到的结果是否足以形成推进
- 推进是临时观察，还是已经可以承认
- 推进后的落点如何被下游继续使用

这说明它本质上更像判定层，而不是材料层。

### 11.2 它处理的是“推进到哪”，不是“重放了什么”的全貌

如果只谈 `journal replay`，重点在于：

- 读了什么
- 怎样整理
- 怎样重放

而 advancement 只盯着其中更窄的一层：

- 位置有没有被推进
- 推进后的落点是什么

所以它不是 replay 的同义词，而是 replay 周边的一条正式边界问题。

### 11.3 它处理的是“推进结果怎样被承认”，不是“恢复或续接动作本身”

如果只谈 `recover` 或 `resume`，重点在于：

- 状态怎样找回
- 过程怎样续接

而 advancement 更像在说：

- 哪个位置推进结果现在可以被承认
- 这个承认结果怎样继续交给恢复链路或续接链路

所以它更像“位置推进结果边界”，而不是完整动作本身。

## 12. `cursor advancement` 的最小层级关系

可以先把 `cursor advancement` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> 在 replay/result 邻域显影出 cursor advancement 问题
  -> 判断位置是否推进、推进到哪里、推进结果能否被承认
  -> recover / resume 继续消费这一推进线索或推进承认结果
  -> 进一步回到可继续运行的正式状态
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `cursor advancement` 站在 `cursor`、`journal replay`、`journal replay result` 与恢复链路动作之间
- 它更像 replay / 恢复链路周边对位置推进问题的正式切分
- 它可能出现在 replay 或 result 旁边，但不能被它们吞掉
- 它可能为 `recover` 或 `resume` 提供线索，但不能冒充完整恢复或续接动作

## 13. 现实锚点

下面这些现实锚点只用于证明：`cursor advancement` 这个问题域在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 13.1 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现非常直接的现实信号：

- `recoverFromCheckpoint(...)` 会先根据 `checkpoint?.record.journalCursor` 决定读取起点
- replay 出来的结果会单独落成 `replayedEvents`
- 推进后的落点会单独落成 `resumeCursor`
- `resumeCursor` 的来源是 `replayedEvents.at(-1)?.cursor ?? checkpoint?.record.journalCursor`

这些现象支持本文判断：

- 旧代码里已经存在“推进到哪里”的现实表达
- 这个表达既不等于 `cursor` 材料总层，也不等于 replay 整体
- 它更像 replay 之后对位置推进结果的承认边界

但本文同时明确：

- `resumeCursor`
- `journalCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 13.2 `src/agent_core/checkpoint/checkpoint-types.ts`

当前恢复类型里，`CheckpointRecoveryResult` 已经把几类东西拆开表达：

- `replayedEvents`
- `resumeCursor`
- 其他恢复结果字段

这说明现实代码里已经天然承认：

- replay 事件结果与位置推进结果可以并列出现
- 位置推进结果不是 replay 事件集合本身
- 位置推进结果也不是完整 recovery result 本身

这正好支持本文的分层判断：

- `cursor advancement` 可以落在 replay result 邻域
- 但它不能被 replay result 整体吞掉

### 13.3 `src/agent_core/journal/append-only-log.ts`

当前 journal 子系统已经清楚展示出几个现实边界：

- `appendEvent(...)` 负责写材料
- `readFromCursor(...)` 负责从某个位置之后继续读取
- `readRunEvents(...)` 负责按 run 读取已有事件材料

这些函数更接近：

- 材料层入口
- replay 过程侧入口

而不是：

- advancement 判定本身
- advancement 承认结果本身

这说明：

- 旧代码里已经有位置读取边界
- 但“能从哪里继续读”仍不等于“位置推进已经如何被正式承认”

### 13.4 `src/agent_core/runtime.ts`

当前 runtime 路径也已经把后续链路分开了：

- `recoverTapRuntimeSnapshot(runId)` 负责 recover 侧读取
- `recoverAndHydrateTapRuntime(runId)` 把 recover 与 hydrate 相邻承接
- `continueRecoveredTapRuntime(runId)` 则继续处理恢复之后的续接动作

这说明现实代码里已经天然承认：

- replay / replay result
- recover
- hydrate
- continue / resume

不是同一个动作，也不应被强行写成同一个对象。

因此，`cursor advancement` 最多只是这条链路里的位置推进判定问题域，不能冒充完整恢复或完整续接动作。

## 14. 当前不冻结的内容

第一版只冻结：

- `cursor advancement` 的正式定位
- 它与 `cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`checkpoint / snapshot`、`runtime-table`、运行对象之间的边界
- 它为什么更像“位置推进 / 推进判定 / 推进结果边界”的问题域

第一版明确不冻结：

- 最终 advancement algorithm
- 最终推进规则表
- 去重/幂等/冲突合并细则
- replay window / batch policy
- 最终 schema / serialization / DSL / JSON 字段名 / 枚举
- 任何旧字段名、函数名、状态名是否继续保留

## 15. 第一版结论

可以把本文的冻结结论压缩成十一点：

- `cursor advancement` 不等于 `cursor` 本体；前者是位置推进问题域，后者是位置/进度指针材料。
- `cursor advancement` 不等于 `journal replay`；前者只处理推进判定与推进承认边界，后者处理读取、整理、重放全过程。
- `cursor advancement` 不等于 `journal replay result`；它最多是 replay result 邻域里关于位置推进的一条问题线，不能和整包结果混成一层。
- `cursor advancement` 不等于 `recover`；它可以服务恢复，但不能冒充完整恢复动作。
- `cursor advancement` 不等于 `resume`；它可以提供续接线索，但不能冒充完整续接动作。
- `cursor advancement` 不是 `checkpoint / snapshot`；它不是材料壳，而是围绕位置推进的判定边界。
- `cursor advancement` 不是 `runtime-table`；它不能直接宣称为正式装配结果。
- `cursor advancement` 不是运行对象本身；它不能直接冒充活的运行态。
- `cursor advancement` 更像 replay / 恢复链路周边对“位置是否推进、推进到哪里、推进结果怎样被承认”的问题域。
- `cursor advancement` 可能出现在 replay 或 result 旁边，也可能为 `recover` 或 `resume` 提供推进线索，但不能被这些上位对象吞掉。
- 旧代码里的字段名、函数名、状态名只是现实证据，不直接升格成未来标准。
