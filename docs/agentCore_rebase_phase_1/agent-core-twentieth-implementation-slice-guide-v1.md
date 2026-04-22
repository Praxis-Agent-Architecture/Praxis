# agentCore 第二十实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第二十实施切片指南**。

它只回答一类问题：

- 如果第十九刀已经完成，第二十轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 runner、executor、execution scheduler、action lifecycle、执行尝试、结果层、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第二十一刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十九刀指南或完成清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 runner 设计稿
- 最终 runner execution 设计稿
- 最终 executor、execution scheduler 或 action lifecycle 设计稿
- 最终 execution attempt、result layer 或恢复执行层设计稿
- 最终 `recover / resume / hydrate` 设计稿
- 最终 schema、最终 rule table、最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十九刀做完之后，第二十刀先落哪一小段”收敛成一个可执行建议。

白话讲，第二十刀不是启动 runner，也不是调用 executor，而是在第十九刀已经站住的 `runner intake lane / runner intake receiving strip / execution-intake-facing seam` 之后，先补一道**完整 runner execution 之前的极窄 pre-execution latch / execution readiness latch / runner pre-execution gate**。它只表达“已经可以进入执行前就绪门”，但门后面的执行、调度、调用和结果都不在这一刀里做。

## 2. 为什么它自然接在第十九刀之后

第十九刀已经把 runner handoff token 之后的接收侧站住：

```text
runner handoff token / runner intake stub
  -> runner intake lane / runner intake receiving strip / execution-intake-facing seam
```

第十九刀解决的是：

- `runner handoff token / runner intake stub` 之后，不再只是“token 将来会被接收”
- runner intake 侧已经有一条极窄 receiving strip，可以承认 token 已被接住
- 当前链路已经能最小暴露“runner intake lane 已存在”
- 但它仍然不判断执行前 readiness，不打开 execution gate，不启动 runner，不调用 executor，也不进入结果层

第十九刀刻意不会回答下面这些问题：

- token 被 intake receiving strip 接住之后，是否已经出现一道执行前门闩
- runner intake lane 之后，是否能最小表达“可以进入执行前就绪门”
- pre-execution latch 与 runner intake receiving strip、runner dispatch pre-edge 应该怎样分开
- execution readiness latch 是否可以独立被看见，但不承担执行调度、executor call、执行尝试或结果收口

白话讲，第十九刀让“runner intake 侧已经接住 token”站住；第二十刀最自然就是继续问：**token 已经被 intake lane 接住之后，能不能先出现一道极窄执行前门闩，说明它可以进入执行前就绪判断，但还不真正执行。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `runner intake receiving strip`，就直接把 runner dispatch、executor call、execution attempt、action lifecycle 和 result layer 一起做掉
- 第二十一刀只能同时补 pre-execution latch、dispatch token、executor-call stub、执行尝试和结果收口，导致边界变粗

所以，第二十刀最自然不是回头重写第十九刀，也不是直接打通完整 runner execution，而是先把 **`runner intake lane / runner intake receiving strip` 之后、完整 runner execution 之前的最小 `pre-execution latch / execution readiness latch / runner pre-execution gate`** 站住。

## 3. 第二十刀依赖哪些上位文档 / 边界文档

第二十刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-nineteenth-implementation-slice-guide-v1.md`

这份文档负责给第二十刀提供**直接起点**。

它支撑第二十刀的方式是：

- 明确第十九刀只做到 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`
- 明确第十九刀不是 pre-execution latch，不是 runner execution，不是 executor，也不是结果收口
- 帮助第二十刀确认自己不是补 handoff token 或 receiving strip，而是在 receiving strip 之后继续向执行前门闩收束

白话讲，没有第十九刀的 runner intake receiving strip，第二十刀就会失去“为什么现在可以谈 execution readiness latch”的施工起点。

### 3.2 `agent-core-nineteenth-implementation-slice-done-checklist-v1.md`

这份文档负责给第二十刀提供**进入条件**。

它支撑第二十刀的方式是：

