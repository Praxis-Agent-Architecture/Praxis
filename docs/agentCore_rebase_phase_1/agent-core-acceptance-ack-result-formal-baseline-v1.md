# agentCore `acceptance / ack result` 正式基线 v1

## 1. 定位

本文是：

- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-recognition-formal-baseline-v1.md`
- `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-recognition-result-formal-baseline-v1.md`

的继续下钻文，专门冻结 `acceptance / ack result` 在 Praxis 宿主中的正式对象定位。

本文只处理一件事：

- `acceptance / ack result` 在 Praxis 宿主里到底是什么
- 为什么它与 `cursor advancement recognition`、`cursor advancement recognition result`、`cursor advancement result`、`cursor advancement`、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么它更像“某份推进结果或承认结果一旦被宿主接受/确认，最后留下来、可供下游继续消费的那份更具体结果/产物”，而不是这些上位对象的别名
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 acceptance / ack 条件集合、最终 rule table、最终 result schema / 枚举、冲突合并/去重/幂等细则、replay window / batch / cursor policy，以及最终 serialization / DSL / JSON 字段名

本文不重复宿主总纲，也不重复 `cursor advancement`、`cursor advancement result`、`cursor advancement recognition`、`cursor advancement recognition result`、`journal replay`、`journal replay result`、`runtime resume / recover / hydrate`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 acceptance / ack 条件集合
- 最终 rule table
- 最终 result schema
- 最终 result 枚举
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名
- 任何最终枚举名

第一版的目标不是一次性把 acceptance / ack 协议做完，而是先把 `acceptance / ack result` 这个“接受/确认之后真正留下来的更具体结果/产物”，从 `cursor advancement recognition`、`cursor advancement recognition result`、`cursor advancement result` 以及周边更大的 replay / recover / resume 对象里正式切出来。

## 2. `acceptance / ack result` 是什么

`acceptance / ack result` 第一版应被理解为：**某份推进结果或承认结果跨过宿主的接受/确认边界之后，最后留下来、可继续交给下游消费的那份更具体结果/产物问题域。**

白话讲，它更像“宿主点头以后，真正留下来的那张可继续往下走的小结果凭据”，而不是：

- 推进承认整个问题域本身
- 推进承认之后的整包结果壳本身
- 位置推进整个问题域本身
- 位置材料本身
- replay 整个过程本身
- replay 结束后交出的整包结果本身
- 完整恢复结果本身
- 完整续接结果本身

它更接近回答下面这些问题：

- 某份推进结果或承认结果一旦被宿主接受/确认，最后到底留下什么更具体结果
- 这份更具体结果以什么最小身份继续交给 `recover` 或 `resume`
- 这份结果是否会携带已被接受/确认的位置落点信息
- 这份结果和完整 recognition 问题域、完整 recognition result、完整 advancement result、完整 recover / resume 结果的边界在哪里

因此，`acceptance / ack result` 第一版冻结的核心是：

- 它是接受/确认之后留下的更具体结果/产物问题域
- 它站在承认边界已经成立之后，与下游消费动作之间
- 它可以被 `recover` 或 `resume` 继续消费
- 它不能冒充 `cursor advancement recognition`、`cursor advancement recognition result`、`cursor advancement result`、`cursor advancement`、`cursor`、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table` 或运行对象

## 3. `acceptance / ack result` 不等于 `cursor advancement recognition` 整个问题域

### 3.1 recognition 更大，`acceptance / ack result` 更窄

`cursor advancement recognition` 更偏：

- 哪个推进结果已经跨过了承认边界
- 为什么这次跨越可以成立
- 哪些现象仍只是推进线索，哪些现象已经可被正式承认

`acceptance / ack result` 则更偏：

- 承认边界已经成立之后，最后到底留下哪份更具体结果
- 这份更具体结果怎样继续交给下游消费

最小区别可以先压缩成：

