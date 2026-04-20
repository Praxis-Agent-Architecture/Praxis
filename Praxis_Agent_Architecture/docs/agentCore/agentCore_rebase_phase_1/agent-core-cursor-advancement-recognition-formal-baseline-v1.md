# agentCore `cursor advancement recognition` 正式基线 v1

## 1. 定位

本文是：

- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-formal-baseline-v1.md`
- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-result-formal-baseline-v1.md`

的继续下钻文，专门冻结 `cursor advancement recognition` 在 Praxis 宿主中的正式定位。

本文只处理一件事：

- `cursor advancement recognition` 在 Praxis 宿主里到底是什么
- 为什么它与 `cursor advancement`、`cursor advancement result`、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么它更像“推进结果何时、为何、以什么边界被承认成可继续使用结果”的问题域，而不是这些上位对象的别名
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 recognition rule table、最终 acceptance / ack 条件集合、冲突合并/去重/幂等细则、replay window / batch / cursor policy，以及最终 schema / serialization / DSL / JSON 字段名 / 枚举

本文不重复宿主总纲，也不重复 `cursor advancement`、`cursor advancement result`、`journal replay`、`journal replay result`、`runtime resume / recover / hydrate`、`journal / receipt / cursor / reconciliation`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 recognition rule table
- 最终 acceptance / ack 条件集合
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 recognition schema
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名
- 任何最终枚举名

第一版的目标不是一次性把推进承认协议全部做完，而是先把 `cursor advancement recognition` 这个承认边界问题域，从 `cursor advancement`、`cursor advancement result` 以及周边更大的 replay / recover / resume 对象里正式切出来。

## 2. `cursor advancement recognition` 是什么

`cursor advancement recognition` 第一版应被理解为：**围绕一次位置推进结果，判断它何时、为何、以什么边界被承认成“可继续交给下游使用”的那层问题域。**

白话讲，它更像“推进结果过门槛”的承认层，而不是：

- 位置推进问题域本身
- 推进之后留下的结果/产物本身
- 位置材料本身
- replay 整个过程本身
- replay 完成后交出的整包结果本身
- 完整恢复动作本身
- 完整续接动作本身

它更接近回答下面这些问题：

- 这次推进结果到了什么程度才算被宿主承认
- 这个承认是因为哪一类边界已经满足，而不只是“看起来像推进了”
- 这份推进结果一旦被承认，应以什么最小身份继续交给下游
- 哪些现象只能算推进线索，哪些现象已经跨过了承认边界

因此，`cursor advancement recognition` 第一版冻结的核心是：