- 要求第十九刀已经能暴露“runner intake lane 已存在”
- 要求 `pre-runner readiness seam`、`runner handoff token / runner intake stub`、`runner intake lane / runner intake receiving strip` 已经分层
- 明确第二十刀入口是最小 `pre-execution latch / execution readiness latch / runner pre-execution gate`
- 防止第二十刀回头把 receiving strip 改名成 readiness latch，却没有新增独立执行前门闩

白话讲，第二十刀必须建立在“runner intake 接收通道真的站住了”之上，而不是替第十九刀补课。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第二十刀提供**实现落位感**。

它支撑第二十刀的方式是：

- 提醒第二十刀仍然处在恢复链后段、候选执行之前的最小桥接区域
- 帮助第二十刀只落到 pre-execution latch，而不是直接铺完整 runner、executor 或执行调度器
- 防止第二十刀把“可以进入执行前就绪门”误写成“恢复动作已经开始执行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第二十刀提供**链路位置感与越界控制**。

它支撑第二十刀的方式是：

- 帮助第二十刀继续沿恢复链路逐层向内收，而不是把 intake receiving、pre-execution latch、dispatch token、executor call、execution result 压成一层
- 帮助区分 receiving strip、readiness latch、dispatch pre-edge、runner execution 这些相邻但不同的问题域
- 防止第二十刀把 latch / gate 写成完整 action lifecycle 或最终 execution protocol 的入口定稿

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第二十刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第二十刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第二十刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 pre-execution latch 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第二十刀最多说明“恢复链路后段已经有一道执行前就绪门”，不能说恢复动作已经开始执行，更不能说恢复动作已经完成。

## 4. 当前建议的第二十刀是什么

### 4.1 切片名称

建议把第二十刀收敛成：

**`runner intake lane / runner intake receiving strip` 之后、完整 runner execution 之前的最小 `pre-execution latch / execution readiness latch / runner pre-execution gate`**

也可以白话地叫成：

**runner intake 接收通道之后、真正执行之前的第一道就绪门闩**

这里的关键词是：

- `pre-execution latch`
- `execution readiness latch`
- `runner pre-execution gate`
- `runner intake receiving strip` 之后的最小执行前门闩

它不是完整 runner，不是 executor，不是 execution scheduler，不是 action lifecycle，不是 execution attempt，也不是 result layer。

### 4.2 这第二十刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十九刀已经站住的 `runner intake lane / runner intake receiving strip / execution-intake-facing seam` 之后，最小承认“执行前可以出现一道 readiness latch / gate”
2. 让当前链路结构上能看出：runner intake receiving strip 之后不是直接进入执行，而是先进入一个极窄 pre-execution latch
3. 给第二十一刀留下自然入口：pre-execution latch 之后的最小 `execution dispatch pre-edge / runner dispatch token / executor-call stub`

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
  -> runner intake lane 之后、完整 runner execution 之前的最小 pre-execution latch / execution readiness latch / runner pre-execution gate