- `cursor advancement recognition` 回答“什么时候、为什么算被承认”
- `acceptance / ack result` 回答“被接受/确认以后，最后留下什么更具体结果给下游继续用”

### 3.2 有 recognition，不自动等于 `acceptance / ack result` 已单独成立

哪怕我们已经承认：

- 存在推进结果的承认边界
- 某些推进落点已经跨过承认门槛
- 恢复链路或续接链路需要消费被承认的推进结果

也不自动意味着：

- `acceptance / ack result` 已经被单独冻结
- “完成了一次承认”就自动等于“正式 acceptance / ack result 已经定型”
- recognition 整个问题域已经可以直接吞掉 `acceptance / ack result` 这份更窄产物

### 3.3 第一版必须排除的混写

- 把 `acceptance / ack result` 写成 `cursor advancement recognition` 的别名
- 把“推进结果已被承认”直接偷换成“acceptance / ack result 对象已经完整定义完毕”
- 用 recognition 整个问题域吞掉 `acceptance / ack result` 这份更窄产物边界

## 4. `acceptance / ack result` 不等于 `cursor advancement recognition result` 整体

### 4.1 recognition result 是更大的承认后结果壳，`acceptance / ack result` 是其中更具体的一层

`cursor advancement recognition result` 更偏：

- 某份推进结果跨过承认边界之后，留下来可继续交给下游消费的更窄结果/产物

`acceptance / ack result` 则更偏：

- 这份承认后结果里，哪一份已经被宿主真正接受/确认
- 被接受/确认之后，最后保留下来的那份更具体结果是什么
- 这份更具体结果怎样继续交给下游消费

最小区别可以先压缩成：

- `cursor advancement recognition result` 回答“承认之后留下了什么结果壳”
- `acceptance / ack result` 回答“这些承认后结果里，宿主最终接受/确认并保留下哪份更具体结果继续往下传”

### 4.2 有 recognition result，不自动等于 `acceptance / ack result` 已成立

即使现实里已经出现：

- 某份被承认的位置落点结果
- 一份可以交给恢复链路或续接链路继续消费的 recognition result
- 若干承认后结果壳并列出现

也只能说明 recognition result 问题域有现实轮廓，不自动意味着：

- 宿主最终 acceptance / ack 边界已经冻结
- recognition result 整体已经等于最终 acceptance / ack result
- 任一旧字段、旧状态或旧函数已经等于未来正式 acceptance / ack result

### 4.3 第一版必须排除的混写

- 把 `acceptance / ack result` 直接写成 `cursor advancement recognition result`
- 把“承认后已经有结果壳”直接偷换成“acceptance / ack result 已经成立”
- 用 recognition result 整体吞掉 `acceptance / ack result` 这份更具体产物

## 5. `acceptance / ack result` 不等于 `cursor advancement result`

### 5.1 advancement result 是更大的推进结果壳，`acceptance / ack result` 是接受/确认后的更具体产物

`cursor advancement result` 更偏：

- 一次推进判定之后留下了什么结果/产物
- 这些结果里哪些可能携带新的位置落点
- 哪些结果后续可能被承认并继续消费

`acceptance / ack result` 更偏：

- 这些推进结果里，哪一份已经被宿主接受/确认
- 接受/确认之后最终留下来的那份更具体结果是什么
- 这份结果怎样被下游继续消费

最小区别可以先压缩成：

- `cursor advancement result` 回答“推进之后留下了什么结果”
- `acceptance / ack result` 回答“这些结果被宿主接受/确认以后，最后留下哪份更具体结果继续往下传”

### 5.2 有 advancement result，不自动等于 `acceptance / ack result` 已成立

即使现实里已经出现：

- 单独的推进落点
- replay 之后留下的位置结果
- recovery result 里并列出现的位置字段

也只能说明推进结果壳有现实轮廓，不自动意味着：

- 这份推进结果已经被宿主正式接受/确认
- acceptance / ack result 的未来边界已经冻结
- 任一旧字段已经等于未来正式 acceptance / ack result

