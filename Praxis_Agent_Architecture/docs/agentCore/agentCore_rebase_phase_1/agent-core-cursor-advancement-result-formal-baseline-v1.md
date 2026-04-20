# agentCore `cursor advancement result` 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-cursor-advancement-formal-baseline-v1.md` 的继续下钻文，专门冻结 `cursor advancement result` 在 Praxis 宿主中的正式对象定位。

本文只处理一件事：

- `cursor advancement result` 在 Praxis 宿主里到底是什么
- 为什么它与 `cursor advancement` 过程/问题域、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象都有关，但它不等于这些对象本身
- 为什么它更像“推进之后留下、可被下游承认和继续消费的结果/产物”，而不是这些上位对象的别名
- 为什么第一版只冻结对象定位、边界与关系，不冻结最终 result schema、最终承认规则表、冲突合并/去重/幂等细则、replay window / batch / cursor policy，以及最终 serialization / DSL / JSON 字段名 / 枚举

本文不重复宿主总纲，也不重复 `cursor advancement`、`journal replay`、`journal replay result`、`runtime resume / recover / hydrate`、`journal / receipt / cursor / reconciliation`、`runtime-table` 已经冻结的上层结论。

本文明确不冻结以下内容：

- 最终 result schema
- 最终承认规则表
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 serialization 方案
- 最终 DSL 关键字
- 任何 JSON 字段名
- 任何最终枚举名

第一版的目标不是一次性把位置推进结果协议做完，而是先把 `cursor advancement result` 这个结果/产物问题域，从 `cursor advancement` 整个问题域以及周边上位对象里正式切出来。

## 2. `cursor advancement result` 是什么

`cursor advancement result` 第一版应被理解为：**围绕一次位置推进判定之后，留下来的、可被下游承认并继续消费的结果/产物问题域。**

白话讲，它更像“这次推进判定最后留下了什么可以拿去继续用的结果”，而不是：

- 推进判定过程本身
- 位置材料本身
- replay 整个过程本身
- replay 结束后交出的整包结果本身
- 完整恢复结果本身
- 完整续接结果本身

它更接近回答下面这些问题：

- 这次推进判定最后留下了什么可被承认的结果
- 这个结果是否表达了新的位置落点
- 这个结果是否已经足够让 `recover` 或 `resume` 继续消费
- 这个结果和完整 replay result、完整 recover result、完整 resume result 的边界在哪里

因此，`cursor advancement result` 第一版冻结的核心是：

