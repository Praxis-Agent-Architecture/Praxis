# agentCore 第二十一实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第二十一实施切片指南**。

它只回答一类问题：

- 如果第二十刀已经完成，第二十一轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 runner、executor、execution scheduler、action lifecycle、execution attempt、结果层、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第二十二刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第二十刀指南或完成清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 runner 设计稿
- 最终 executor 或 execution scheduler 设计稿
- 最终 action lifecycle、execution attempt 或 result layer 设计稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table、最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第二十刀做完之后，第二十一刀先落哪一小段”收敛成一个可执行建议。

白话讲，第二十一刀不是启动 executor，也不是让 action 真正执行，而是在第二十刀将固定的 `pre-execution latch / execution readiness latch / runner pre-execution gate` 之后，先补一片**真正执行调用之前的极窄 execution dispatch pre-edge / runner dispatch token / executor-call stub**。它只承认“runner 已经可以形成一个面向执行调度的极窄 dispatch token 或 call stub”，但不调用 executor、不执行 action、不产生 execution attempt、不收 result。

## 2. 为什么它自然接在第二十刀之后

第十九刀已经把恢复链路推进到完整 runner 执行之前的 intake 接收通道：

```text
runner handoff token / runner intake stub
  -> runner intake lane / runner intake receiving strip / execution-intake-facing seam
```

第二十刀将自然固定 intake 接收通道之后、真正 runner execution 之前的最小闸门：

```text
runner intake lane / runner intake receiving strip
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
```

也就是说，第二十刀解决的是：

- runner intake receiving strip 之后不再只是“token 已被接收”
- 当前链路已经能最小表达“这个接收结果已经抵达执行前闸门”
- runner pre-execution gate 可以先承认“执行前准备已经被闩住”
- 但它仍然不进入完整 runner execution，不调用 executor，不产生 execution attempt，不冻结最终执行协议

第二十刀刻意不会回答下面这些问题：

- pre-execution latch 之后，runner 是否可以最小形成一个 dispatch token
- dispatch token 是否已经能指向一个 executor-call stub，但不真正调用 executor
- execution dispatch pre-edge 和后续 execution attempt shell 应该怎样分开
- runner dispatch token 是否可以独立被看见，但不承担执行、重试、结果收口或 action lifecycle 推进

白话讲，第二十刀让“执行前闸门已经关好、候选已被闩住但还没执行”站住；第二十一刀最自然就是继续问：**闸门之后，能不能先出现一个极窄 dispatch token / call stub，让系统知道下一步将面向 executor 调用边界，但还没有真的调用 executor。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `pre-execution latch`，就直接把完整 executor invocation、execution attempt、action lifecycle、结果收集和恢复动作收口一起做掉
- 第二十二刀只能同时补 dispatch token、executor call boundary、attempt shell、调用策略和结果入口，导致边界变粗

所以，第二十一刀最自然不是回头重写第二十刀，也不是直接启动 executor，而是先把 **`pre-execution latch / runner pre-execution gate` 之后、真正 executor 调用之前的最小 execution dispatch pre-edge / runner dispatch token / executor-call stub** 站住。

## 3. 第二十一刀依赖哪些上位文档 / 边界文档

第二十一刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-nineteenth-implementation-slice-guide-v1.md`

这份文档负责给第二十一刀提供**runner intake receiving strip 的外侧起点**。

它支撑第二十一刀的方式是：

- 明确第十九刀只做到 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`
- 明确第十九刀不是 pre-execution latch，不是完整 runner，不是 executor，也不是结果收口
- 帮助第二十一刀确认自己不是补 runner intake lane，而是在第二十刀 latch 之后继续向 dispatch pre-edge 收束

白话讲，没有第十九刀的 runner intake receiving strip，第二十刀的 pre-execution latch 就没有稳定输入；没有第二十刀的 latch，第二十一刀也不应直接谈 dispatch token。

### 3.2 第二十刀的并行前置假设

第二十刀将自然固定：

