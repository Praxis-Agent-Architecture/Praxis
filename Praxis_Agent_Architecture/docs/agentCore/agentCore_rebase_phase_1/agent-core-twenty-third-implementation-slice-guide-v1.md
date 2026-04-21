# agentCore 第二十三实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第二十三实施切片指南**。

它只回答一类问题：

- 如果第二十二刀已经完成，第二十三轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 executor、execution scheduler、action lifecycle、execution attempt body、result layer、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第二十四刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第二十二刀指南或完成清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 runner 设计稿
- 最终 executor 或 execution scheduler 设计稿
- 最终 action lifecycle、execution attempt body 或 result layer 设计稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table、最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第二十二刀做完之后，第二十三刀先落哪一小段”收敛成一个可执行建议。

白话讲，第二十三刀不是执行 action，也不是运行 executor，而是在第二十二刀将固定的 `execution attempt shell / executor invocation shell / runner call boundary` 之后，先补一片**真正执行体之前的极窄 execution attempt intake / invocation receiving edge / executor-entry receiving seam**。它只承认“调用边界内侧已经有一条最小接收边，attempt shell 可以被 entry seam 接住”，但不进入 attempt body，不启动 executor run，不产生 result。

## 2. 为什么它自然接在第二十二刀之后

第二十一刀已经把执行前闸门之后、真正 executor 调用之前的 dispatch 前沿固定为：

```text
pre-execution latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

第二十二刀将自然固定 dispatch token 之后、完整 executor 运行之前的最小调用边界：

```text
execution dispatch pre-edge / runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
```

也就是说，第二十二刀解决的是：

- dispatch token 之后不再只是“未来会调用 executor”
- 当前链路已经能最小表达“这里出现了一个 execution attempt shell / invocation shell”
- runner call boundary 可以先承认“调用边界已经形成”
- 但它仍然不进入完整 executor，不展开 attempt body，不执行 action，不收 result，也不冻结最终执行协议

第二十二刀刻意不会回答下面这些问题：

- execution attempt shell 内侧，是否已经有一条最小 intake 接收边
- executor invocation shell 是否已经被一个 entry seam 接住，但尚未进入 run body
- runner call boundary 和 executor-entry receiving seam 应该怎样分开
- attempt shell 内侧是否可以独立暴露“已接收到调用壳”，但不承担具体执行、重试、结果收口或 action lifecycle 推进

白话讲，第二十二刀让“调用边界 / attempt 壳已经出现”站住；第二十三刀最自然就是继续问：**这个壳出现之后，能不能先有一条极窄 receiving seam 把它接住，但还不真正执行壳里的 body。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `execution attempt shell`，就直接把完整 executor run、attempt body、action lifecycle、result collection 和恢复动作收口一起做掉
- 第二十四刀只能同时补 invocation receiving、attempt body pre-edge、executor run-body preface、operation seam、结果入口和失败处理，导致边界变粗

所以，第二十三刀最自然不是回头重写第二十二刀，也不是直接运行 executor，而是先把 **`execution attempt shell / executor invocation shell / runner call boundary` 之后、真正执行体之前的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`** 站住。

## 3. 第二十三刀依赖哪些上位文档 / 边界文档

第二十三刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-twenty-first-implementation-slice-guide-v1.md`

这份文档负责给第二十三刀提供**dispatch pre-edge 的外侧起点**。

它支撑第二十三刀的方式是：

- 明确第二十一刀只做到 `execution dispatch pre-edge / runner dispatch token / executor-call stub`
- 明确第二十一刀不是 execution attempt shell，不是完整 executor，也不是结果收口
- 帮助第二十三刀确认自己不是补 dispatch token，而是在第二十二刀 invocation shell 之后继续向 receiving seam 收束

白话讲，没有第二十一刀的 dispatch token，第二十二刀的 attempt shell 就没有稳定输入；没有第二十二刀的 attempt shell，第二十三刀也不应直接谈 invocation receiving edge。

### 3.2 第二十二刀的并行前置假设

第二十二刀将固定：

- `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后的最小 `execution attempt shell`
- `executor invocation shell` 的最小承认点
- `runner call boundary` 的独立成立
- 当前链路最小暴露“dispatch token 之后已经存在一个执行调用边界”

第二十三刀以这个结果为直接上游前提。

它支撑第二十三刀的方式是：