```

这里的关键不是把第二十刀做成 runner execution，而是先把：

- 第十九刀已经站住的最小 runner intake receiving strip
- receiving strip 之后、dispatch token 之前的最小 pre-execution latch
- 当前链路对这道 execution readiness latch 的最小暴露

这三者真实拆开。

## 5. 第二十刀包含什么

第二十刀建议只包含下面这些内容。

### 5.1 pre-execution latch 的最小承认点

它只负责一件事：

- 在 `runner intake lane / runner intake receiving strip` 之后，承认“执行前可以有一道最小 latch / gate”

第二十刀里，它应该做到：

- 明确 pre-execution latch 位于 runner intake receiving strip 与 execution dispatch pre-edge 之间
- 明确它回答的是“接收完成后，是否可以进入执行前就绪门”
- 让当前实现结构上能看出：它是 receiving strip 内侧的下一窄层，不是 receiving strip 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 latch 成立

第二十刀里，它不需要做到：

- 完整 execution readiness 规则矩阵
- 完整 runner dispatch
- 完整 executor call
- 完整 execution attempt
- 完整 action lifecycle
- 完整 result layer

### 5.2 receiving strip 到 readiness latch 的最小过渡

它只负责一件事：

- 让第十九刀的 `runner intake receiving strip` 不再停留在“已接收”，而是最小地交给“执行前就绪门已出现”

第二十刀里，它应该做到：

- 存在一个最小过渡关系，表达 receiving strip 之后已经进入 pre-execution latch
- 这个过渡可以非常薄，只表达“进入执行前门闩”，不表达“执行已经开始”
- 过渡结果可以只是最小 carrier、marker、receipt、stub result 或命名清晰的状态暴露
- 当前链路能区分“token 已被 intake receiving strip 接收”和“token 已进入 pre-execution latch”

第二十刀里，它不需要做到：

- 完整 dispatch token 生成
- executor-call 参数构造
- execution attempt 生命周期管理
- 多任务排队、抢占、取消、重试或并发控制
- 执行结果生成或收集

### 5.3 当前链路对 readiness latch 的最小暴露

它只负责一件事：

- 让当前链路能被验证为“pre-execution latch 已存在”，而不是只说“runner intake receiving strip 未来会进入执行”

第二十刀里，它应该做到：

- 至少有一个窄场景能暴露 `pre-execution latch` 或同义执行前门闩已经成立
- 暴露内容只需要足够说明“runner intake receiving strip 已进入 execution readiness latch”
- 暴露方式不冻结最终字段名、状态枚举、目录树或 protocol
- 验证可以是 smoke 级、stub 级或文档驱动的最小链路验证

第二十刀里，它不需要做到：

- 完整 runner state machine
- 完整 execution state machine
- 完整 recover/resume/hydrate 输出协议
- 完整 observability、trace、audit 或结果对象

## 6. 第二十刀不包含什么

这一刀必须明确排除下面这些内容：

- 不实现完整 runner
- 不实现完整 executor
- 不实现完整 execution scheduler
- 不实现完整 action lifecycle
- 不实现完整 execution attempt
- 不实现候选选择、排序、执行或结果收口
- 不实现完整 runner intake 协议
- 不实现完整 dispatch token
- 不实现完整 executor-call stub
- 不实现完整 recover 动作层
- 不实现完整 resume 续接层
- 不实现完整 hydrate 灌回层
- 不实现完整 recover/resume/hydrate 协调器
- 不冻结最终 schema
- 不冻结最终 rule table
- 不冻结最终 protocol
- 不冻结最终 TypeScript 类树、目录树、字段枚举或状态枚举

白话讲，第二十刀只是“接收通道之后出现了执行前门闩”，不是“runner 已经开始执行”，更不是“executor 已经被调用并产出结果”。

## 7. 与第十九刀 / 第二十一刀的边界

### 7.1 与第十九刀的边界

第十九刀负责：

- `runner handoff token / runner intake stub` 之后的最小 `runner intake lane`
- `runner intake receiving strip`
- `execution-intake-facing seam`
- 让当前链路最小暴露“handoff token 已被 runner intake 侧接收”

第二十刀不应回头重写这些内容。

第二十刀只接住第十九刀的结果：

```text
runner intake lane / runner intake receiving strip
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
```

如果第二十刀把自己的职责写成“接收 handoff token”，就是退回第十九刀；如果写成“dispatch token 已生成并调用 executor”，就是越过第二十一刀甚至更后面。

### 7.2 与第二十一刀的边界

第二十一刀最自然的入口应该是：

- `execution dispatch pre-edge`
- `runner dispatch token`
- `executor-call stub`

这些对象位于 pre-execution latch 之后，用来回答：

- 执行前门闩成立之后，是否已经可以形成最小 dispatch 前沿
- runner 是否可以最小表达“即将调度执行”，但仍未完整执行
- executor-call stub 是否可以出现，但不冻结最终 executor 协议

第二十刀只给第二十一刀留下入口，不替第二十一刀写完。

因此，第二十刀可以说：

- “pre-execution latch 之后自然会进入 execution dispatch pre-edge”

但不应该说：

- “runner dispatch token 的完整结构已经定稿”
- “executor-call stub 已经完成”
- “executor 可以开始执行候选”
- “execution attempt 已经启动或产出结果”

## 8. 与 recover / resume / hydrate 的关系

第二十刀仍然处在恢复链路后段的 runner 执行前区域。

它和 `recover / resume / hydrate` 的关系应该这样理解：

- `recover` 提供找回与整理压力，但第二十刀不是完整 recover 动作
- `resume` 提供续接方向，但第二十刀不是完整 resume 策略
- `hydrate` 提供运行对象灌回方向，但第二十刀不是完整 hydrate 逻辑
- pre-execution latch 只是让恢复链路后段的 runner intake 接收结果可以进入执行前就绪门

白话讲，第二十刀最多是在“恢复链路把一个可交接的候选送入 runner intake 侧并被接收”之后，承认它面前有一道执行前就绪门；它不负责找回、续接、灌回这些大动作的完整实现，也不负责执行这些动作。

第二十刀里可以保留下面这种关系：

```text
recover / resume / hydrate formal boundary
  -> recovery-side candidate chain
  -> runner intake receiving strip
  -> pre-execution latch / execution readiness latch