- `runner intake lane / runner intake receiving strip` 之后的第一个极窄 `pre-execution latch`
- `execution readiness latch` 的最小承认点
- `runner pre-execution gate` 的独立成立
- 当前链路最小暴露“intake receiving strip 之后已经存在一个执行前闸门”

第二十一刀以这个结果为直接上游前提。

它支撑第二十一刀的方式是：

- 明确第二十一刀不是补 runner intake lane
- 明确第二十一刀不是补 pre-execution latch 或 runner pre-execution gate 本身
- 明确第二十一刀只在 latch / gate 之后，再立一个真正 executor 调用之前的 dispatch token / call stub

白话讲，第二十刀负责让“可以执行吗”这个闸门站住；第二十一刀只负责让“准备调度执行，但还没有执行”这个极窄前沿能被看见。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第二十一刀提供**实现落位感**。

它支撑第二十一刀的方式是：

- 提醒第二十一刀仍然处在恢复链后段的候选执行之前区域
- 帮助第二十一刀只落到 execution dispatch pre-edge，而不是直接铺完整 runner、executor 或执行调度器
- 防止第二十一刀把“可以形成 dispatch token”误写成“恢复动作已经开始执行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第二十一刀提供**链路位置感与越界控制**。

它支撑第二十一刀的方式是：

- 明确恢复链路是从 recognition result 一路逐层收束到候选形成、runner 前准备、runner intake、pre-execution gate，再继续靠近 executor 调用边界
- 帮助第二十一刀把 intake receiving strip、pre-execution latch、dispatch token、executor invocation shell 拆成相邻但不同的窄层
- 防止第二十一刀把 dispatch pre-edge、execution attempt、runner execution 和 result layer 混成一层

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第二十一刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第二十一刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第二十一刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 runner dispatch token 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第二十一刀最多说明“恢复相关候选已经可以形成一个面向执行调用边界的 dispatch token / call stub”，不能说恢复动作已经被 executor 执行。

## 4. 当前建议的第二十一刀是什么

### 4.1 切片名称

建议把第二十一刀收敛成：

**`pre-execution latch / runner pre-execution gate` 之后、真正 executor 调用之前的最小 `execution dispatch pre-edge / runner dispatch token / executor-call stub`**

也可以白话地叫成：

**执行前闸门之后、真正调用 executor 之前的第一枚调度令牌 / 第一片调用空壳**

这里的关键词是：

- `execution dispatch pre-edge`
- `runner dispatch token`
- `executor-call stub`
- `pre-execution latch` 之后的最小执行调度前沿

它不是完整 runner，不是 executor，不是 execution scheduler，不是 execution attempt，不是 action lifecycle，也不是 result layer。

### 4.2 这第二十一刀的最小组合

这一刀建议只包含下面三件事：

1. 在第二十刀预计固定的 `pre-execution latch / execution readiness latch / runner pre-execution gate` 之后，最小承认“runner 可以形成一个面向执行调度的 dispatch token 或 executor-call stub”
2. 让当前链路结构上能看出：pre-execution gate 之后不是直接执行，而是先进入一个真正 executor 调用之前的极窄 dispatch pre-edge
3. 给第二十二刀留下自然入口：dispatch token 之后的最小 `execution attempt shell / executor invocation shell / runner call boundary`

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
  -> lane 之后更靠近 intake consumer 的最小 consumer-intake-facing seam
  -> 最小 intake face / handoff strip
  -> face 之后 consumer 侧最小接手边 / minimal intake hook
  -> receiving edge 之后、动作层之前的最小 pre-action intake slot
  -> pre-action slot 之后、动作候选边之前的最小 pre-action consumer boundary
  -> pre-action consumer boundary 之后、完整 action candidate 之前的最小 action-candidate-pre-edge
  -> action-candidate-pre-edge 之后、第一个完整 action candidate 之前的最小 candidate shell / pre-ack / first candidate shell entry
  -> candidate shell 之后的最小 candidate body seam / candidate detail intake / candidate-body-facing edge
  -> candidate detail intake 之后、完整 runner 之前的最小 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
  -> pre-runner readiness seam 之后的最小 runner handoff token / runner intake stub / execution handoff pre-entry
  -> runner handoff token 之后、完整 runner 执行前的最小 runner intake lane / runner intake receiving strip / execution-intake-facing seam
  -> runner intake receiving strip 之后、真正 runner execution 之前的最小 pre-execution latch / execution readiness latch / runner pre-execution gate
  -> pre-execution latch 之后、真正 executor 调用之前的最小 execution dispatch pre-edge / runner dispatch token / executor-call stub