- 明确第二十三刀不是补 dispatch token 或 executor-call stub
- 明确第二十三刀不是补 execution attempt shell 或 runner call boundary 本身
- 明确第二十三刀只在 attempt shell 内侧，再立一个真正 attempt body 之前的 intake / receiving seam

白话讲，第二十二刀负责让“调用边界出现了”站住；第二十三刀只负责让“调用边界内侧被接住了，但还没有执行”这个极窄接收边能被看见。

### 3.3 `agent-core-twenty-first-implementation-slice-done-checklist-v1.md`

这份文档负责给第二十三刀提供**第二十一刀已完成的验收口径**。

它支撑第二十三刀的方式是：

- 要求 `pre-execution latch`、`execution dispatch pre-edge`、`runner dispatch token / executor-call stub` 已经明确分层
- 明确第二十二刀入口是最小 `execution attempt shell / executor invocation shell / runner call boundary`
- 防止第二十三刀回头把 dispatch token 改名成 invocation receiving edge，却没有承认真正的 attempt shell 内侧接收边

白话讲，第二十三刀不是把旧 dispatch pre-edge 往里挪一个名字，而是在第二十二刀边界成立后，再往内侧补一条接收 seam。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第二十三刀提供**实现落位感**。

它支撑第二十三刀的方式是：

- 提醒第二十三刀仍然处在恢复链后段、候选执行之前或执行体之前的最小桥接区域
- 帮助第二十三刀只落到 invocation receiving seam，而不是直接铺完整 executor、执行调度器或结果层
- 防止第二十三刀把“attempt shell 已被接收”误写成“恢复动作已经开始执行”

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第二十三刀提供**链路位置感与越界控制**。

它支撑第二十三刀的方式是：

- 明确恢复链路是从 recognition result 一路逐层收束到候选形成、runner 前准备、dispatch、attempt shell，再继续靠近真正执行体
- 帮助第二十三刀把 dispatch token、attempt shell、invocation receiving seam、attempt body pre-edge、result layer 拆成相邻但不同的窄层
- 防止第二十三刀把 invocation receiving edge、executor run body、execution attempt body 和 result collection 混成一层

### 3.6 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第二十三刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第二十三刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第二十三刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 executor-entry receiving seam 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第二十三刀最多说明“一个调用壳已经被 executor entry seam 接住”，不能说恢复动作已经被 executor 执行，更不能说恢复动作已经完成。

## 4. 当前建议的第二十三刀是什么

### 4.1 切片名称

建议把第二十三刀收敛成：

**`execution attempt shell / executor invocation shell / runner call boundary` 之后、真正执行体之前的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`**

也可以白话地叫成：

**调用壳之后、执行体之前的第一条接收边 / 第一片入口缝**

这里的关键词是：

- `execution attempt intake`
- `invocation receiving edge`
- `executor-entry receiving seam`
- `execution attempt shell` 内侧的最小接收边

它不是完整 executor，不是 execution scheduler，不是 action lifecycle，不是 execution attempt body，也不是 result layer。

### 4.2 这第二十三刀的最小组合

这一刀建议只包含下面三件事：

1. 在第二十二刀预计固定的 `execution attempt shell / executor invocation shell / runner call boundary` 之后，最小承认“attempt shell 内侧可以出现一条接收边 / entry seam”
2. 让当前链路结构上能看出：runner call boundary 之后不是直接进入执行体，而是先进入一个真正 attempt body 之前的极窄 intake / receiving seam
3. 给第二十四刀留下自然入口：attempt intake 之后的最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`

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
  -> runner dispatch token 之后、完整 executor 运行之前的最小 execution attempt shell / executor invocation shell / runner call boundary
  -> execution attempt shell 之后、真正执行体之前的最小 execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

这里的关键不是把第二十三刀做成 execution attempt body，而是先把：

- 第二十二刀预计站住的最小 execution attempt shell / executor invocation shell / runner call boundary
- invocation shell 内侧、真正执行体之前的最小 execution attempt intake / invocation receiving edge
- 当前链路对这条 executor-entry receiving seam 的最小暴露

这三者真实拆开。

## 5. 第二十三刀包含什么

第二十三刀建议只包含下面这些内容。

### 5.1 attempt intake 的最小承认点

它只负责一件事：

- 在 `execution attempt shell / executor invocation shell` 之后，承认“attempt shell 内侧可以有一个最小 intake”

