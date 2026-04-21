# agentCore 第十九实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十九实施切片指南**。

它只回答一类问题：

- 如果第十八刀已经完成，第十九轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 runner、executor、action lifecycle、执行调度、候选执行、结果层、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第二十刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十八刀指南或完成清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 runner 设计稿
- 最终 runner intake 设计稿
- 最终 executor、execution scheduler 或 action lifecycle 设计稿
- 最终候选执行、结果收口或恢复动作层设计稿
- 最终 `recover / resume / hydrate` 设计稿
- 最终 schema、最终 rule table、最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十八刀做完之后，第十九刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十九刀不是启动 runner，也不是执行候选，而是在第十八刀将固定的 `runner handoff token / runner intake stub / execution handoff pre-entry` 之后，先补一条**完整 runner 执行前的极窄 runner intake lane / runner intake receiving strip / execution-intake-facing seam**。它只让 handoff token 被 intake 侧最小接住、看见、放到接收通道里，不让 runner 开始真正执行。

## 2. 为什么它自然接在第十八刀之后

第十七刀已经把恢复链路推进到完整 runner 之前的准备前沿：

```text
candidate body seam / candidate detail intake
  -> pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
```

第十八刀将自然固定这片准备前沿之后的第一个极窄 handoff 入口：

```text
pre-runner readiness seam / runner-facing pre-edge
  -> runner handoff token / runner intake stub / execution handoff pre-entry
```

也就是说，第十八刀解决的是：

- readiness seam 之后不再只是“候选快要能面向 runner”
- 当前链路已经能最小表达“一个 runner-facing handoff token 可以被准备出来”
- runner intake 侧可以先出现一个 stub 或 pre-entry，用来承认 token 将被交给 intake
- 但它仍然不进入完整 runner intake lane，不执行候选，不启动 executor，不冻结最终 runner 协议

第十八刀刻意不会回答下面这些问题：

- handoff token 到了 runner intake stub 之后，runner intake 侧是否已经有一条极窄接收路径
- token 是否已经能被 intake 侧最小接住、记录、暴露为“已被接收但未执行”
- runner intake receiving strip 和后续 pre-execution latch 应该怎样分开
- runner intake lane 是否可以独立被看见，但不承担执行准备闩门、调度、执行或结果收口

白话讲，第十八刀让“runner 前的 handoff token / intake stub 出现”站住；第十九刀最自然就是继续问：**token 已经到了 intake stub 之后，能不能先出现一条完整 runner 执行前的极窄接收通道，让 intake 侧承认它收到了 token，但还不打开执行闸门。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `runner handoff token`，就直接把完整 runner intake、执行调度、executor、action lifecycle 和结果收口一起做掉
- 第二十刀只能同时补 runner intake lane、pre-execution latch、execution readiness gate 和执行入口，导致边界变粗

所以，第十九刀最自然不是回头重写第十七刀或第十八刀，也不是直接打通完整 runner，而是先把 **`runner handoff token / runner intake stub` 之后、完整 runner 执行之前的最小 runner intake lane / runner intake receiving strip / execution-intake-facing seam** 站住。

## 3. 第十九刀依赖哪些上位文档 / 边界文档

第十九刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-seventeenth-implementation-slice-guide-v1.md`

这份文档负责给第十九刀提供**runner 前 readiness 坐标**。

它支撑第十九刀的方式是：

- 明确第十七刀只做到 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`
- 明确第十七刀不是完整 runner，不是 runner intake，不是执行器，也不是结果收口
- 帮助第十九刀确认自己不是补 readiness seam，而是在第十八刀 handoff token 之后继续向 intake 接收面收束

白话讲，没有第十七刀的 runner-facing pre-edge，第十九刀就会失去“为什么 handoff token 能进入 intake 侧”的外侧支点。

### 3.2 第十八刀的并行前置假设

第十八刀将自然固定：