```

这里的关键不是把第二十一刀做成 execution attempt，而是先把：

- 第二十刀预计站住的最小 pre-execution latch / runner pre-execution gate
- latch / gate 之后、真正 executor 调用之前的最小 execution dispatch pre-edge
- 当前链路对这枚 runner dispatch token 或 executor-call stub 的最小暴露

这三者真实拆开。

## 5. 第二十一刀包含什么

第二十一刀建议只包含下面这些内容。

### 5.1 dispatch token 的最小承认点

它只负责一件事：

- 在 `pre-execution latch / runner pre-execution gate` 之后，承认“runner 可以拥有一个准备交给执行调用边界的最小 dispatch token”

第二十一刀里，它应该做到：

- 明确 runner dispatch token 位于 pre-execution latch 与 executor invocation shell 之间
- 明确它回答的是“执行前闸门之后，是否已经能形成一个面向 executor 调用的最小调度物”
- 让当前实现结构上能看出：它是 latch 内侧的下一窄层，不是 latch 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 dispatch token 成立

第二十一刀里，它不需要做到：

- 完整 runner execution
- 完整 executor invocation
- 完整 execution scheduler
- 完整 execution attempt
- 完整 action lifecycle
- 完整结果收集或结果协议

### 5.2 executor-call stub 的最小承认点

它只负责一件事：

- 让 dispatch token 有一个极窄的 executor-call stub 落点，但这个 stub 还不能真正调用 executor

第二十一刀里，它应该做到：

- 存在一个最小 call stub 概念，用来承认“下一层会进入 executor 调用边界”
- 这个 call stub 可以只是 carrier、marker、placeholder、stub result 或命名清晰的过渡对象
- 当前链路能区分“dispatch token 已形成”和“executor 已被调用”
- 当前链路能区分“call stub 已存在”和“execution attempt 已产生”

第二十一刀里，它不需要做到：

- 真实调用 executor
- 选择 executor 实例
- 处理 executor 返回值
- 生成 execution attempt id
- 建立 retry / cancel / timeout / rollback 协议
- 把 call stub 升格成最终 executor adapter

### 5.3 execution dispatch pre-edge 的最小暴露

它只负责一件事：

- 当前链路要能最小暴露“执行调度前沿已经存在”，而不是只暴露“pre-execution latch 已存在”

第二十一刀里，它应该做到：

- 有一条从 pre-execution latch 到 dispatch token / call stub 的最小桥接关系
- 暴露口径只说明“已经抵达执行调用前沿”，不说明“执行已经开始”
- 验证时可以只证明 token / stub 被构造、被返回、被记录或被链路看见
- 命名上避免把 `dispatch` 写成 `execute`，避免把 `call stub` 写成 `call result`

第二十一刀里，它不需要做到：

- 完整 runner dispatch loop
- 完整调度队列
- 完整 executor pool
- 完整 action lifecycle 状态机
- 完整 result collection

## 6. 第二十一刀不包含什么

下面这些内容都不应塞进第二十一刀。

### 6.1 不包含完整 runner

第二十一刀不能把 runner 做成完整执行体。

它最多承认：

- pre-execution latch 之后，可以形成一个 runner dispatch token
- 这个 token 可以指向一个 executor-call stub
- 当前链路可以暴露“已经到达 dispatch pre-edge”

它不能承认：

- runner 已经开始执行候选
- runner 已经拥有完整执行循环
- runner 已经有最终状态机
- runner 已经能调度、重试、取消、收结果

### 6.2 不包含 executor 或 executor adapter

第二十一刀不能提前实现 executor。

它最多承认：

- executor-call stub 作为下一层调用边界的占位
- dispatch token 面向 executor 调用边界
- executor 尚未被真实调用

它不能承认：

- executor 已经被选择
- executor 已经被调用
- executor response 已经被收集
- executor adapter 协议已经定稿
- executor pool、executor routing 或 provider-specific executor 已经成立

### 6.3 不包含 execution attempt

第二十一刀不能产生 execution attempt。

原因很简单：

- `execution attempt` 一旦出现，就意味着系统开始记录某次具体执行尝试
- 这会自然牵出 attempt id、状态推进、失败分类、重试、取消、结果收集等后续问题
- 这些都已经越过了第二十一刀的 dispatch pre-edge 边界

第二十一刀最多为第二十二刀留下入口：

```text
runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
```

但它不替第二十二刀把 attempt shell 写完。

### 6.4 不包含 result layer

第二十一刀不能收 executor 结果，也不能定义最终 result protocol。

它不处理：

- executor return
- execution result
- action result
- result collection
- result reconciliation
- result persistence
- result-to-recovery handoff

白话讲，这一刀还没调用，自然也不应该收结果。

### 6.5 不包含完整 recover / resume / hydrate

第二十一刀不能借 dispatch token 的名字，把恢复动作层直接做完。

它不处理：

- 完整 `recover` 动作执行
- 完整 `resume` 续接策略
- 完整 `hydrate` 灌回逻辑
- 恢复动作的最终 success / failure 判定
- 恢复动作与运行态对象的完整同步

第二十一刀只是在恢复链路后段承认一个“即将面向执行调用边界”的极窄 token / stub。

## 7. 与第二十刀 / 第二十二刀的边界

### 7.1 与第二十刀的边界

第二十刀应负责：

- `runner intake lane / runner intake receiving strip` 之后的最小 `pre-execution latch`
- `execution readiness latch` 的最小成立
- `runner pre-execution gate` 的最小暴露
- 证明“候选已经抵达执行前闸门，但还没有形成 dispatch token”

第二十一刀不应回头做这些事。

第二十一刀只接在它之后：

```text
pre-execution latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