第二十三刀里，它应该做到：

- 明确 execution attempt intake 位于 invocation shell 与 attempt body pre-edge 之间
- 明确它回答的是“调用壳已经出现之后，是否已经被执行入口接住”
- 让当前实现结构上能看出：它是 shell 内侧的下一窄层，不是 attempt shell 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 intake 成立

第二十三刀里，它不需要做到：

- 完整 execution attempt body
- 完整 executor run body
- 完整 action lifecycle
- 完整 execution scheduler
- 完整 result collection
- 完整 retry / cancel / timeout / rollback 协议

### 5.2 invocation receiving edge 的最小承认点

它只负责一件事：

- 让 executor invocation shell 有一条极窄 receiving edge，但这条 receiving edge 还不能真正运行 executor

第二十三刀里，它应该做到：

- 存在一个最小 receiving edge 概念，用来承认“调用壳已被 entry seam 接住”
- 这个 receiving edge 可以只是 carrier、marker、placeholder、stub result 或命名清晰的过渡对象
- 当前链路能区分“invocation shell 已形成”和“invocation shell 已被接收”
- 当前链路能区分“receiving seam 已存在”和“attempt body 已开始”

第二十三刀里，它不需要做到：

- 真实运行 executor
- 选择或绑定 executor adapter
- 进入 operation body
- 生成 executor result
- 建立错误恢复或结果收口协议
- 把 receiving seam 升格成最终 executor entry API

### 5.3 executor-entry receiving seam 的最小暴露

它只负责一件事：

- 当前链路要能最小暴露“executor-entry receiving seam 已存在”，而不是只暴露“execution attempt shell 已存在”

第二十三刀里，它应该做到：

- 有一条从 execution attempt shell 到 invocation receiving edge / executor-entry receiving seam 的最小桥接关系
- 暴露口径只说明“调用壳已经抵达执行入口接收缝”，不说明“执行已经开始”
- 验证时可以只证明 seam 被构造、被返回、被记录或被链路看见
- 命名上避免把 `receiving` 写成 `running`，避免把 `entry seam` 写成 `run result`

第二十三刀里，它不需要做到：

- 完整 executor run loop
- 完整执行操作体
- 完整 action lifecycle 状态机
- 完整 result protocol
- 完整恢复动作 success / failure 判定

## 6. 第二十三刀不包含什么

下面这些内容都不应塞进第二十三刀。

### 6.1 不包含完整 executor

第二十三刀不能把 executor 做成完整执行体。

它最多承认：

- invocation shell 之后，可以出现一个 invocation receiving edge
- 这个 receiving edge 可以落到 executor-entry receiving seam
- 当前链路可以暴露“调用壳已被 entry seam 接住”

它不能承认：

- executor 已经开始运行
- executor 已经拥有完整执行循环
- executor adapter 协议已经定稿
- executor pool、executor routing 或 provider-specific executor 已经成立

### 6.2 不包含 execution scheduler

第二十三刀不能提前实现执行调度器。

它不处理：

- 多 attempt 排队
- 优先级调度
- 并发控制
- 取消、重试、超时和回滚
- 执行资源分配
- 调度队列持久化

白话讲，这一刀只说“壳被接住了”，不说“谁排队、谁抢占、谁重试”。

### 6.3 不包含 execution attempt body

第二十三刀不能产生或展开 attempt body。

原因很简单：

- `attempt body` 一旦出现，就意味着系统开始描述某次具体执行内部要做什么
- 这会自然牵出 operation seam、执行步骤、状态推进、失败分类、结果收集等后续问题
- 这些都已经越过了第二十三刀的 invocation receiving edge 边界

第二十三刀最多为第二十四刀留下入口：

```text
execution attempt intake / invocation receiving edge / executor-entry receiving seam
  -> execution attempt body pre-edge / executor run-body preface / attempt operation seam
```

但它不替第二十四刀把 attempt body pre-edge 写完。

### 6.4 不包含 action lifecycle

第二十三刀不能把调用接收边扩写成完整 action 生命周期。

它不处理：

- action started
- action running
- action succeeded
- action failed
- action canceled
- action retrying
- action finalized

第二十三刀只停在 action 真正运行之前的 receiving seam。

### 6.5 不包含 result layer

第二十三刀不能收 executor 结果，也不能定义最终 result protocol。