- 它是围绕推进结果承认边界的独立问题域
- 它站在 `cursor advancement result` 与下游消费动作之间
- 它可以影响 `recover` 或 `resume` 是否继续消费某个推进结果
- 它不能冒充 `cursor advancement`、`cursor advancement result`、`cursor`、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table` 或运行对象

## 3. `cursor advancement recognition` 不等于 `cursor advancement` 整个问题域

### 3.1 `cursor advancement` 更大，recognition 更窄

`cursor advancement` 更偏：

- 位置是否推进
- 推进到哪里
- 推进结果怎样被承认

`cursor advancement recognition` 则只盯住其中最窄的一段：

- 哪个推进结果已经跨过了承认边界
- 为什么这次跨越可以成立
- 这次承认之后怎样交给下游继续使用

最小区别可以先压缩成：

- `cursor advancement` 回答“推进问题域整体是什么”
- `cursor advancement recognition` 回答“推进结果何时算被正式承认”

### 3.2 没有单独 recognition，advancement 问题域也可以先成立

哪怕我们已经承认：

- replay 邻域里存在位置推进问题
- 推进会形成某种结果线索
- 恢复链路可能依赖推进结果

也不自动意味着：

- `cursor advancement recognition` 已经被单独冻结
- “看到了推进落点”就已经等于“宿主正式承认”
- advancement 整个问题域已经可以直接覆盖 recognition 这条更窄边界

### 3.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 写成 `cursor advancement` 的别名
- 把“位置推进问题存在”直接偷换成“推进结果已经被承认”
- 用整个 advancement 问题域吞掉 recognition 这条更窄的承认边界

## 4. `cursor advancement recognition` 不等于 `cursor advancement result` 整体

### 4.1 result 是结果壳，recognition 是承认边界

`cursor advancement result` 更偏：

- 一次推进判定之后留下了什么结果/产物

`cursor advancement recognition` 更偏：

- 这些结果/产物里，哪一份已经跨过了承认边界
- 这份承认是依据什么边界成立的
- 承认后的结果怎样被下游继续消费

最小区别可以先压缩成：

- `cursor advancement result` 回答“留下了什么”
- `cursor advancement recognition` 回答“留下来的东西什么时候算可继续使用”

### 4.2 有 result，不自动等于 recognition 已成立

即使现实里已经出现：

- 单独的推进落点
- replay 之后留下的位置结果
- recovery result 里并列出现的位置字段

也只能说明推进结果壳有现实轮廓，不自动意味着：

- 这份结果已经被宿主正式承认
- 未来 recognition 边界已经冻结
- 任一旧字段已经等于未来正式 acceptance / ack 标准

### 4.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 直接写成 `cursor advancement result`
- 把“有推进结果”直接偷换成“推进结果已被承认”
- 用结果壳本身吞掉承认边界问题

## 5. `cursor advancement recognition` 不等于 `cursor`

### 5.1 `cursor` 是位置材料，recognition 是推进结果承认边界

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 当前位置是什么
- 从哪里继续读
- 当前记录落在什么位置

`cursor advancement recognition` 则回答的是：

- 这次围绕位置推进留下的结果，是否已经被承认
- 这次承认到底承认了什么最小落点
- 这次承认怎样交给下游继续使用

### 5.2 recognition 可以围绕位置落点展开，但不能和 `cursor` 本体混成一层

第一版必须明确：

- `cursor advancement recognition` 可能围绕某个位置落点成立
- 但“围绕位置落点成立”不等于“它就是 `cursor` 本体”
- `cursor` 仍然是材料层，recognition 仍然是承认边界层

### 5.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 直接写成 `cursor`
- 因为旧代码里出现 `resumeCursor`，就把单个位置字段直接写成完整 recognition 问题域
- 把“有位置字段”直接偷换成“承认边界已经完整定义”

## 6. `cursor advancement recognition` 不等于 `journal replay`

### 6.1 replay 更大，recognition 更窄

`journal replay` 更偏：

- 读取 journal 材料
- 整理事件
- 重放事件
- 为恢复链路形成可继续消费的输入

`cursor advancement recognition` 只处理其中更窄的一段：

- replay 邻域里推进结果何时被承认
- 承认的边界是什么
- 承认后怎样交给下游

因此，第一版必须明确：

- `cursor advancement recognition` 可以落在 replay 邻域
- 但它不等于 replay 整个过程
- 它不能被写成 replay 的总代名词

### 6.2 replay 可以存在，而 recognition 仍然只是其中一条边界问题

哪怕现实代码里已经有：

- `readFromCursor(...)`
- `readRunEvents(...)`
- replay 之后继续做 state projection 的路径

也只能说明 replay 问题域已经有现实轮廓，不自动意味着：

- recognition rule table 已经冻结
- replay 读完就自动等于“推进结果已被承认”
- replay 过程本身已经完全吞掉 recognition 这条承认边界

### 6.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 写成“把 replay 跑完”
- 把 replay window / batch policy 偷换成 recognition 定义
- 因为 replay 会读到新位置，就把 recognition 并回 replay 总体

## 7. `cursor advancement recognition` 不等于 `journal replay result`

### 7.1 replay result 是更大的结果壳，recognition 只是其中一条承认边界

`journal replay result` 更偏 replay 结束后交出来的一组可继续消费的结果/产物。

`cursor advancement recognition` 则更偏其中关于位置推进承认的那条问题线：

- 哪个推进结果已经可承认
- 为什么它可以被承认
- 承认后怎样作为更小结果交给下游

因此，第一版必须明确：

- `cursor advancement recognition` 可能出现在 replay result 邻域
- 它甚至可能由 replay result 中的某些结果面向触发
- 但它不等于 replay result 整体

### 7.2 recognition 可以落在 result 邻域，但不能被 result 吞掉

现实里一份 replay result 可能同时带有：

- replayed events
- 位置推进结果
- 其他恢复链路继续消费的产物

这说明：

- `cursor advancement recognition` 可能紧贴 result 邻域出现
- 但它仍然只是更窄的承认边界问题域
- 不能因为它发生在 result 旁边，就把它缩写成 replay result 的全部

### 7.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 直接写成 `journal replay result`
- 把 replay result 里的其他事件结果、恢复输入结果一并并入 recognition 定义
- 把“result 里带有推进线索”偷换成“recognition 已经等于整包 replay result”

## 8. `cursor advancement recognition` 不等于 `recover`

### 8.1 `recover` 更偏找回可用状态基础

`recover` 处理的是：

- 如何结合 checkpoint、snapshot、journal、cursor 等恢复材料
- 找回一份可继续使用的状态基础

`cursor advancement recognition` 只处理其中更窄的一块：

- 某个推进结果是否已经被承认
- 这份承认能否继续交给恢复链路消费

因此：

- `cursor advancement recognition` 可以影响 `recover` 是否继续消费某个推进结果
- 但它不能冒充整个恢复动作

### 8.2 recognition 只能决定“能不能继续用这份推进结果”，不能冒充完整恢复

即使某次 recognition 已经表明：

- 某个推进落点可被继续承认
- 这份推进结果可以交给恢复链路继续消费

也不等于：

- 状态已经完整找回
- 恢复已经收口
- 完整 recover result 已经成立

### 8.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 写成“恢复完成判定”
- 把“推进结果已被承认”写成“恢复已经完成”
- 把 recognition 结果直接写成完整 recover result

## 9. `cursor advancement recognition` 不等于 `resume`

### 9.1 `resume` 更偏让已有过程继续推进

`resume` 更偏：

- 利用已经可继续的状态
- 让已有过程重新往前走

`cursor advancement recognition` 则更偏：

- 为续接链路判断某份推进结果能不能继续被消费
- 为续接链路给出一条承认边界

因此：

- `cursor advancement recognition` 可以影响 `resume` 是否继续消费某个推进结果
- 但它不等于 `resume`

### 9.2 recognition 不是完整续接动作

即使某次 recognition 已经表明：

- 某个推进结果现在可继续使用
- 这份结果足以让续接链路往下尝试消费

也不等于：

- 原过程已经成功续跑
- 所有运行对象已经恢复完成
- 完整 resume result 已经成立

### 9.3 第一版必须排除的混写

- 把 `cursor advancement recognition` 写成“resume 成功条件”本身
- 把“推进结果已被承认”写成“原过程已经续接完成”
- 把 recognition 结果直接写成完整 resume result

## 10. `cursor advancement recognition` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `cursor advancement recognition` 不是正式装配结果
- 它不能直接宣称为 `runtime-table`
- 它也不能反向重写正式运行态定义

哪怕 recognition 的结果会影响恢复链路怎样继续接近正式运行态，也不等于 recognition 本身已经是装配中心对象。

## 11. `cursor advancement recognition` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `cursor advancement recognition` 只是在 replay / 恢复 / 续接链路周边，对推进结果承认边界做判断。

因此，第一版必须明确：

- recognition 不是运行对象本体
- recognition 不能冒充活的运行时容器
- recognition 成立不等于运行对象已经恢复成立

## 12. 为什么它更像“推进结果承认边界 / 承认问题域”

### 12.1 它处理的是“什么时候算被承认”，不是“有没有推进”的全貌

如果只谈 `cursor advancement`，我们谈的是：

- 有没有推进
- 推进到哪里
- 推进问题怎样成立

一旦谈 `cursor advancement recognition`，问题马上缩成：

- 这份推进结果什么时候算被宿主承认
- 哪些现象仍只是推进线索
- 哪些现象已经能跨过下游可消费边界

这说明它本质上更像承认边界层，而不是完整推进问题域。

### 12.2 它处理的是“被什么边界承认”，不是“结果壳长什么样”的全貌

如果只谈 `cursor advancement result`，我们只是在谈：

- 推进之后留下了什么结果/产物

而 `cursor advancement recognition` 更像在说：

- 这些结果里哪一份已经成为“可继续使用的结果”
- 这次承认依赖的是哪条边界，而不是仅仅“结果存在了”

所以它不是结果壳本体，而是围绕结果壳发生的承认边界问题域。

### 12.3 它处理的是“承认后怎样交给下游”，不是“下游动作本身”

如果只谈 `recover` 或 `resume`，重点分别在于：

- 状态怎样找回
- 过程怎样续接

而 `cursor advancement recognition` 更像在说：

- 哪份推进结果已经可以交给这些下游继续消费
- 交给下游的身份边界是什么

所以它更像“承认边界问题域”，而不是完整恢复动作或完整续接动作。

## 13. 它可以影响 `recover` / `resume` 是否继续消费某个推进结果，但不能冒充完整恢复或完整续接动作

第一版必须把这层关系单独冻住：

- `recover` 可以依赖 `cursor advancement recognition` 来判断某份推进结果能不能继续消费
- `resume` 也可以依赖 `cursor advancement recognition` 来判断某份推进结果能不能继续消费
- 但它们消费的是“被承认后的推进结果”，不是拿 recognition 来顶替整个恢复动作或整个续接动作

白话讲，`cursor advancement recognition` 更像恢复链路和续接链路前面的一个“过门槛判断”，它可以决定某份推进结果能不能继续往下传，但它自己不是“恢复已经完成”或“续接已经完成”。

因此，第一版必须排除下面这些混写：

- 把 `cursor advancement recognition` 直接宣布为 recover 的最终完成边界
- 把 `cursor advancement recognition` 直接宣布为 resume 的最终完成边界
- 因为 `recover` / `resume` 会消费它，就把它抬成 `recover` / `resume` 的总代名词

## 14. 它可能落在 replay / result 邻域，但不能被 replay / result 整体吞掉

第一版还必须稳定住另一层关系：

- `cursor advancement recognition` 很可能发生在 replay 之后、result 邻域里
- 它也可能以 replay 输出中的某些结果线索为前提
- 但它仍然不是 replay 本身，也不是 replay result 整体

白话讲，这层 recognition 很像“replay / result 旁边的承认窄层”：

- 没有 replay / result 提供的现实线索，它常常无从展开
- 但一旦展开，它处理的也不是“把 replay 再做一遍”或“替 replay result 重新命名”

因此，第一版必须排除下面这些混写：

- 把 replay 邻域里的 recognition 直接并回 replay
- 把 result 邻域里的 recognition 直接并回 replay result
- 因为 recognition 依赖 replay / result 线索，就把 recognition 取消成独立问题域

## 15. `cursor advancement recognition` 的最小层级关系

可以先把 `cursor advancement recognition` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> cursor advancement 问题域判断位置是否推进、推进到哪里
  -> 留下 cursor advancement result
  -> cursor advancement recognition 判断这份推进结果何时、为何、以什么边界被承认
  -> recover / resume 继续消费这份已被承认的推进结果
  -> 进一步回到可继续运行的正式状态
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `cursor advancement recognition` 站在 `cursor advancement result` 与下游消费动作之间
- 它处理的是推进结果承认边界，而不是推进结果壳本身
- 它可能落在 replay / result 邻域，但不能被 replay / result 整体吞掉
- 它可能影响 `recover` / `resume` 是否继续消费某个推进结果，但不能冒充完整恢复或完整续接动作

## 16. 现实锚点

下面这些现实锚点只用于证明：`cursor advancement recognition` 这个承认边界问题域在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 16.1 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现非常直接的现实信号：

- `recoverFromCheckpoint(...)` 会先根据 `checkpoint?.record.journalCursor` 决定读取起点
- replay 出来的结果会单独落成 `replayedEvents`
- 推进后的落点会单独落成 `resumeCursor`
- `resumeCursor` 的来源是 `replayedEvents.at(-1)?.cursor ?? checkpoint?.record.journalCursor`

这些现象支持本文判断：

- 旧代码里已经存在“推进结果与 replay 事件结果拆开表达”的现实轮廓
- 这说明宿主已经天然接近“某个推进落点可否继续被承认”的问题
- 但它仍然只说明 recognition 问题存在，不直接等于未来正式 recognition rule table 或 acceptance / ack 条件集合

但本文同时明确：

- `resumeCursor`
- `journalCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 16.2 `src/agent_core/checkpoint/checkpoint-types.ts`