- 它是 `cursor advancement` 之后留下的结果/产物问题域
- 它位于推进判定与下游消费动作之间
- 它可以被 `recover` 或 `resume` 继续消费
- 它不能冒充 `cursor advancement` 整个问题域，也不能冒充 `cursor`、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table` 或运行对象

## 3. `cursor advancement result` 不等于 `cursor advancement` 整个问题域

### 3.1 问题域与结果产物必须分层

`cursor advancement` 更偏：

- 位置是否推进
- 推进到哪里
- 推进结果怎样被承认

`cursor advancement result` 更偏：

- 上面这些判定之后，最后留下了什么可继续消费的结果/产物

最小区别可以先压缩成：

- `cursor advancement` 回答“怎么判断推进、推进是否成立”
- `cursor advancement result` 回答“判断完成后，留下了什么结果给下游继续用”

### 3.2 没有正式 result，advancement 问题域也可以先成立

哪怕我们已经承认：

- 位置推进判定是独立问题域
- replay 邻域里存在推进承认问题
- 恢复链路需要消费推进线索

也不自动意味着：

- `cursor advancement result` 已经被单独冻结
- 任何旧字段都已经等于未来正式 result
- advancement 问题域和 advancement result 已经可以混成同一层

### 3.3 第一版必须排除的混写

- 把 `cursor advancement result` 写成 `cursor advancement` 的别名
- 把“存在推进判定”直接偷换成“result 已经正式成立”
- 用完整 advancement 问题域吞掉 result 产物边界

## 4. `cursor advancement result` 不等于 `cursor`

### 4.1 `cursor` 是位置材料，result 是推进后留下的可消费结果

`cursor` 更偏位置/进度指针材料。

它回答的是：

- 当前位置是什么
- 从哪里继续读
- 当前记录落在什么位置

`cursor advancement result` 则回答的是：

- 一次推进判定之后到底留下了什么结果
- 这个结果是否携带新的位置落点
- 这个结果是否已经可被下游承认并继续消费

### 4.2 result 可以带位置承认信息，但不能与 `cursor` 本体混成一层

第一版必须明确：

- `cursor advancement result` 可能携带位置推进承认信息
- 但“携带位置承认信息”不等于“它就是 `cursor` 本体”
- `cursor` 仍然是位置材料，`cursor advancement result` 仍然是推进后留下的结果/产物

### 4.3 第一版必须排除的混写

- 把 `cursor advancement result` 直接写成 `cursor`
- 因为旧代码里出现 `resumeCursor`，就把单个位置字段直接写成完整 advancement result
- 把“记录了推进后位置”直接偷换成“result 边界已经完整定义完毕”

## 5. `cursor advancement result` 不等于 `journal replay`

### 5.1 replay 更大，result 更窄

`journal replay` 更偏：

- 读取 journal 材料
- 整理事件
- 重放事件
- 为恢复链路形成继续消费的输入

`cursor advancement result` 只处理其中更窄的一块：

- 一次推进判定之后留下了什么位置推进结果

因此，第一版必须明确：

- `cursor advancement result` 可以出现在 replay 邻域
- 但它不等于 replay 整个过程
- 它不能被写成 replay 的总代名词

### 5.2 replay 完成不自动等于 advancement result 已经独立定型

哪怕现实代码里已经有：

- `readFromCursor(...)`
- `readRunEvents(...)`
- `projectStateFromEvents(...)`

也只能说明 replay 过程问题域已经存在，不自动意味着：

- `cursor advancement result` 的未来 schema 已经冻结
- replay 读完就自动等于正式 advancement result
- replay 过程已经完全吞掉推进结果边界

### 5.3 第一版必须排除的混写

- 把 `cursor advancement result` 写成“把 replay 跑完之后的一切”
- 把 replay window / batch / cursor policy 偷换成 result 定义
- 因为 replay 会影响位置，就把 result 并回 replay 总体

## 6. `cursor advancement result` 不等于 `journal replay result`

### 6.1 replay result 是更大的结果壳，advancement result 只是其中更窄的一条结果线

`journal replay result` 更偏 replay 完成后交出来的一组可继续消费的结果/产物。

`cursor advancement result` 则更偏其中关于位置推进承认的那条结果线：

- 这次推进最后留下了什么结果
- 这个结果怎样被下游承认

因此，第一版必须明确：

- `cursor advancement result` 可能出现在 replay result 邻域
- 它甚至可能被 replay result 承载
- 但它不等于 replay result 整体

### 6.2 result 可以被 replay result 承载，但不能被 replay result 吞掉

现实里一份 replay result 可能同时带有：

- replayed events
- 位置推进结果
- 其他恢复链路继续消费的产物

这说明：

- `cursor advancement result` 可以是 replay result 里的一个结果面向
- 但它仍然只是更窄的推进结果问题域
- 不能因为它落在 replay result 旁边，就把它写成 replay result 的全部

### 6.3 第一版必须排除的混写

- 把 `cursor advancement result` 直接写成 `journal replay result`
- 把 replay result 里的其他事件结果、恢复输入结果一并并入 advancement result 定义
- 把“有 advancement result”偷换成“这就是完整 replay result”

## 7. `cursor advancement result` 不等于 `recover`

### 7.1 `recover` 更偏找回可用状态基础

`recover` 处理的是：

- 如何结合 checkpoint、snapshot、journal、cursor 等恢复材料
- 找回一份可继续使用的状态基础

`cursor advancement result` 只处理其中更窄的一块：

- 一次推进之后留下的可承认结果
- 这份结果如何交给恢复链路继续消费

因此：

- `cursor advancement result` 可以服务 `recover`
- 但它不能冒充整个恢复动作

### 7.2 result 只能提供推进后的可消费结果，不能冒充完整恢复结果

即使某次推进结果对恢复很关键，也只能说明：

- 恢复链路多拿到了一条可继续消费的位置推进结果
- 或多拿到了一条可被承认的位置落点结果

这仍然不等于：

- 状态已经完整找回
- 恢复已经收口
- 完整 recover result 已经成立

### 7.3 第一版必须排除的混写

- 把 `cursor advancement result` 写成“恢复完成结果”
- 把“位置推进结果已承认”写成“完整恢复结果已经成立”
- 把 advancement result 直接写成完整 recover result

## 8. `cursor advancement result` 不等于 `resume`

### 8.1 `resume` 更偏让已有过程继续推进

`resume` 更偏：

- 利用已经可继续的状态
- 让已有过程重新往前走

`cursor advancement result` 则更偏：

- 为续接链路提供推进之后留下的结果
- 为续接链路提供可继续消费的位置承认结果

因此：

- `cursor advancement result` 可以帮助 `resume`
- 但它不等于 `resume`

### 8.2 result 不能冒充完整续接结果

即使某次 result 已经表明：

- replay 从旧位置推进到了新位置
- 这个位置落点已经可以继续被承认

也不等于：

- 原过程已经成功续跑
- 所有运行对象已经恢复完成
- 完整 resume result 已经成立

### 8.3 第一版必须排除的混写

- 把 `cursor advancement result` 写成 resume result 本身
- 把“推进到某个位置”写成“原过程已经续接完成”
- 把推进结果承认偷换成完整 resume 完成结果

## 9. `cursor advancement result` 不是 `runtime-table`

`runtime-table` 在上位文档里已经被冻结为正式装配结果、一等产物、运行态中心对象。

本文直接承接这个结论：

- `cursor advancement result` 不是正式装配结果
- 它不能直接宣称为 `runtime-table`
- 它也不能反向重写正式运行态定义

哪怕某次推进结果会影响恢复链路怎样接近正式运行态，也不等于它本身已经是装配中心对象。

## 10. `cursor advancement result` 不是运行对象本身

运行对象是系统里“正在工作的活体”。

它可能表现为：

- 正在运行的 runtime object
- 已灌回并可继续调度的 session / gateway / store / pool 容器
- 可继续推进的正式运行态结构

而 `cursor advancement result` 只是在 replay / 恢复 / 续接链路周边，留下的一份可继续消费的推进结果。

因此，第一版必须明确：

- advancement result 不是运行对象本体
- advancement result 不能冒充活的运行时容器
- advancement result 成立不等于运行对象已经恢复成立

## 11. 为什么它更像“推进之后留下、可被继续消费的结果/产物”

### 11.1 它处理的是“最后留下了什么”，不是“整个推进问题怎么定义”

如果只谈 `cursor advancement`，我们谈的是：

- 位置有没有推进
- 推进到哪里
- 怎样形成推进承认

一旦谈 `cursor advancement result`，问题马上缩成：

- 这些判定之后，最后留下了什么可以继续交给下游

这说明它本质上更像结果层，而不是完整问题域。

### 11.2 它处理的是“可被承认和消费的落点”，不是“位置材料本体”

如果只谈 `cursor`，我们只是在谈一个位置材料。

而 `cursor advancement result` 更像在说：

- 哪个推进落点已经形成结果
- 这个结果现在能不能被继续消费

所以它不是位置材料本体，而是围绕位置推进承认留下来的结果。

### 11.3 它处理的是“可继续消费的结果”，不是“完整 replay / recover / resume 的完成宣告”

如果只谈 `journal replay result`、`recover`、`resume`，重点分别在于：

- replay 之后整包留下了什么
- 状态怎样找回
- 原过程怎样续接

而 `cursor advancement result` 更像在说：

- 推进之后留下了一份什么样的结果，可以被恢复链路或续接链路继续使用

所以它更像“结果/产物边界”，而不是完整动作完成结果。

## 12. 它可以被 `recover` 或 `resume` 消费，但不能冒充完整恢复结果或完整续接结果

第一版必须把这层关系单独冻住：

- `recover` 可以消费 `cursor advancement result`
- `resume` 也可以消费 `cursor advancement result`
- 但它们消费的是“推进之后留下的一份结果”，不是拿它来顶替整个恢复结果或整个续接结果

白话讲，`cursor advancement result` 更像恢复链路和续接链路手里的一张“可继续往下走的结果凭据”，但这张凭据本身不等于整条路已经走完。

因此，第一版必须排除下面这些混写：

- 把 `cursor advancement result` 直接宣布为 recover 的最终结果
- 把 `cursor advancement result` 直接宣布为 resume 的最终结果
- 因为 recover / resume 会消费它，就把它抬成 recover / resume 的总代名词

## 13. `cursor advancement result` 的最小层级关系

可以先把 `cursor advancement result` 放在下面这张最小关系图里理解：

```text
运行对象 / 原始运行态
  -> 留下 journal / checkpoint / snapshot / cursor 等残留材料
  -> journal replay 读取、整理、重放 journal 材料
  -> cursor advancement 问题域判断位置是否推进、推进到哪里、怎样被承认
  -> 留下 cursor advancement result
  -> recover / resume 继续消费这份结果
  -> 进一步回到可继续运行的正式状态