- `pre-runner readiness seam / runner-facing pre-edge` 之后的第一个极窄 `runner handoff token`
- `runner intake stub` 的最小承认点
- `execution handoff pre-entry` 的独立成立
- 当前链路最小暴露“handoff token 已经可以面向 runner intake stub”

第十九刀以这个结果为直接上游前提。

它支撑第十九刀的方式是：

- 明确第十九刀不是补 pre-runner readiness seam
- 明确第十九刀不是补 handoff token 或 intake stub 本身
- 明确第十九刀只在 token / stub 之后，再立一条完整 runner 执行前的 intake receiving strip

白话讲，第十八刀负责让“交接令牌已经能到 runner intake stub 门口”；第十九刀只负责让“runner intake 侧已经有一条极窄接收通道把它接住”能被看见。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十九刀提供**实现落位感**。

它支撑第十九刀的方式是：

- 提醒第十九刀仍然处在恢复链后段的候选执行之前区域
- 帮助第十九刀只落到 runner intake receiving strip，而不是直接铺完整 runner、executor 或执行调度器
- 防止第十九刀把“token 已被 intake 侧接收”误写成“恢复动作已经开始执行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十九刀提供**链路位置感与越界控制**。

它支撑第十九刀的方式是：

- 明确恢复链路是从 recognition result 一路逐层收束到候选形成、runner 前准备和 runner intake 前沿
- 帮助第十九刀把 readiness seam、handoff token、intake receiving strip、pre-execution latch 拆成相邻但不同的窄层
- 防止第十九刀把 intake receiving、execution readiness、runner execution 和结果收口混成一层

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十九刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十九刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十九刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 runner intake receiving strip 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第十九刀最多说明“恢复相关候选的 handoff token 已被 runner intake 侧最小接收”，不能说恢复动作已经开始执行。

## 4. 当前建议的第十九刀是什么

### 4.1 切片名称

建议把第十九刀收敛成：

**`runner handoff token / runner intake stub` 之后、完整 runner 执行前的最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`**

也可以白话地叫成：

**runner intake 收到 handoff token 后、执行闸门打开前的最小接收通道**

这里的关键词是：

- `runner intake lane`
- `runner intake receiving strip`
- `execution-intake-facing seam`
- `handoff token` 之后的 runner intake 接收边

它不是完整 runner，不是 executor，不是 action lifecycle，不是执行调度，也不是 pre-execution latch。

### 4.2 这第十九刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十八刀预计固定的 `runner handoff token / runner intake stub / execution handoff pre-entry` 之后，最小承认“runner intake 侧可以出现一条 receiving strip”
2. 让当前链路结构上能看出：handoff token 之后不是直接进入执行，而是先进入一个极窄 runner intake lane
3. 给第二十刀留下自然入口：runner intake lane 之后的最小 `pre-execution latch / execution readiness latch / runner pre-execution gate`

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
```

这里的关键不是把第十九刀做成 runner，而是先把：

- 第十八刀预计站住的最小 runner handoff token / runner intake stub
- token / stub 之后、完整 runner 执行前的最小 runner intake receiving strip
- 当前链路对这条 intake receiving strip 的最小暴露

这三者真实拆开。

## 5. 第十九刀包含什么

第十九刀建议只包含下面这些内容。

### 5.1 runner intake 接收通道的最小承认点

它只负责一件事：

- 在 `runner handoff token / runner intake stub` 之后，承认“runner intake 侧已经有一条极窄接收通道”

第十九刀里，它应该做到：

- 明确 runner intake lane 位于 handoff token / intake stub 与 pre-execution latch 之间
- 明确它回答的是“handoff token 是否已经被 runner intake 侧接住”
- 让当前实现结构上能看出：它是 intake stub 内侧的下一窄层，不是 handoff token 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 receiving strip 成立

第十九刀里，它不需要做到：

- 完整 runner intake 协议
- 完整 runner 执行
- 完整 executor
- 完整 execution scheduler
- 完整 action lifecycle
- 完整候选执行
- 完整结果收口