### 5.3 第一版必须排除的混写

- 把 `acceptance / ack result` 直接写成 `cursor advancement result`
- 把“有推进结果”直接偷换成“acceptance / ack result 已经成立”
- 用整个 advancement result 结果壳吞掉 `acceptance / ack result` 这份更具体产物

## 6. `acceptance / ack result` 不等于 `cursor advancement`

### 6.1 advancement 是更大的问题域，`acceptance / ack result` 是接受/确认后留下的更具体产物

`cursor advancement` 更偏：

- 位置是否推进
- 推进到哪里
- 推进结果怎样被承认

`acceptance / ack result` 则只盯住其中最窄的一段：

- 某份推进结果或承认结果已经被宿主接受/确认之后，最后留下了什么更具体结果
- 这份更具体结果怎样继续交给下游消费

最小区别可以先压缩成：

- `cursor advancement` 回答“推进问题域整体是什么”
- `acceptance / ack result` 回答“推进或承认相关结果被宿主接受/确认以后，最后留下了什么更具体产物”

### 6.2 没有 `acceptance / ack result`，advancement 问题域也可以先成立

哪怕我们已经承认：

- replay 邻域里存在位置推进问题
- 推进会形成某种结果线索
- 推进结果何时被承认是独立问题

也不自动意味着：

- `acceptance / ack result` 已经单独冻结
- advancement 整个问题域已经可以覆盖 `acceptance / ack result`
- 任一推进落点都已经自动等于未来正式 acceptance / ack result

### 6.3 第一版必须排除的混写

- 把 `acceptance / ack result` 写成 `cursor advancement` 的别名
- 把“推进问题存在”直接偷换成“acceptance / ack result 已正式成立”
- 用完整 advancement 问题域吞掉 `acceptance / ack result` 这份更具体产物

## 7. `acceptance / ack result` 不等于 `cursor` 本体

### 7.1 `cursor` 是位置材料，`acceptance / ack result` 是接受/确认后留下的结果/产物

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 当前位置是什么
- 从哪里继续读
- 当前记录落在什么位置

`acceptance / ack result` 则回答的是：

- 某份推进结果或承认结果被宿主接受/确认之后，最后留下了什么更具体结果
- 这份结果是否携带已被接受/确认的位置落点信息
- 这份结果怎样继续交给下游消费

### 7.2 它可以携带已被接受/确认的位置落点信息，但不能和 `cursor` 本体混成一层

第一版必须明确：

- `acceptance / ack result` 可能携带已被接受/确认的位置落点信息
- 但“携带已被接受/确认的位置落点信息”不等于“它就是 `cursor` 本体”
- `cursor` 仍然是材料层，`acceptance / ack result` 仍然是接受/确认之后留下的更具体结果层

### 7.3 第一版必须排除的混写

- 把 `acceptance / ack result` 直接写成 `cursor`
- 因为旧代码里出现 `resumeCursor`，就把单个位置字段直接写成完整 acceptance / ack result
- 把“有位置字段”直接偷换成“acceptance / ack result 边界已经完整定义”

## 8. `acceptance / ack result` 不等于 `journal replay` 或 `journal replay result`

### 8.1 replay 更大，replay result 也是更大的结果壳，`acceptance / ack result` 只是其中更具体的一份接受/确认后产物

`journal replay` 更偏：

- 读取 journal 材料
- 整理事件
- 重放事件
- 为恢复链路形成可继续消费的输入

`journal replay result` 更偏：

- replay 结束后交出来的一组可继续消费的结果/产物

`acceptance / ack result` 则只处理其中更窄的一段：

- replay 邻域里某份推进结果或承认结果被宿主接受/确认之后，最终留下的那份更具体结果/产物

因此，第一版必须明确：