当前恢复类型里，`CheckpointRecoveryResult` 已经把几类东西拆开表达：

- `replayedEvents`
- `resumeCursor`
- 其他恢复结果字段

这说明现实代码里已经天然承认：

- replay 事件结果与位置推进结果可以并列出现
- 位置推进结果不是 replay 事件集合本身
- 位置推进结果也不是完整 recovery result 本身

这正好支持本文的分层判断：

- `cursor advancement recognition` 更像并列结果之上的承认窄层
- 它可以依赖这些结果线索展开
- 但它不能反过来冒充整个 recovery result

### 16.3 `src/agent_core/journal/append-only-log.ts`

当前 journal 子系统已经清楚展示出几个现实边界：

- `readFromCursor(...)` 负责从某个位置之后继续读取
- `readRunEvents(...)` 负责按 run 读取已有事件材料
- 这些入口返回的是位置与事件材料，而不是正式 recognition 结论

这说明：

- 旧代码里已经有材料读取边界
- replay / 位置读取可以提供 recognition 所需线索
- 但“能够读到某个位置”仍不等于“这个推进结果已经被正式承认”

### 16.4 `src/agent_core/runtime.ts`

当前 runtime 路径也已经把后续链路分开了：

- `recoverTapRuntimeSnapshot(runId)` 负责 recover 侧读取
- `recoverAndHydrateTapRuntime(runId)` 把 recover 与 hydrate 相邻承接
- `continueRecoveredTapRuntime(runId)` 则继续处理恢复之后的续接动作