### 5.2 handoff token 到 receiving strip 的最小过渡

它只负责一件事：

- 让第十八刀的 `runner handoff token` 不再停留在“可交给 intake stub”，而是最小地交给“runner intake receiving strip 已接收”

第十九刀里，它应该做到：

- 存在一个最小过渡关系，表达 token 已被 runner intake lane 接住
- 这个过渡可以非常薄，只表达“接收成立”，不表达“执行准备完成”
- 过渡结果可以只是最小 carrier、marker、receipt、stub result 或命名清晰的状态暴露
- 当前链路能区分“token 已生成”和“token 已被 intake receiving strip 接收”

第十九刀里，它不需要做到：

- token 验签或完整合法性矩阵
- token 到最终 runner job 的完整转换
- token 生命周期管理
- 多 token 排队、抢占、取消、重试或并发控制
- 执行前完整 readiness gate

### 5.3 当前链路对 receiving strip 的最小暴露

它只负责一件事：

- 让当前链路能被验证为“runner intake receiving strip 已存在”，而不是只说“token 未来会被接收”

第十九刀里，它应该做到：

- 至少有一个窄场景能暴露 `runner intake lane` 或同义接收边已经成立
- 暴露内容只需要足够说明“handoff token 已进入 intake receiving strip”
- 暴露方式不冻结最终字段名、状态枚举、目录树或 protocol
- 验证可以是 smoke 级、stub 级或文档驱动的最小链路验证

第十九刀里，它不需要做到：

- 完整 runner state machine
- 完整 execution state machine
- 完整 recover/resume/hydrate 输出协议
- 完整 observability、trace、audit 或结果对象

## 6. 第十九刀不包含什么

这一刀必须明确排除下面这些内容：

- 不实现完整 runner
- 不实现完整 executor
- 不实现完整 execution scheduler
- 不实现完整 action lifecycle
- 不实现候选选择、排序、执行或结果收口
- 不实现完整 runner intake 协议
- 不实现完整 pre-execution latch
- 不实现完整 execution readiness gate
- 不实现完整 recover 动作层
- 不实现完整 resume 续接层
- 不实现完整 hydrate 灌回层
- 不实现完整 recover/resume/hydrate 协调器
- 不冻结最终 schema
- 不冻结最终 rule table
- 不冻结最终 protocol
- 不冻结最终 TypeScript 类树、目录树、字段枚举或状态枚举

白话讲，第十九刀只是“token 被 runner intake 侧接住了”，不是“runner 已经准备好执行”，更不是“runner 已经执行完并产出结果”。

## 7. 与第十八刀 / 第二十刀的边界

### 7.1 与第十八刀的边界

第十八刀负责：

- `pre-runner readiness seam` 之后的第一个 `runner handoff token`
- `runner intake stub`
- `execution handoff pre-entry`
- 让当前链路最小暴露“handoff token 已经能面向 runner intake stub”

第十九刀不应回头重写这些内容。

第十九刀只接住第十八刀的结果：

```text
runner handoff token / runner intake stub
  -> runner intake lane / runner intake receiving strip
```

如果第十九刀把自己的职责写成“生成 handoff token”，就是退回第十八刀；如果写成“runner 已经执行”，就是越过第二十刀甚至更后面。

### 7.2 与第二十刀的边界

第二十刀最自然的入口应该是：

- `pre-execution latch`
- `execution readiness latch`
- `runner pre-execution gate`

这些对象位于 runner intake lane 之后，用来回答：

- token 被 intake 侧接住之后，是否已经可以进入执行前闸门
- 执行前最小 readiness latch 是否成立
- runner 在真正执行前是否有一个可见的 gate

第十九刀只给第二十刀留下入口，不替第二十刀写完。

因此，第十九刀可以说：

- “receiving strip 之后自然会进入 pre-execution latch”

但不应该说：