- `acceptance / ack result` 可以落在 replay 邻域
- 它甚至可能被 replay result 邻域承载
- 但它不等于 replay 整个过程
- 它也不等于 replay 结束后交出的整包结果

### 8.2 replay 或 replay result 可以存在，而 `acceptance / ack result` 仍然只是其中一份更具体产物

哪怕现实代码里已经有：

- `readFromCursor(...)`
- `readRunEvents(...)`
- `replayedEvents`
- replay 之后继续做 state projection 的路径

也只能说明 replay 问题域与 replay result 问题域已经有现实轮廓，不自动意味着：

- acceptance / ack 条件集合已经冻结
- replay 跑完就自动等于“正式 acceptance / ack result 已成立”
- replay result 整体已经完全吞掉 `acceptance / ack result`

### 8.3 第一版必须排除的混写

- 把 `acceptance / ack result` 直接写成 `journal replay`
- 把 `acceptance / ack result` 直接写成 `journal replay result`
- 把 replay window / batch / cursor policy 偷换成 acceptance / ack result 定义
- 因为 replay 会读到新位置，就把 acceptance / ack result 并回 replay 总体

## 9. `acceptance / ack result` 不等于 `recover` 或 `resume`

### 9.1 `recover` 与 `resume` 更偏动作链路，`acceptance / ack result` 更偏被接受后留下的更具体产物

`recover` 更偏：

- 如何结合 checkpoint、snapshot、journal、cursor 等恢复材料
- 找回一份可继续使用的状态基础

`resume` 更偏：

- 利用已经可继续的状态
- 让已有过程重新往前走

`acceptance / ack result` 更偏：

- 某份推进结果或承认结果被宿主接受/确认之后，留下哪份更具体产物
- 这份产物能否继续交给恢复链路或续接链路消费

因此：

- `acceptance / ack result` 可以被 `recover` 消费
- `acceptance / ack result` 也可以被 `resume` 消费
- 但它不能冒充整个恢复动作或整个续接动作

### 9.2 它可以被 `recover` 或 `resume` 消费，但不能冒充完整恢复结果或完整续接结果

即使某次 `acceptance / ack result` 已经表明：

- 某个推进落点已被宿主接受/确认
- 这份接受/确认后的结果可以交给恢复链路继续消费
- 或这份结果可以交给续接链路继续消费

也不等于：

- 状态已经完整找回
- 恢复已经收口
- 原过程已经成功续跑
- 完整 recover result 或完整 resume result 已经成立

白话讲，`acceptance / ack result` 更像恢复链路和续接链路手里的一张“宿主已经确认可往下走”的小凭据，但这张凭据本身不等于整条恢复路或续接路已经走完。

### 9.3 第一版必须排除的混写

- 把 `acceptance / ack result` 直接宣布为 recover 的最终结果
- 把 `acceptance / ack result` 直接宣布为 resume 的最终结果
- 因为 recover / resume 会消费它，就把它抬成 recover / resume 的总代名词

## 10. `acceptance / ack result` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `acceptance / ack result` 不是正式装配结果
- 它不能直接宣称为 `runtime-table`
- 它也不能反向重写正式运行态定义

哪怕某份 acceptance / ack result 会影响恢复链路或续接链路怎样继续接近正式运行态，也不等于它本身已经是装配中心对象。

## 11. `acceptance / ack result` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `acceptance / ack result` 只是在 replay / 恢复 / 续接链路周边，留下的一份更具体、可继续消费的接受/确认结果。

因此，第一版必须明确：

- acceptance / ack result 不是运行对象本体
- acceptance / ack result 不能冒充活的运行时容器
- acceptance / ack result 成立不等于运行对象已经恢复成立

## 12. 为什么它更像“接受/确认之后留下、可继续消费的结果/产物”

### 12.1 它处理的是“最后留下了什么”，不是“接受/确认问题域怎么定义”的全貌

如果只谈 `cursor advancement recognition`，我们谈的是：

