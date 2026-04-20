# agentCore `cursor advancement recognition result` 正式基线 v1

## 1. 定位

本文是：

- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-recognition-formal-baseline-v1.md`
- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-result-formal-baseline-v1.md`

的继续下钻文，专门冻结 `cursor advancement recognition result` 在 Praxis 宿主中的正式对象定位。

本文只处理一件事：

- `cursor advancement recognition result` 在 Praxis 宿主里到底是什么
- 为什么它与 `cursor advancement recognition`、`cursor advancement result`、`cursor advancement`、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么它更像“推进结果跨过承认边界之后，留下来可继续交给下游消费的更窄结果/产物”，而不是这些上位对象的别名
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 result schema、最终 acceptance / ack result 枚举或条件集合、冲突合并/去重/幂等细则、replay window / batch / cursor policy，以及最终 serialization / DSL / JSON 字段名 / 枚举

本文不重复宿主总纲，也不重复 `cursor advancement`、`cursor advancement recognition`、`cursor advancement result`、`journal replay`、`journal replay result`、`runtime resume / recover / hydrate`、`journal / receipt / cursor / reconciliation`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 result schema
- 最终 acceptance / ack result 枚举
- 最终 acceptance / ack 条件集合
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名
- 任何最终枚举名

第一版的目标不是一次性把推进承认结果协议全部做完，而是先把 `cursor advancement recognition result` 这个“承认之后留下来的更窄结果/产物”，从 `cursor advancement recognition`、`cursor advancement result` 以及周边更大的 replay / recover / resume 对象里正式切出来。

## 2. `cursor advancement recognition result` 是什么

`cursor advancement recognition result` 第一版应被理解为：**某次位置推进结果跨过承认边界之后，留下来可继续交给下游消费的更窄结果/产物问题域。**

白话讲，它更像“推进结果过门槛以后，宿主最终留下来的那份可继续往下传的承认结果”，而不是：

- 推进承认整个问题域本身
- 推进结果整体本身
- 位置推进整个问题域本身
- 位置材料本身
- replay 整个过程本身
- replay 结束后交出的整包结果本身
- 完整恢复结果本身
- 完整续接结果本身

它更接近回答下面这些问题：

- 某次推进结果一旦被承认，宿主最后到底留下了什么更窄结果
- 这份更窄结果以什么身份继续交给 `recover` 或 `resume`
- 这份结果是否携带已被承认的位置落点信息
- 这份结果和完整 recognition 问题域、完整 advancement result 问题域、完整 recover / resume result 的边界在哪里

因此，`cursor advancement recognition result` 第一版冻结的核心是：