- “pre-execution latch 的完整规则已经定稿”
- “runner pre-execution gate 已经完成”
- “runner 已经具备执行 readiness”
- “executor 可以开始执行候选”

## 8. 与 recover / resume / hydrate 的关系

第十九刀仍然处在恢复链路后段的 runner 前接收区域。

它和 `recover / resume / hydrate` 的关系应该这样理解：

- `recover` 提供找回与整理压力，但第十九刀不是完整 recover 动作
- `resume` 提供续接方向，但第十九刀不是完整 resume 策略
- `hydrate` 提供运行对象灌回方向，但第十九刀不是完整 hydrate 逻辑
- runner intake receiving strip 只是让恢复链路后段的 handoff token 被 runner intake 侧最小接收

白话讲，第十九刀最多是在“恢复链路把一个可交接的执行前令牌送到 runner intake 侧”之后，承认 intake 侧已经接住它；它不负责找回、续接、灌回这些大动作的完整实现。

第十九刀里可以保留下面这种关系：

```text
recover / resume / hydrate formal boundary
  -> recovery-side candidate chain
  -> runner-facing handoff token
  -> runner intake receiving strip
```

但不能写成：

```text
runner intake receiving strip
  -> complete recover execution
  -> complete resume lifecycle
  -> complete hydrate runtime rebuild
```

后一种写法会把第十九刀越界成完整恢复执行层。

## 9. 与 runner / executor 的关系

第十九刀和 runner 的关系是：

- 它属于 runner intake 侧的最小接收边
- 它可以被 runner-facing 命名触达
- 它让 handoff token 被 intake 侧看见和接住
- 它仍然不启动 runner 执行

第十九刀和 executor 的关系是：

- 它不创建 executor
- 它不调度 executor
- 它不执行候选
- 它不推进 action lifecycle
- 它不给 executor 冻结输入协议

可以把它理解成一条很窄的门廊：

```text
handoff token 已到门口
  -> runner intake receiving strip 把 token 接进门廊
  -> 后面才可能有 pre-execution latch
  -> 再后面才可能有 runner execution / executor
```

第十九刀只修“门廊”，不修“闸门”，更不修“机器开始运转”。

## 10. 最小桥接链