这些路径说明现实代码里已经天然承认：

- recover
- hydrate
- continue / resume

不是同一个动作，也不应被强行写成同一个对象。

这正好支持本文判断：

- 某份推进结果是否被承认，可以影响后续 continue / resume 是否继续消费
- 但 recognition 本身仍然不能冒充 recover / hydrate / continue 的完整动作定义

## 17. 第一版冻结结论

本文第一版冻结的是：

- `cursor advancement recognition` 在 Praxis 宿主里的正式定位
- 它与 `cursor advancement`、`cursor advancement result`、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象之间的边界
- 它作为“推进结果何时、为何、以什么边界被承认成可继续使用结果”的最小层级关系
- 现实代码只作为证据，不直接升格成未来标准

本文第一版不冻结的是：

- 最终 recognition rule table
- 最终 acceptance / ack 条件集合
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 schema / serialization / DSL / JSON 字段名 / 枚举

## 18. 最小结论

- `cursor advancement recognition` 不等于 `cursor advancement` 整个问题域；前者只处理推进结果承认边界，后者处理更大的推进问题域。
- `cursor advancement recognition` 不等于 `cursor advancement result` 整体；前者关心结果何时算被承认，后者关心推进后留下了什么结果。
- `cursor advancement recognition` 不等于 `cursor` 本体；前者最多围绕位置落点成立承认边界，后者是位置/进度指针材料。
- `cursor advancement recognition` 不等于 `journal replay`；前者只处理 replay 邻域里的推进结果承认问题，后者处理读取、整理、重放全过程。
- `cursor advancement recognition` 不等于 `journal replay result`；它最多是 replay result 邻域里关于推进结果承认的一条窄层问题线，不能和整包结果混成一层。
- `cursor advancement recognition` 不等于 `recover`；它可以影响恢复链路是否继续消费某个推进结果，但不能冒充完整恢复动作。
- `cursor advancement recognition` 不等于 `resume`；它可以影响续接链路是否继续消费某个推进结果，但不能冒充完整续接动作。
- `cursor advancement recognition` 不是 `runtime-table`；它不能直接宣称为正式装配结果。
- `cursor advancement recognition` 不是运行对象本身；它不能直接冒充活的运行态。
- `cursor advancement recognition` 更像推进结果什么时候算被承认、被什么边界承认、承认后怎样交给下游的正式问题域。
- 旧代码里的字段名、函数名、状态名只是现实证据，不直接升格成未来标准。