- 它是推进结果跨过承认边界之后留下的更窄结果/产物问题域
- 它站在 `cursor advancement recognition` 与下游消费动作之间
- 它可以被 `recover` 或 `resume` 继续消费
- 它不能冒充 `cursor advancement recognition`、`cursor advancement result`、`cursor advancement`、`cursor`、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table` 或运行对象

## 3. `cursor advancement recognition result` 不等于 `cursor advancement recognition` 整个问题域

### 3.1 recognition 更大，recognition result 更窄

`cursor advancement recognition` 更偏：

- 哪个推进结果已经跨过了承认边界
- 为什么这次跨越可以成立
- 哪些现象还只是推进线索，哪些现象已经可被正式承认

`cursor advancement recognition result` 则更偏：

- 跨过承认边界之后，最终留下来的那份更窄结果/产物
- 这份结果怎样继续交给下游消费

最小区别可以先压缩成：

- `cursor advancement recognition` 回答“推进结果何时、为何算被承认”
- `cursor advancement recognition result` 回答“被承认之后，最后留下了什么更窄结果给下游继续用”

### 3.2 有 recognition，不自动等于 recognition result 已单独成立

哪怕我们已经承认：

- 存在推进结果的承认边界
- 某些推进落点已经跨过承认门槛
- 恢复链路或续接链路需要消费被承认的推进结果

也不自动意味着：

- `cursor advancement recognition result` 已经被单独冻结
- “完成了一次承认”就自动等于“正式 recognition result 已经定型”
- recognition 整个问题域已经可以直接吞掉 recognition result 这份更窄产物

### 3.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 写成 `cursor advancement recognition` 的别名
- 把“推进结果已被承认”直接偷换成“recognition result 对象已经完整定义完毕”
- 用 recognition 整个问题域吞掉 recognition result 这份更窄产物边界

## 4. `cursor advancement recognition result` 不等于 `cursor advancement result` 整体

### 4.1 advancement result 是更大的结果壳，recognition result 是其中更窄的承认后结果

`cursor advancement result` 更偏：

- 一次推进判定之后留下了什么结果/产物
- 这些结果里哪些可能携带新的位置落点
- 哪些结果后续可能被承认并继续消费

`cursor advancement recognition result` 更偏：

- 这些推进结果里，哪一份已经跨过承认边界
- 跨过之后最终留下来的更窄结果是什么
- 这份更窄结果怎样被下游继续消费

最小区别可以先压缩成：

- `cursor advancement result` 回答“推进之后留下了什么结果”
- `cursor advancement recognition result` 回答“这些结果被承认之后，宿主最后留下哪份更窄结果继续往下传”

### 4.2 有 advancement result，不自动等于 recognition result 已成立

即使现实里已经出现：

- 单独的推进落点
- replay 之后留下的位置结果
- recovery result 里并列出现的位置字段

也只能说明推进结果壳有现实轮廓，不自动意味着：

- 这份推进结果已经跨过正式承认边界
- recognition result 的未来边界已经冻结
- 任一旧字段已经等于未来正式 recognition result

### 4.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 直接写成 `cursor advancement result`
- 把“有推进结果”直接偷换成“recognition result 已经成立”
- 用整个 advancement result 结果壳吞掉 recognition result 这份更窄产物

## 5. `cursor advancement recognition result` 不等于 `cursor advancement`

### 5.1 advancement 是更大的问题域，recognition result 是承认后留下的更窄产物

`cursor advancement` 更偏：

- 位置是否推进
- 推进到哪里
- 推进结果怎样被承认

`cursor advancement recognition result` 则只盯住其中最窄的一段：

- 某次推进结果已经被承认之后，留下了什么更窄结果/产物
- 这份产物怎样继续交给下游消费

最小区别可以先压缩成：

- `cursor advancement` 回答“推进问题域整体是什么”
- `cursor advancement recognition result` 回答“推进结果被承认以后，最后留下了什么更窄产物”

### 5.2 没有 recognition result，advancement 问题域也可以先成立

哪怕我们已经承认：

- replay 邻域里存在位置推进问题
- 推进会形成某种结果线索
- 推进结果何时被承认是独立问题

也不自动意味着：

- `cursor advancement recognition result` 已经单独冻结
- advancement 整个问题域已经可以覆盖 recognition result
- 任一推进落点都已经自动等于未来正式 recognition result

### 5.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 写成 `cursor advancement` 的别名
- 把“推进问题存在”直接偷换成“recognition result 已正式成立”
- 用完整 advancement 问题域吞掉 recognition result 这份更窄产物

## 6. `cursor advancement recognition result` 不等于 `cursor` 本体

### 6.1 `cursor` 是位置材料，recognition result 是承认后留下的结果/产物

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 当前位置是什么
- 从哪里继续读
- 当前记录落在什么位置

`cursor advancement recognition result` 则回答的是：

- 某次推进结果被承认之后，最后留下了什么更窄结果
- 这份结果是否携带已被承认的位置落点信息
- 这份结果怎样继续交给下游消费

### 6.2 它可以携带已被承认的位置落点信息，但不能和 `cursor` 本体混成一层

第一版必须明确：

- `cursor advancement recognition result` 可能携带已被承认的位置落点信息
- 但“携带已被承认的位置落点信息”不等于“它就是 `cursor` 本体”
- `cursor` 仍然是材料层，recognition result 仍然是承认之后留下的更窄结果层

### 6.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 直接写成 `cursor`
- 因为旧代码里出现 `resumeCursor`，就把单个位置字段直接写成完整 recognition result
- 把“有位置字段”直接偷换成“recognition result 边界已经完整定义”

## 7. `cursor advancement recognition result` 不等于 `journal replay`

### 7.1 replay 更大，recognition result 更窄

`journal replay` 更偏：

- 读取 journal 材料
- 整理事件
- 重放事件
- 为恢复链路形成可继续消费的输入

`cursor advancement recognition result` 只处理其中更窄的一段：

- replay 邻域里某次推进结果跨过承认边界之后，最终留下的更窄结果/产物

因此，第一版必须明确：

- `cursor advancement recognition result` 可以落在 replay 邻域
- 但它不等于 replay 整个过程
- 它不能被写成 replay 的总代名词

### 7.2 replay 可以存在，而 recognition result 仍然只是其中一份更窄产物

哪怕现实代码里已经有：

- `readFromCursor(...)`
- `readRunEvents(...)`
- replay 之后继续做 state projection 的路径

也只能说明 replay 问题域已经有现实轮廓，不自动意味着：

- recognition result schema 已经冻结
- replay 读完就自动等于“正式 recognition result 已成立”
- replay 过程本身已经完全吞掉 recognition result 这份更窄产物

### 7.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 写成“把 replay 跑完之后的一切”
- 把 replay window / batch / cursor policy 偷换成 recognition result 定义
- 因为 replay 会读到新位置，就把 recognition result 并回 replay 总体

## 8. `cursor advancement recognition result` 不等于 `journal replay result`

### 8.1 replay result 是更大的结果壳，recognition result 只是其中更窄的一条承认后结果线

`journal replay result` 更偏 replay 结束后交出来的一组可继续消费的结果/产物。

`cursor advancement recognition result` 则更偏其中关于推进承认后结果的那条更窄结果线：

- 哪个推进结果已经被承认
- 被承认后最终留下什么更窄结果
- 这份更窄结果怎样继续交给下游

因此，第一版必须明确：

- `cursor advancement recognition result` 可能出现在 replay result 邻域
- 它甚至可能被 replay result 承载
- 但它不等于 replay result 整体

### 8.2 recognition result 可以被 replay result 承载，但不能被 replay result 吞掉

现实里一份 replay result 可能同时带有：

- replayed events
- 位置推进结果
- 其他恢复链路继续消费的产物

这说明：

- `cursor advancement recognition result` 可能紧贴 result 邻域出现
- 但它仍然只是更窄的承认后结果问题域
- 不能因为它落在 replay result 旁边，就把它写成 replay result 的全部

### 8.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 直接写成 `journal replay result`
- 把 replay result 里的其他事件结果、恢复输入结果一并并入 recognition result 定义
- 把“result 里带有推进承认线索”偷换成“recognition result 已经等于整包 replay result”

## 9. `cursor advancement recognition result` 不等于 `recover`

### 9.1 `recover` 更偏找回可用状态基础

`recover` 处理的是：

- 如何结合 checkpoint、snapshot、journal、cursor 等恢复材料
- 找回一份可继续使用的状态基础

`cursor advancement recognition result` 只处理其中更窄的一块：

- 哪份推进结果已经被承认之后留下了什么更窄结果
- 这份更窄结果能否继续交给恢复链路消费

因此：

- `cursor advancement recognition result` 可以被 `recover` 消费
- 但它不能冒充整个恢复动作

### 9.2 recognition result 只能提供被承认后的推进结果，不能冒充完整恢复结果

即使某次 recognition result 已经表明：

- 某个推进落点已被承认
- 这份承认后的结果可以交给恢复链路继续消费

也不等于：

- 状态已经完整找回
- 恢复已经收口
- 完整 recover result 已经成立

### 9.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 写成“恢复完成结果”
- 把“推进承认结果已留下”写成“恢复已经完成”
- 把 recognition result 直接写成完整 recover result

## 10. `cursor advancement recognition result` 不等于 `resume`

### 10.1 `resume` 更偏让已有过程继续推进

`resume` 更偏：

- 利用已经可继续的状态
- 让已有过程重新往前走

`cursor advancement recognition result` 则更偏：

- 为续接链路交出一份已被承认、可继续消费的更窄结果

因此：

- `cursor advancement recognition result` 可以被 `resume` 消费
- 但它不等于 `resume`

### 10.2 recognition result 不能冒充完整续接结果

即使某次 recognition result 已经表明：

- replay 从旧位置推进到了新位置
- 这个位置落点已经跨过承认边界
- 承认之后留下了一份可继续交给续接链路消费的结果

也不等于：

- 原过程已经成功续跑
- 所有运行对象已经恢复完成
- 完整 resume result 已经成立

### 10.3 第一版必须排除的混写

- 把 `cursor advancement recognition result` 写成 resume result 本身
- 把“已被承认的位置结果已留下”写成“原过程已经续接完成”
- 把 recognition result 偷换成完整 resume 完成结果

## 11. `cursor advancement recognition result` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `cursor advancement recognition result` 不是正式装配结果
- 它不能直接宣称为 `runtime-table`
- 它也不能反向重写正式运行态定义

哪怕 recognition result 会影响恢复链路或续接链路怎样继续接近正式运行态，也不等于它本身已经是装配中心对象。

## 12. `cursor advancement recognition result` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `cursor advancement recognition result` 只是在 replay / 恢复 / 续接链路周边，留下的一份更窄、可继续消费的承认结果。

因此，第一版必须明确：

- recognition result 不是运行对象本体
- recognition result 不能冒充活的运行时容器
- recognition result 成立不等于运行对象已经恢复成立

## 13. 为什么它更像“承认之后留下、可被继续消费的结果/产物”

### 13.1 它处理的是“承认后留下了什么”，不是“承认边界怎么定义”的全貌

如果只谈 `cursor advancement recognition`，我们谈的是：

- 什么时候算被承认
- 为什么可以被承认
- 哪些现象仍只是推进线索

一旦谈 `cursor advancement recognition result`，问题马上缩成：

- 这次承认之后，最后留下了什么更窄结果/产物
- 这份结果现在怎样继续交给下游消费

这说明它本质上更像承认之后留下的结果层，而不是完整承认问题域。

### 13.2 它处理的是“被承认后的结果壳”，不是“推进结果整体壳”的全貌

如果只谈 `cursor advancement result`，我们只是在谈：

- 推进之后留下了什么结果/产物

而 `cursor advancement recognition result` 更像在说：

- 这些结果里哪一份已经跨过了承认边界
- 跨过之后，宿主最后保留下哪份更窄结果继续往下传

所以它不是推进结果整体壳，而是围绕“被承认之后留下什么”形成的更窄结果壳。

### 13.3 它处理的是“可继续消费的承认后结果”，不是“下游动作完成宣告”

如果只谈 `recover` 或 `resume`，重点分别在于：

- 状态怎样找回
- 原过程怎样续接

而 `cursor advancement recognition result` 更像在说：

- 哪份推进结果已经以承认后的身份留下
- 这份结果现在是否足够交给下游继续消费

所以它更像“承认后留下的结果/产物”，而不是完整恢复动作或完整续接动作的完成宣告。

## 14. 它可以被 `recover` 或 `resume` 消费，但不能冒充完整恢复结果或完整续接结果

第一版必须把这层关系单独冻住：

- `recover` 可以消费 `cursor advancement recognition result`
- `resume` 也可以消费 `cursor advancement recognition result`
- 但它们消费的是“被承认之后留下的一份更窄结果”，不是拿它来顶替整个恢复结果或整个续接结果

白话讲，`cursor advancement recognition result` 更像恢复链路和续接链路手里的一张“承认后可继续往下走的结果凭据”，但这张凭据本身不等于整条恢复路或续接路已经走完。

因此，第一版必须排除下面这些混写：

- 把 `cursor advancement recognition result` 直接宣布为 recover 的最终结果
- 把 `cursor advancement recognition result` 直接宣布为 resume 的最终结果
- 因为 recover / resume 会消费它，就把它抬成 recover / resume 的总代名词

## 15. `cursor advancement recognition result` 的最小层级关系

可以先把 `cursor advancement recognition result` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> cursor advancement 问题域判断位置是否推进、推进到哪里、怎样被承认
  -> cursor advancement result 留下推进之后的结果壳
  -> cursor advancement recognition 判断哪些推进结果已跨过承认边界
  -> 留下 cursor advancement recognition result
  -> recover / resume 继续消费这份更窄结果
  -> 进一步回到可继续运行的正式状态
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `cursor advancement recognition result` 站在 `cursor advancement recognition` 与下游消费动作之间
- 它可能携带已被承认的位置落点信息
- 它不能和 `cursor` 本体混成一层
- 它不能和完整 recognition 问题域、完整 advancement result 问题域、完整 replay result、完整 recover result、完整 resume result 混成一层

## 16. 现实锚点

下面这些现实锚点只用于证明：`cursor advancement recognition result` 这个承认后结果/产物问题域，在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 16.1 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现非常直接的现实信号：

- `recoverFromCheckpoint(...)` 会先根据 `checkpoint?.record.journalCursor` 决定读取起点
- replay 出来的结果会单独落成 `replayedEvents`
- 推进后的落点会单独落成 `resumeCursor`
- 返回值会把 `replayedEvents` 与 `resumeCursor` 分开交出

这些现象支持本文判断：

- 旧代码里已经存在“推进之后留下结果壳”的现实表达
- 旧代码里也已经存在“某个位置落点会被单独交给下游继续使用”的现实表达
- 但这些现实表达首先证明的是“存在承认后可继续消费的更窄结果轮廓”，不等于未来正式 `cursor advancement recognition result` 已经被字段名钉死

但本文同时明确：

- `resumeCursor`
- `journalCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 16.2 `src/agent_core/checkpoint/checkpoint-types.ts`