如果实现中只能证明 pre-execution latch 存在，却不能证明 dispatch token 或 call stub 已经独立成立，那就不是第二十一刀 done。

### 7.2 与第二十二刀的边界

第二十二刀最自然的入口是：

```text
runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
```

第二十二刀可以继续回答：

- dispatch token 之后，是否可以出现一个极窄 execution attempt shell
- executor invocation shell 如何承认“调用边界已形成”，但仍不必完整实现 executor
- runner call boundary 如何把 call stub 推进到一次具体调用尝试之前或边界上

第二十一刀不能替第二十二刀回答：

- attempt shell 的最终字段是什么
- invocation shell 是否产生 attempt id
- runner call boundary 如何处理 timeout、cancel、retry、result 或 failure
- executor invocation 的最终协议是什么

白话讲，第二十一刀只把“准备调度”站住；第二十二刀才适合继续触碰“调用边界 / attempt 壳”。

## 8. 与 recover / resume / hydrate 的关系

第二十一刀仍然在恢复链路后段，但不是恢复动作层本身。

它和三者的关系可以这样理解：

- 对 `recover` 来说，dispatch token 最多表示某个恢复相关候选已经抵达执行调用前沿，不表示 recover 动作已经执行
- 对 `resume` 来说，dispatch token 最多表示某个续接相关候选已经准备面向执行调用，不表示已有过程已经继续推进
- 对 `hydrate` 来说，dispatch token 最多表示某个灌回相关候选可能进入执行调用边界，不表示状态已经灌回运行对象

因此，第二十一刀应保持下面这些限制：

- 不把 dispatch token 写成 recover result
- 不把 executor-call stub 写成 resume continuation
- 不把 execution dispatch pre-edge 写成 hydrate commit
- 不把 call stub 的存在写成任何动作已经成功

白话讲，它只是“快要调用了”的窄边，不是“已经找回 / 已经续接 / 已经灌回”。

## 9. 与 runner / executor 的关系

### 9.1 与 runner 的关系

第二十一刀位于 runner 内部或 runner 邻域的极窄前沿，但它不是完整 runner。