- 什么时候算被承认
- 为什么可以被承认
- 哪些现象仍只是推进线索

如果只谈 `cursor advancement recognition result`，我们谈的是：

- 承认之后留下了什么结果壳

一旦谈 `acceptance / ack result`，问题进一步缩成：

- 这些承认后结果里，宿主最终接受/确认并保留下哪份更具体结果
- 这份结果怎样继续交给下游消费

这说明它本质上更像接受/确认之后留下的结果层，而不是完整承认问题域或完整承认后结果壳。

### 12.2 它处理的是“被接受/确认后的可继续消费结果”，不是“位置材料本体”

如果只谈 `cursor`，我们只是在谈一个位置材料。

而 `acceptance / ack result` 更像在说：

- 哪个位置落点或相关结果已经被宿主接受/确认
- 这份被接受/确认后的更具体结果现在能不能继续交给下游

所以它不是位置材料本体，而是围绕位置推进/承认之后形成的更具体结果。

### 12.3 它处理的是“被接受/确认后留下的结果凭据”，不是“下游动作完成宣告”

如果只谈 `recover` 或 `resume`，重点分别在于：

- 状态怎样找回
- 原过程怎样续接

而 `acceptance / ack result` 更像在说：

- 哪份推进结果或承认结果已经被宿主接受/确认
- 这份结果现在是否足够交给下游继续消费

所以它更像“接受/确认之后留下的结果/产物”，而不是完整恢复动作或完整续接动作的完成宣告。

## 13. `acceptance / ack result` 的最小层级关系

可以先把 `acceptance / ack result` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> cursor advancement 问题域判断位置是否推进、推进到哪里、怎样被承认
  -> cursor advancement result 留下推进之后的结果壳
  -> cursor advancement recognition 判断哪些推进结果已跨过承认边界
  -> cursor advancement recognition result 留下承认后的结果壳
  -> 宿主接受/确认其中可继续消费的那份更具体结果
  -> 留下 acceptance / ack result
  -> recover / resume 继续消费这份更具体结果
  -> 进一步回到可继续运行的正式状态
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `acceptance / ack result` 站在接受/确认已经成立之后，与下游消费动作之间
- 它可能携带已被接受/确认的位置落点信息
- 它不能和 `cursor` 本体混成一层
- 它不能和完整 recognition 问题域、完整 recognition result 问题域、完整 advancement result 问题域、完整 replay result、完整 recover result、完整 resume result 混成一层

## 14. 现实锚点

下面这些现实锚点只用于证明：`acceptance / ack result` 这个“接受/确认之后留下来的更具体结果/产物”问题域，在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 14.1 `src/agent_core/types/kernel-results.ts`

当前内核响应类型已经明确出现接受态：

- `CapabilityPortResponse.status` 里包含 `accepted`

这些现象支持本文判断：

- 宿主现实里已经承认“请求/结果进入 accepted 态”这种边界存在
- 但 `accepted` 只是一个状态信号，不自动等于未来正式 `acceptance / ack result`

本文同时明确：

- `accepted`

这个旧状态名只是现实证据，不直接升格成未来标准。

### 14.2 `src/agent_core/cmp-runtime/runtime-types.ts`

CMP 运行态里已经出现两类很直接的接受/确认信号：

- `CMP_PROJECTION_VISIBILITIES` 里包含 `accepted_by_parent`
- `CMP_DELIVERY_STATUSES` 里包含 `acknowledged`

这些现象支持本文判断：

- 旧实现已经把“被上游接受”与“被下游确认”当成独立可表达的边界
- 这些边界成立以后，现实里通常会留下某种可继续消费的结果状态
- 但这些状态枚举首先证明的是“accept / ack 边界真实存在”，不等于未来正式 `acceptance / ack result` 已被这些名字钉死

本文同时明确：

- `accepted_by_parent`
- `acknowledged`

这些旧状态名只是现实证据，不直接升格成未来标准。