它不处理：

- executor return
- execution result
- action result
- result collection
- result reconciliation
- result persistence
- result-to-recovery handoff

白话讲，这一刀还没执行，自然也不应该收结果。

### 6.6 不包含完整 recover / resume / hydrate

第二十三刀不能借 executor-entry 的名字，把恢复动作层直接做完。

它不处理：

- 完整 `recover` 动作执行
- 完整 `resume` 续接策略
- 完整 `hydrate` 灌回逻辑
- 恢复动作的最终 success / failure 判定
- 恢复动作与运行态对象的完整同步

第二十三刀只是在恢复链路后段承认一个“调用壳已经被执行入口接住”的极窄 receiving seam。

### 6.7 不冻结最终协议或 TypeScript 结构

第二十三刀不能把窄边界误用成最终设计定稿。

它不冻结：

- 最终 schema
- 最终 rule table
- 最终 protocol
- 最终 TypeScript 类树
- 最终目录树
- 最终字段枚举
- 最终错误枚举
- 最终序列化格式

当前可以出现临时 carrier、marker、stub result 或 placeholder，但这些都只是为最小链路服务，不是最终格式承诺。

## 7. 与第二十二刀 / 第二十四刀的边界

### 7.1 与第二十二刀的边界

第二十二刀应负责：

- `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后的最小 `execution attempt shell`
- `executor invocation shell` 的最小成立
- `runner call boundary` 的最小暴露
- 证明“dispatch token 已抵达调用边界，但还没有被 attempt intake 接住”

第二十三刀不应回头做这些事。

第二十三刀只接在它之后：

```text
execution attempt shell / executor invocation shell / runner call boundary
  -> execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

如果实现中只能证明 execution attempt shell 存在，却不能证明 invocation receiving edge 或 executor-entry receiving seam 已经独立成立，那就不是第二十三刀 done。

### 7.2 与第二十四刀的边界

第二十四刀最自然的入口是：

```text
execution attempt intake / invocation receiving edge / executor-entry receiving seam
  -> execution attempt body pre-edge / executor run-body preface / attempt operation seam
```

第二十四刀可以继续回答：

- attempt intake 之后，是否可以出现一个极窄 execution attempt body pre-edge
- executor run-body preface 如何承认“执行体前言已形成”，但仍不必完整执行
- attempt operation seam 如何把 entry seam 推进到具体 operation 之前或边界上

第二十三刀不能替第二十四刀回答：

- attempt body 的最终字段是什么
- run-body preface 是否开始执行 operation
- operation seam 如何处理 timeout、cancel、retry、result 或 failure
- executor run 的最终协议是什么

白话讲，第二十三刀只把“调用壳被接收”站住；第二十四刀才适合继续触碰“执行体前沿 / operation seam”。

## 8. 与 recover / resume / hydrate 的关系

第二十三刀仍然在恢复链路后段，但不是恢复动作层本身。

它和三者的关系可以这样理解：

- 对 `recover` 来说，invocation receiving edge 最多表示某个恢复相关调用壳已经抵达 executor entry seam，不表示 recover 动作已经执行
- 对 `resume` 来说，invocation receiving edge 最多表示某个续接相关调用壳已经被执行入口接住，不表示已有过程已经继续推进
- 对 `hydrate` 来说，invocation receiving edge 最多表示某个灌回相关调用壳可能进入执行体之前的接收缝，不表示状态已经灌回运行对象

因此，第二十三刀应保持下面这些限制：

- 不把 attempt intake 写成 recover result
- 不把 invocation receiving edge 写成 resume continuation
- 不把 executor-entry receiving seam 写成 hydrate commit
- 不把 receiving seam 的存在写成任何动作已经成功

白话讲，它只是“调用入口已接住”的窄边，不是“已经找回 / 已经续接 / 已经灌回”。

## 9. 与 runner / executor 的关系

### 9.1 与 runner 的关系

第二十三刀位于 runner call boundary 内侧的极窄前沿，但它不是完整 runner。

它可以让 runner 最小暴露：

- 当前已有 execution attempt shell
- attempt shell 之后可以形成 execution attempt intake
- invocation shell 可以被 executor-entry receiving seam 接住

它不能让 runner 承担：

- 完整运行循环
- 完整执行调度
- 完整 action lifecycle
- 完整 execution attempt body
- 完整结果收口