它可以让 runner 最小暴露：

- 当前已有 pre-execution latch
- latch 之后可以形成 runner dispatch token
- dispatch token 可以落到 executor-call stub

它不能让 runner 承担：

- 完整运行循环
- 完整调度队列
- 完整执行状态机
- 完整 action lifecycle
- 完整结果收口

### 9.2 与 executor 的关系

第二十一刀只靠近 executor 调用边界，不进入 executor。

它可以承认：

- executor-call stub 作为下一层边界的名字
- dispatch token 面向 executor 调用
- 当前还没有真实调用

它不能承认：

- executor adapter 已实现
- executor invocation 已发生
- executor result 已返回
- provider-specific executor 已绑定

这里的白话边界是：

- runner dispatch token 像“准备递出去的执行小票”
- executor-call stub 像“柜台窗口的占位牌”
- 但窗口里的工作人员还没接单，也没有开始处理

## 10. 最小桥接链

第二十一刀完成后，最小桥接链至少应能被这样理解：

```text
cursor advancement recognition result
  -> acceptance / ack result
  -> downstream handoff / downstream consumption
  -> downstream consumption entry
  -> recovery-side consumer shell
  -> recover intake seam
  -> intake lane
  -> consumer-intake-facing seam
  -> intake face / handoff strip
  -> minimal intake hook
  -> pre-action intake slot
  -> pre-action consumer boundary
  -> action-candidate-pre-edge
  -> candidate shell / pre-ack / first candidate shell entry
  -> candidate body seam / candidate detail intake
  -> pre-runner readiness seam / runner-facing pre-edge
  -> runner handoff token / runner intake stub
  -> runner intake lane / runner intake receiving strip
  -> pre-execution latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

这条链的重点不是“所有名词都已经有最终实现”，而是：

- 每一层都比上一层更靠近真正执行
- 每一层都只承认自己负责的最小事实
- 第二十一刀新增的事实只是最后一段 dispatch pre-edge / token / call stub

如果当前实现或文档把最后两段压成：

```text
pre-execution latch
  -> executor execution