```

但不能写成：

```text
pre-execution latch
  -> complete recover execution
  -> complete resume lifecycle
  -> complete hydrate runtime rebuild
```

后一种写法会把第二十刀越界成完整恢复执行层。

## 9. 与 runner / executor 的关系

第二十刀和 runner 的关系是：

- 它属于 runner execution 之前的最小 readiness gate
- 它可以被 runner-facing 命名触达
- 它让 runner intake receiving strip 之后出现一道可见的执行前门闩
- 它仍然不启动 runner 执行

第二十刀和 executor 的关系是：

- 它不创建 executor
- 它不调度 executor
- 它不调用 executor
- 它不执行候选
- 它不推进 action lifecycle
- 它不给 executor 冻结输入协议

可以把它理解成一扇还没打开的闸门：

```text
handoff token 已被 intake 接收
  -> pre-execution latch 让“执行前就绪门”出现
  -> 后面才可能有 dispatch token / executor-call stub
  -> 再后面才可能有 runner execution / executor / result
```

第二十刀只修“闸门的门闩”，不修“调度按钮”，更不修“机器开始运转”。

## 10. 最小桥接链

第二十刀完成后，最小桥接链应该至少能被描述成：

```text
cursor advancement recognition result
  -> acceptance / ack result
  -> downstream handoff / downstream consumption
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
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
```

这条链的最小验收重点是：

- receiving strip 不是终点
- pre-execution latch 不是完整 runner execution
- readiness latch 已经独立存在
- readiness latch 之后仍然没有 dispatch、executor call 或 execution attempt
- 第二十一刀可以自然继续接 `execution dispatch pre-edge / runner dispatch token / executor-call stub`

## 11. 推荐实施顺序

如果后续真实实现按这份 guide 落地，建议按下面顺序推进。

1. 先确认第十九刀的 `runner intake lane / runner intake receiving strip / execution-intake-facing seam` 已经在最小链路中成立。
2. 再新增或标出一道极窄 `pre-execution latch / execution readiness latch`，只负责表达执行前就绪门已经出现。
3. 再补一条最小过渡，让 `runner intake receiving strip` 能进入 pre-execution latch，但不转换成 dispatch token。
4. 再暴露一个最小结果或标记，说明“runner intake receiving strip 已进入 execution readiness latch”。
5. 最后补最小验证，证明当前链路能看到 readiness latch，而不是直接跳入 dispatch 或执行。

这个顺序的重点不是把实现做复杂，而是避免把三件事混在一起：

- 第十九刀的 intake receiving strip
- 第二十刀的 pre-execution latch
- 第二十一刀的 execution dispatch pre-edge / runner dispatch token / executor-call stub

## 12. 最小验证方式

第二十刀的验证应保持很轻。

推荐的最小验证方式是：

- `git diff --check` 级别的文档格式检查
- 文档或实现 smoke 中能看到 `runner intake receiving strip -> pre-execution latch` 的最小桥接关系
- 如果有代码实现，最多验证一个 stub / happy-path：receiving strip 进入 latch 后，暴露“latched / ready gate reached”一类最小状态
- 验证输出不能要求完整 runner、executor、action lifecycle、执行调度、execution attempt 或结果收口已经存在

如果这一刀只写 guide 文档，那么最小验证就是：

- 文档只新增目标 guide 文件
- 文档明确包含第十九刀前置、第二十刀主体、第二十一刀入口
- 文档没有把第二十刀写成完整 runner、executor、dispatch 或执行层
- `git diff --check` 通过

## 13. done-enough

下面这些情况，即使实现还很粗糙，也可以判定第二十刀 **done-enough**：

- `runner intake lane / runner intake receiving strip` 之后已经出现独立的 `pre-execution latch / execution readiness latch`
- 当前链路能最小表达“runner intake receiving strip 已进入 execution readiness latch”
- readiness latch 与 receiving strip 已经拆开，不互相冒充
- readiness latch 与第二十一刀的 dispatch pre-edge / runner dispatch token 已经拆开，不提前承担 dispatch 或 executor-call 职责
- 当前实现或文档没有冻结最终 runner 协议、最终 executor 协议、最终 schema、最终 rule table、最终字段枚举或最终目录树
- 当前验证只证明 readiness latch 存在和可被看见，不要求执行

换句话说，只要“执行前门闩站出来了、门闩和接收通道分开了、门闩和 dispatch / executor call 分开了、越界忍住了”，这一刀就足够进入第二十一刀。

## 14. 反模式

下面这些写法都属于第二十刀反模式。

- 把 `pre-execution latch` 写成完整 execution readiness 规则表
- 把 `runner intake receiving strip` 直接转换成最终 runner job
- 一进入 latch 就生成完整 runner dispatch token
- 一进入 latch 就调用 executor
- 一进入 latch 就推进 action lifecycle
- 一进入 latch 就执行候选或写入结果层
- 把 readiness latch 写成 executor-call stub 的完整协议
- 把 readiness latch 写成 runner execution gate 的最终实现
- 把第二十刀扩成完整 recover/resume/hydrate 动作层
- 借第二十刀冻结最终 schema、rule table、protocol、字段枚举、状态枚举或 TypeScript 类树
- 为了“让链路完整”，把第二十一刀甚至更后面的执行入口、结果收口、错误恢复和重试协议一起做完

这些反模式的共同问题是：

- 要么没有让 pre-execution latch 独立成立
- 要么把 readiness latch 和第十九刀的 receiving strip 混成一层
- 要么把 readiness latch 和第二十一刀的 dispatch / executor-call 混成一层
- 要么直接越界成完整 runner / executor / execution lifecycle / result layer

## 15. 第二十刀后的第二十一刀入口

第二十刀完成后，第二十一刀最自然的入口是：

**pre-execution latch 之后的最小 `execution dispatch pre-edge / runner dispatch token / executor-call stub`**

第二十一刀可以开始回答：

- pre-execution latch 已经成立之后，runner 是否可以出现一个最小 dispatch 前沿
- 这个 dispatch token 如何表达“即将递给 executor-call stub”，但仍不等于完整执行
- executor-call stub 怎样被看见，但仍然不冻结最终 executor 协议或执行结果协议

第二十刀只需要给第二十一刀留下下面这条自然入口：

```text
pre-execution latch / execution readiness latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

第二十刀不替第二十一刀回答：

- dispatch token 的最终结构是什么
- executor-call stub 的最终字段是什么
- runner 如何调度 executor
- execution attempt 如何开始、重试、取消或收口
- result layer 如何承接执行输出
- action lifecycle 如何推进
- recover/resume/hydrate 如何完成动作执行

## 16. 一句话总结

第二十刀建议只做一件事：

```text
runner intake lane / runner intake receiving strip
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
```

它让“runner intake 已接收”之后出现一道可见的执行前就绪门，但不执行、不调度、不调用 executor、不产出结果、不冻结最终协议。

第二十一刀则自然从这道门之后继续接：

```text
pre-execution latch
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

这就是第二十刀最小、最稳、也最不容易越界的落点。