当前恢复类型里，`CheckpointRecoveryResult` 已经把几类东西拆开表达：

- `replayedEvents`
- `resumeCursor`

这个现实形状至少说明：

- 旧实现已经在尝试把“replay 产物”和“可继续使用的位置落点”拆开
- “可继续使用的位置落点”并没有天然等于 replay 整体
- 这很适合作为我们冻结 `cursor advancement recognition result` 的现实旁证

但这里仍然只是现实证据，不是未来标准 schema。

### 16.3 `src/agent_core/journal/append-only-log.ts` 与 `src/agent_core/runtime.ts`

当前仓库里还能看到明显分层的现实信号：

- `readFromCursor(...)` 负责从某个位置之后继续读取
- `readRunEvents(...)` 负责按 run 读取已有事件材料
- `recoverAndHydrateTapRuntime(runId)` 把 recover 与 hydrate 相邻承接
- `continueRecoveredTapRuntime(runId)` 则继续处理恢复之后的续接动作

这些路径说明：

- replay
- recover
- hydrate
- continue / resume

在现实代码里已经天然分层。

这反过来支持本文判断：

- `cursor advancement recognition result` 最适合被理解成夹在承认边界与下游消费之间的更窄结果/产物
- 它可以被恢复链路或续接链路消费
- 但它不能被直接写成 replay、recover、resume 或运行对象本身

## 17. 第一版结论

`cursor advancement recognition result` 第一版要冻结的，不是完整 acceptance 协议，也不是最终 schema，而是下面这条最小结论：

- 它不是 `cursor advancement recognition` 整个问题域
- 它不是 `cursor advancement result` 整体
- 它不是 `cursor advancement`
- 它不是 `cursor` 本体
- 它不是 `journal replay`
- 它不是 `journal replay result`
- 它不是 `recover`
- 它不是 `resume`
- 它不是 `runtime-table`
- 它不是运行对象本身
- 它更像推进结果被承认之后留下、可被恢复链路或续接链路继续消费的更窄结果/产物
- 它可以携带已被承认的位置落点信息
- 它可以被 `recover` 或 `resume` 消费
- 但它不能冒充完整恢复结果或完整续接结果

这就是 `cursor advancement recognition result` 在 Praxis 宿主中的正式定位基线。