```

那就是越界，因为它跳过了第二十一刀要保留的 dispatch pre-edge。

## 11. 推荐实施顺序

如果后续真的开始编码，第二十一刀建议按下面顺序实施。

### 11.1 第一步：先确认第二十刀入口

先确认当前链路已经能最小暴露：

- `runner intake receiving strip`
- `pre-execution latch`
- `execution readiness latch`
- `runner pre-execution gate`

如果这些还没站住，不要抢做第二十一刀。

### 11.2 第二步：再加 dispatch token 壳

新增或扩展时，只建立最小 dispatch token 壳。

它可以很薄，只需要表达：

- 来自哪个 pre-execution latch 或 gate
- 面向哪个 executor-call stub 或 call boundary
- 当前只是 dispatch-ready，不是 executed

这里不需要冻结最终字段名，只需要在实现命名和测试意图上让边界清楚。

### 11.3 第三步：再加 executor-call stub 壳

call stub 只负责作为下一层调用边界的占位。

它应该保持：

- 不真实调用 executor
- 不生成 execution attempt
- 不收 result
- 不处理 retry / timeout / cancel

### 11.4 第四步：最后补最小暴露与验证

最后再让当前链路能证明：

- pre-execution latch 之后确实产生了 dispatch token 或 call stub
- dispatch token 和 latch 不是同一个对象的改名
- call stub 和 execution attempt 不是同一个对象的改名
- 当前仍未调用 executor

## 12. 最小验证方式

第二十一刀的验证应该很轻。

可以接受的验证包括：

- smoke 级链路验证：从已存在的 pre-execution latch 输入，得到一个 dispatch token 或 call stub
- stub 驱动验证：构造最小 latch，确认 dispatch pre-edge 被暴露
- 命名 / 类型 / 文档验证：确认 `dispatch`、`call stub`、`attempt`、`result` 没有互相冒充
- negative 验证：确认第二十一刀路径不会真实调用 executor，也不会产生 execution attempt 或 result

不应把下面这些作为第二十一刀必须验证：

- executor 真实调用成功
- execution attempt 生命周期完整推进
- retry / cancel / timeout 完整覆盖
- result collection 完整工作
- `recover / resume / hydrate` 完整动作成功

白话讲，这一刀只验证“票已经开出来、窗口占位已经出现”，不验证“窗口真的办完业务”。

## 13. done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `pre-execution latch / runner pre-execution gate` 之后的最小 dispatch token 已真实存在，哪怕目前只支持极窄 happy-path、单一路径或 placeholder
- `executor-call stub` 已真实存在，且明确只是调用前占位，不真实调用 executor
- 当前链路已经能暴露“execution dispatch pre-edge 已存在”，而不是只暴露“pre-execution latch 已存在”
- dispatch token 与 pre-execution latch 已拆开，不互相冒充
- executor-call stub 与 execution attempt 已拆开，不互相冒充
- 当前验证能证明不会调用 executor、不会执行 action、不会生成 execution attempt、不会收 result
- 第二十二刀入口被留下为 `execution attempt shell / executor invocation shell / runner call boundary`

换句话说，只要“dispatch token 站出来了、call stub 站出来了、没执行、没 attempt、没 result、没冻结最终协议”，就足够进入第二十二刀。

## 14. 反模式

下面这些做法都属于第二十一刀反模式。

- 把 `pre-execution latch` 改名成 `dispatch token`，但没有新增独立 dispatch pre-edge
- 把 `executor-call stub` 写成真实 executor call
- 为了证明链路可跑，偷偷调用 executor
- 一旦形成 dispatch token，就立刻生成 execution attempt
- 在第二十一刀里定义完整 attempt id、attempt state、retry / cancel / timeout / rollback 规则
- 在第二十一刀里收 executor result 或 action result
- 把 result layer、failure layer、reconciliation layer 一起做进来
- 把完整 runner loop、execution scheduler、executor pool 一起做进来
- 把 `recover / resume / hydrate` 的最终动作协议塞进 dispatch token
- 把当前 stub 字段写成未来最终 schema、最终 rule table 或最终 protocol
- 为了“看起来完整”，替第二十二刀提前写完 execution attempt shell

这些反模式的共同问题是：

- 要么没有真正新增 dispatch pre-edge
- 要么把 dispatch pre-edge 扩成了真实执行
- 要么把第二十二刀甚至更后面的 attempt、executor、result、recover / resume / hydrate 提前吞掉

## 15. 第二十一刀后的第二十二刀入口

第二十一刀完成后，第二十二刀最自然接到：

```text
execution dispatch pre-edge / runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
```

第二十二刀可以继续收敛：

- dispatch token 之后，是否可以出现最小 execution attempt shell
- executor invocation shell 是否可以承认“调用边界已形成”，但仍保持极窄
- runner call boundary 如何只表达“进入调用边界”，不一次性吞掉结果层

第二十一刀不要替第二十二刀完成这些内容。

第二十一刀结束时，最好的状态是：

- 第二十刀的 latch / gate 已经有了更内侧出口
- 第二十一刀的 dispatch token / call stub 已经独立成立
- executor 仍未调用
- action 仍未执行
- execution attempt 仍未产生
- result 仍未收集
- 第二十二刀可以自然接入 attempt shell / invocation shell / call boundary

## 16. 结论

第二十一刀应收敛为：

**`pre-execution latch / runner pre-execution gate` 之后、真正 executor 调用之前的最小 `execution dispatch pre-edge / runner dispatch token / executor-call stub`。**

它的价值不是让系统现在就能执行，而是把执行前最后几层继续拆细：

- 第二十刀：执行前闸门已经站住
- 第二十一刀：闸门之后可以形成 dispatch token / call stub
- 第二十二刀：dispatch token 之后再进入 attempt shell / invocation shell / call boundary

只要第二十一刀能坚持“不调用 executor、不执行 action、不产生 execution attempt、不收 result、不冻结最终协议”，它就完成了自己的职责，并且给第二十二刀留下了干净、自然、足够窄的入口。