第十九刀完成后，最小桥接链应该至少能被描述成：

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
```

这条链的最小验收重点是：

- handoff token 不是终点
- intake stub 不是完整 runner
- receiving strip 已经独立存在
- receiving strip 之后仍然没有启动执行
- 第二十刀可以自然继续接 `pre-execution latch / execution readiness latch / runner pre-execution gate`

## 11. 推荐实施顺序

如果后续真实实现按这份 guide 落地，建议按下面顺序推进。

1. 先确认第十八刀的 `runner handoff token / runner intake stub / execution handoff pre-entry` 已经在最小链路中成立。
2. 再新增或标出一条极窄 `runner intake lane / runner intake receiving strip`，只负责接收 handoff token。
3. 再补一条最小过渡，让 `runner handoff token` 能进入 receiving strip，但不转换成最终 runner job。
4. 再暴露一个最小结果或标记，说明“handoff token 已被 intake receiving strip 接住”。
5. 最后补最小验证，证明当前链路能看到 receiving strip，而不是直接跳入执行。

这个顺序的重点不是把实现做复杂，而是避免把三件事混在一起：

- 第十八刀的 token / stub
- 第十九刀的 intake receiving strip
- 第二十刀的 pre-execution latch

## 12. 最小验证方式

第十九刀的验证应保持很轻。

推荐的最小验证方式是：

- `git diff --check` 级别的文档格式检查
- 文档或实现 smoke 中能看到 `runner handoff token -> runner intake receiving strip` 的最小桥接关系
- 如果有代码实现，最多验证一个 stub / happy-path：handoff token 被 intake lane 接收后，暴露“received / accepted into intake lane”一类最小状态
- 验证输出不能要求完整 runner、executor、action lifecycle、执行调度或结果收口已经存在

如果这一刀只写 guide 文档，那么最小验证就是：

- 文档只新增目标 guide 文件
- 文档明确包含第十八刀前置、第十九刀主体、第二十刀入口
- 文档没有把第十九刀写成完整 runner 或执行层
- `git diff --check` 通过

## 13. done-enough

下面这些情况，即使实现还很粗糙，也可以判定第十九刀 **done-enough**：

- `runner handoff token / runner intake stub` 之后已经出现独立的 `runner intake lane / runner intake receiving strip`
- 当前链路能最小表达“handoff token 已被 intake receiving strip 接收”
- receiving strip 与 handoff token 已经拆开，不互相冒充
- receiving strip 与第二十刀的 pre-execution latch 已经拆开，不提前承担 execution readiness gate
- 当前实现或文档没有冻结最终 runner 协议、最终 schema、最终 rule table、最终字段枚举或最终目录树
- 当前验证只证明 receiving strip 存在和可被看见，不要求执行

换句话说，只要“token 被 intake 侧接住了、接收通道和 token/stub 分开了、接收通道和执行闸门分开了、越界忍住了”，这一刀就足够进入第二十刀。

## 14. 反模式

下面这些写法都属于第十九刀反模式。

- 把 `runner intake receiving strip` 写成完整 runner intake 协议
- 把 `handoff token` 直接转换成最终 runner job
- 一接收 token 就启动 executor
- 一接收 token 就推进 action lifecycle
- 一接收 token 就执行候选或写入结果层
- 把 receiving strip 写成 pre-execution latch 的完整规则表
- 把 receiving strip 写成 runner pre-execution gate 的最终实现
- 把第十九刀扩成完整 recover/resume/hydrate 动作层
- 借第十九刀冻结最终 schema、rule table、protocol、字段枚举、状态枚举或 TypeScript 类树
- 为了“让链路完整”，把第二十刀甚至更后面的执行入口、结果收口、错误恢复和重试协议一起做完

这些反模式的共同问题是：

- 要么没有让 receiving strip 独立成立
- 要么把 receiving strip 和第十八刀的 token / stub 混成一层
- 要么把 receiving strip 和第二十刀的 pre-execution latch 混成一层
- 要么直接越界成完整 runner / executor / execution lifecycle

## 15. 第十九刀后的第二十刀入口

第十九刀完成后，第二十刀最自然的入口是：

**runner intake lane 之后的最小 `pre-execution latch / execution readiness latch / runner pre-execution gate`**

第二十刀可以开始回答：

- runner intake receiving strip 已经接住 token 之后，执行前是否需要一个最小闸门
- 这个闸门如何表达“尚未执行，但已经准备进入执行前判定”
- execution readiness latch 怎样被看见，但仍然不等于完整 runner 执行

第十九刀只需要给第二十刀留下下面这条自然入口：

```text
runner intake lane / runner intake receiving strip
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
```

第十九刀不替第二十刀回答：

- pre-execution latch 的完整规则是什么
- runner pre-execution gate 的最终字段是什么
- 执行 readiness 怎样完整计算
- executor 何时启动
- action lifecycle 怎样推进
- 执行结果怎样收口

## 16. 最终判定口径

第十九刀是否完成，可以收敛成下面这句验收口径：

- 当第十八刀的 `runner handoff token / runner intake stub / execution handoff pre-entry` 已经成立，且其后已经真实站住一条独立的 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`，当前链路能够明确暴露“handoff token 已被 runner intake 侧最小接收”的事实，同时实现或文档没有越界吞掉完整 runner、executor、action lifecycle、候选执行、完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，第十九刀就算完成

如果还停留在“只有 handoff token，没有 intake receiving strip”“receiving strip 只是 intake stub 的换名说法”“一接收 token 就直接偷跑完整 runner、executor、action lifecycle 或完整 `recover / resume / hydrate`”，都不应算完成。