```

这张图只冻结对象方向，不冻结最终算法，也不宣称所有实现都必须严格按单线顺序执行。

第一版真正要稳定下来的，是下面这层理解：

- `cursor advancement result` 站在 `cursor advancement` 问题域与下游消费动作之间
- 它可以带有位置推进承认信息
- 它不能和 `cursor` 本体混成一层
- 它不能和完整 replay result、完整 recover result、完整 resume result 混成一层

## 14. 现实锚点

下面这些现实锚点只用于证明：`cursor advancement result` 这个结果/产物问题域在当前仓库里已经有现实轮廓；它们不能反向绑死未来标准字段名、函数名、状态名、DSL 关键字或 JSON 命名。

### 14.1 `src/agent_core/checkpoint/checkpoint-recovery.ts`

当前恢复实现已经出现非常直接的现实信号：

- `recoverFromCheckpoint(...)` 会先根据 `checkpoint?.record.journalCursor` 决定读取起点
- replay 出来的结果会单独落成 `replayedEvents`
- 推进后的落点会单独落成 `resumeCursor`
- 返回值会把 `replayedEvents` 与 `resumeCursor` 分开交出

这些现象支持本文判断：

- 旧代码里已经存在“推进之后留下一个位置结果”的现实表达
- 这个表达既不等于 `cursor advancement` 整个问题域，也不等于 replay 整体
- 它更像推进判定之后单独留下的一份结果/产物

但本文同时明确：

- `resumeCursor`
- `journalCursor`
- `recoverFromCheckpoint(...)`

这些旧代码名字只是现实证据，不直接升格成未来标准。

### 14.2 `src/agent_core/checkpoint/checkpoint-types.ts`

当前恢复类型里，`CheckpointRecoveryResult` 已经把几类东西拆开表达：

- `replayedEvents`
- `resumeCursor`
- 其他恢复结果字段

这说明现实代码里已经天然承认：

- replay 事件结果与位置推进结果可以并列出现
- 位置推进结果不是 replay 事件集合本身
- 位置推进结果也不是完整 recovery result 本身

这正好支持本文的分层判断：

- `cursor advancement result` 更像更窄的推进结果面向
- 它可以被更大的 recovery result 承载
- 但它不能反过来冒充整个 recovery result

## 15. 第一版冻结结论

本文第一版冻结的是：

- `cursor advancement result` 在 Praxis 宿主里的正式定位
- 它与 `cursor advancement` 整个问题域、`cursor` 本体、`journal replay`、`journal replay result`、`recover`、`resume`、`runtime-table`、运行对象之间的边界
- 它作为“推进之后留下、可被下游承认并继续消费的结果/产物”的最小层级关系
- 现实代码只作为证据，不直接升格成未来标准

本文第一版不冻结的是：

- 最终 result schema
- 最终承认规则表
- 冲突合并/去重/幂等细则
- replay window / batch / cursor policy
- 最终 serialization / DSL / JSON 字段名 / 枚举

## 16. 最小结论

- `cursor advancement result` 不等于 `cursor advancement` 整个问题域；前者是推进后留下的结果/产物，后者是围绕推进判定与承认的更大问题域。
- `cursor advancement result` 不等于 `cursor` 本体；前者最多携带位置推进承认信息，后者是位置/进度指针材料。
- `cursor advancement result` 不等于 `journal replay`；前者是更窄的推进结果，后者是读取、整理、重放的全过程。
- `cursor advancement result` 不等于 `journal replay result`；前者最多是 replay result 邻域里关于位置推进的一条结果线，不能和整包 replay 结果混成一层。
- `cursor advancement result` 不等于 `recover`；它可以被恢复链路消费，但不能冒充完整恢复结果。
- `cursor advancement result` 不等于 `resume`；它可以为续接链路提供结果，但不能冒充完整续接结果。
- `cursor advancement result` 不是 `runtime-table`；它不能直接宣称为正式装配结果。
- `cursor advancement result` 不是运行对象本身；它不能直接冒充活的运行态。
- `cursor advancement result` 更像推进之后留下、可被 `recover` 或 `resume` 继续消费的结果/产物。