### 9.2 与 executor 的关系

第二十三刀靠近 executor 入口，但不进入 executor run body。

它可以承认：

- executor-entry receiving seam 作为下一层边界的名字
- invocation receiving edge 面向 executor entry
- 当前还没有真实运行 executor

它不能承认：

- executor adapter 已实现
- executor run body 已开始
- executor result 已返回
- provider-specific executor 已绑定

这里的白话边界是：

- execution attempt shell 像“已经递到窗口前的办理单”
- invocation receiving edge 像“窗口把单子接住了”
- executor-entry receiving seam 像“单子被放进入口托盘”
- 但工作人员还没开始办理，也没有办完回执

## 10. 最小桥接链

第二十三刀完成后，最小桥接链至少应能被这样理解：

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
  -> execution attempt shell / executor invocation shell / runner call boundary
  -> execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

这条链的重点不是“所有名词都已经有最终实现”，而是：

- 每一层都比上一层更靠近真正执行
- 每一层都只承认自己负责的最小事实
- 第二十三刀新增的事实只是最后一段 intake / receiving edge / entry seam

如果当前实现或文档把最后两段压成：

```text
execution attempt shell
  -> executor run body
```

那就是越界，因为它跳过了第二十三刀要保留的 invocation receiving edge。

## 11. 推荐实施顺序

如果后续真的开始编码，第二十三刀建议按下面顺序实施。

### 11.1 第一步：先确认第二十二刀入口

先确认当前链路已经能最小暴露：

- `execution dispatch pre-edge`
- `runner dispatch token`
- `executor-call stub`
- `execution attempt shell`
- `executor invocation shell`
- `runner call boundary`

如果这些还没站住，不要抢做第二十三刀。

### 11.2 第二步：只新增 attempt intake 的最小对象或标记

新增的东西应该足够小，只表达：

- invocation shell 已经被接到 attempt intake
- receiving edge 已经出现
- executor-entry receiving seam 已经可被链路看见

它不应表达：

- attempt body 已经开始
- executor 已经运行
- action lifecycle 已经推进
- result 已经生成

### 11.3 第三步：把 shell 与 receiving seam 拆开

实现或文档里至少要能看出三层：

```text
runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
  -> execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

如果 `execution attempt shell` 和 `invocation receiving edge` 只是同一个字段、同一个概念或同一句话的两个名字，这一刀就没有站住。

### 11.4 第四步：保留第二十四刀入口

第二十三刀完成时，只应留下下一条窄边：

```text
execution attempt intake / invocation receiving edge / executor-entry receiving seam
  -> execution attempt body pre-edge / executor run-body preface / attempt operation seam