### 14.3 `src/agent_core/cmp-runtime/delivery.ts` 与 `delivery-routing.ts`

当前 CMP 交付链路里，确认动作和结果壳已经被明确拆开：

- `CmpDispatchReceipt` 会单独保存 `status`、`deliveredAt`、`acknowledgedAt`
- `acknowledgeCmpDispatchReceipt(...)` 只允许把 `delivered` receipt 推进到 `acknowledged`
- `acknowledgeCmpCoreAgentReturn(...)` 说明 core-agent return 也存在单独的 ack 收口动作

这些现象支持本文判断：

- 旧实现里已经存在“某个结果或回执被确认以后，留下一个可继续读回的结果壳”这种现实结构
- 这个结果壳更接近 `acceptance / ack result` 所说的对象轮廓，而不是完整动作本身

但本文同时明确：

- `CmpDispatchReceipt`
- `acknowledgedAt`
- `acknowledgeCmpDispatchReceipt(...)`
- `acknowledgeCmpCoreAgentReturn(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 14.4 `src/agent_core/cmp-runtime/mq-delivery-state.ts`

当前 MQ delivery 状态机也把 ack 后结果单独保留了出来：

- `acknowledgeCmpMqDeliveryState(...)` 会把 `published` 状态推进成 `acknowledged`
- 结果记录里会单独保留 `acknowledgedAt`

这些现象支持本文判断：

- 现实里已经存在“ack 动作完成之后，留下一个可继续读回和继续消费的状态结果”
- 但“ack 后留下状态”不自动等于未来正式 `acceptance / ack result` 的完整 schema

本文同时明确：

- `acknowledgeCmpMqDeliveryState(...)`
- `acknowledgedAt`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 14.5 `src/agent_core/checkpoint/checkpoint-types.ts` 与 `checkpoint-recovery.ts`

当前恢复实现已经出现“下游继续消费某份更具体结果”的现实信号：

- `CheckpointRecoveryResult` 会单独带出 `replayedEvents` 与 `resumeCursor`
- `recoverFromCheckpoint(...)` 会把 replay 之后的落点单独交成 `resumeCursor`

这些现象支持本文判断：

- 旧实现里已经存在“某份位置相关结果被单独留下，并继续交给恢复链路消费”的现实表达
- `acceptance / ack result` 第一版可以参考这种“更具体结果会被单独留下给下游继续用”的结构直觉
- 但 `resumeCursor` 或 `CheckpointRecoveryResult` 本身不等于未来正式 `acceptance / ack result`

本文同时明确：

- `CheckpointRecoveryResult`
- `replayedEvents`
- `resumeCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

## 15. 第一版冻结重点

`acceptance / ack result` 第一版的冻结重点可以压缩为六点：

- 它是某份推进结果或承认结果被宿主接受/确认之后，最后留下来的更具体结果/产物
- 它不等于 `cursor advancement recognition` 整个问题域
- 它不等于 `cursor advancement recognition result` 整体
- 它不等于 `cursor advancement result`、`cursor advancement`、`cursor`、`journal replay`、`journal replay result`
- 它可以被 `recover` 或 `resume` 消费，但不能冒充完整 recover result 或完整 resume result
- 旧代码里的字段名、函数名、状态名只作为现实证据，不直接升格成未来标准

## 16. 本文明确不做什么

为给后续 acceptance / ack 子系统保留演进空间，本文明确不做以下事情：

- 不定义最终 acceptance / ack 条件集合
- 不定义最终 rule table
- 不定义最终 result schema / 枚举
- 不定义冲突合并/去重/幂等细则
- 不定义 replay window / batch / cursor policy
- 不定义最终 serialization / DSL / JSON 字段名

第一版先做的，只是把 `acceptance / ack result` 这份对象边界固定下来，避免后续把“接受/确认问题域”“承认后结果壳”“推进结果壳”“恢复结果”“续接结果”混写成同一个对象。