```

不要顺手把第二十四刀的 body pre-edge、run-body preface 或 operation seam 一起做完。

## 12. 最小验证方式

第二十三刀的验证可以很轻，但必须能证明它不是纯纸面概念。

建议至少满足下面几类验证之一：

- smoke 级链路验证：最小输入能从 execution attempt shell 走到 invocation receiving edge
- stub 驱动验证：用 placeholder 或 stub result 证明 executor-entry receiving seam 被构造并返回
- 结构暴露验证：当前链路能明确暴露“execution attempt intake 已存在”，而不是只暴露“execution attempt shell 已存在”
- 命名边界验证：grep 或类型检查能看出 attempt shell、invocation receiving edge、attempt body pre-edge 没有互相冒充

验证时不要求：

- executor 真正运行
- attempt body 被执行
- result 被生成
- retry / cancel / timeout 被处理
- recover / resume / hydrate 完整闭环

白话讲，验证目标是“单子被窗口接住了”，不是“单子已经办完了”。

## 13. done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `execution attempt shell / executor invocation shell / runner call boundary` 之后的最小 execution attempt intake 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式接收成立
- invocation shell 之后的最小 `invocation receiving edge / executor-entry receiving seam` 已真实存在，哪怕目前字段很少，只够表达“这个调用壳先被执行入口接住”
- 当前链路目前只负责把 receiving seam 暴露出来和返回最小状态，还没有承担正式 executor run、执行调度、生命周期推进、结果收口或恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 receiving seam 挂接闭环验证
- 当前 runner dispatch token、execution attempt shell、executor invocation shell、invocation receiving edge、executor-entry receiving seam 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 executor、完整 action lifecycle、完整 execution attempt body / result 或完整 recover / resume / hydrate
- 当前实现已经能证明“runner call boundary”“execution attempt intake”“executor-entry receiving seam”是相邻窄层，而不是同一层换名字
- 当前 invocation receiving edge 只是为第二十四刀留下最小 execution attempt body pre-edge、executor run-body preface 或 attempt operation seam 的下一窄入口，而不是提前决定第二十四刀的完整 executor 运行协议、执行体结构或最终动作生命周期

换句话说，只要“receiving seam 站出来了、attempt intake 和 attempt shell 分开了、当前链路暴露 entry seam 了、越界忍住了”，即使还不精细，也足够进入第二十四刀。

## 14. 反模式

出现下面任一情况，都说明第二十三刀正在越界或没有立住：

- `execution attempt shell` 之后仍然没有独立的 execution attempt intake，或只是 attempt shell 的换名说法
- 名义上有 invocation receiving edge，但实际只是说“未来这里会执行 executor”，没有更明确的 receiving seam 和最小挂接关系
- 当前链路仍然只暴露 execution attempt shell，没有暴露其后的更明确最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`
- invocation receiving edge 与 runner call boundary、attempt shell、attempt body pre-edge、executor run body 之间的职责边界仍然混在一起
- 为了让链路显得更完整，提前把完整 executor、execution scheduler、action lifecycle、execution attempt body、result、完整 recover、完整 resume、完整 hydrate 或最终 schema / rule table / protocol 一起写进来了
- executor-entry receiving seam 已经承担真实 executor 运行、调度、重试、生命周期推进、结果生成或结果收口职责
- receiving seam 接口已经被硬写成“未来最终 executor entry API 必须如此”的强约束
- 代码或文档虽然看起来能跑通，但职责混写到第二十四刀已无法自然接入最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`

这类情况的共同特征是：

- 要么 attempt shell 之后的最小 receiving seam 没立住
- 要么 `execution attempt shell -> execution attempt intake -> attempt body pre-edge` 的最小接线没立住
- 要么当前链路对 receiving seam 的最小暴露没立住
- 要么已经把第二十四刀甚至更后面的 attempt body、executor run body、operation seam、result 或恢复动作层提前绑死

## 15. 第二十三刀后的第二十四刀入口

第二十三刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第二十四刀：

- 第二十三刀的 done-enough 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `execution attempt shell / executor invocation shell / runner call boundary`、`execution attempt intake / invocation receiving edge / executor-entry receiving seam`、`execution attempt body pre-edge / executor run-body preface / attempt operation seam` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`，而不是回头重写第二十一刀、第二十二刀或第二十三刀，或直接跳去完整 executor / execution scheduler / action lifecycle / result / 完整 recover / resume / hydrate

满足这些条件后，第二十四刀才适合进入例如：

- attempt intake 之后、但仍然不是完整执行体的最小 execution attempt body pre-edge
- 面向 executor run body 的第一条极窄 preface
- `invocation receiving edge / executor-entry receiving seam` 之后、但仍然不是完整 executor 运行的下一小段

这里的关键不是“第二十四刀一次做多大”，而是：

- 第二十三刀已经证明 attempt shell 之后、真正执行体之前的最小 invocation receiving edge 是成立的
- 第二十四刀可以从 receiving edge 再往 attempt body pre-edge 方向收，而不是回头补 attempt shell，也不是直接宣布完整 executor、execution scheduler、action lifecycle、execution attempt body / result 或完整恢复动作层完成

## 16. 最终判定口径

第二十三刀是否完成，可以收敛成下面这句验收口径：

- 当 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后的最小 `execution attempt shell / executor invocation shell / runner call boundary` 已经成立，且 execution attempt shell 之后、真正执行体之前的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam` 也已经成立，当前链路能够明确暴露“executor-entry receiving seam 已存在”的事实，同时实现没有越界吞掉完整 executor、完整 execution scheduler、完整 action lifecycle、完整 execution attempt body、完整 result、完整 recover、resume、hydrate 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 execution attempt shell，没有 invocation receiving edge”“receiving edge 只是 attempt shell 的换名说法”“一做 executor-entry receiving seam 就直接偷跑完整 executor、execution scheduler、action lifecycle、execution attempt body、result 或完整 recover / resume / hydrate”，都不应算完成。
