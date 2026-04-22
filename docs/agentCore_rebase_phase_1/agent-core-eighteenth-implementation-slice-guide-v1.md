# agentCore 第十八实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十八实施切片指南**。

它只回答一类问题：

- 如果第十七刀已经完成，第十八轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 runner、完整 runner intake、完整 executor、action lifecycle、候选执行、结果层、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十九刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十七刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 完整 runner 设计稿
- 完整 runner intake 设计稿
- 完整 executor 或 action lifecycle 设计稿
- 完整 candidate execution 设计稿
- 完整 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table 或最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十七刀做完之后，第十八刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十八刀不是启动 runner，也不是建立 runner intake lane，而是在第十七刀已经站住的 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 之后，先补一个**完整 runner intake 与完整 runner 执行之前的极窄 runner handoff token / runner intake stub / execution handoff pre-entry**。

## 2. 为什么它自然接在第十七刀之后

第十七刀已经把下面这条最小桥接链继续往 runner 门口推进了一层：

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
```

第十七刀解决的是：

- `candidate body seam / candidate detail intake` 之后，不再只是“候选体细节已接入”
- detail intake 内侧已经出现一个完整 runner 之前的极窄 readiness seam
- 当前链路已经能最小暴露“pre-runner readiness seam 已存在”
- 候选已经可以被表达成“快要能面向 runner”，但 runner 尚未 intake、尚未 handoff、尚未启动

但第十七刀刻意不会回答下面这些问题：

- readiness seam 之后，最小递交给 runner intake 的形态是什么
- 是否可以先出现一个 runner handoff token，而不建立完整 runner intake lane
- 是否可以先出现一个 runner intake stub，而不让 runner 真正执行候选
- execution handoff pre-entry 应该怎样被最小承认，但仍然不进入完整执行

白话讲，第十七刀让“runner 门口的准备边”站住；第十八刀最自然就是继续问：**准备边之后，能不能先出现一个最小移交令牌 / intake 空壳 / 执行移交前入口，让候选有一个可被 runner intake 接收的递交形态，但还没有进入完整 runner intake 或执行。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `pre-runner readiness seam`，就直接把完整 runner intake、执行器、生命周期推进和结果收口一起做掉
- 第十九刀只能同时补 runner handoff token、runner intake lane、receiving strip、候选执行前调度和执行闭环，导致边界变粗

所以，第十八刀最自然不是回头重写第十七刀，也不是直接打通完整 runner，而是先把 **`pre-runner readiness seam / runner-facing pre-edge` 之后、完整 runner intake 与完整 runner 执行之前的最小 runner handoff token / runner intake stub / execution handoff pre-entry** 站住。

## 3. 第十八刀依赖哪些上位文档 / 边界文档

第十八刀不是凭空起一层，它至少依赖下面这些文档与并行前置事实。

### 3.1 `agent-core-seventeenth-implementation-slice-guide-v1.md`

这份文档负责给第十八刀提供**直接起点**。

它支撑第十八刀的方式是：

- 明确第十七刀只做到 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`
- 明确第十七刀不是完整 runner，不是 runner handoff token，不是 runner intake stub，也不是候选执行
- 帮助第十八刀确认自己不是重做 readiness seam，而是在 readiness seam 之后继续向 runner intake 前入口收束

白话讲，没有第十七刀的 runner 前准备边，第十八刀就会失去“为什么现在可以谈 runner handoff token”的施工起点。

### 3.2 `agent-core-seventeenth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十八刀提供**进入条件**。

它支撑第十八刀的方式是：

- 要求第十七刀已经能暴露“pre-runner readiness seam 已存在”
- 要求 candidate shell、candidate body seam、pre-runner readiness seam 三者已经分层
- 明确第十八刀入口是 `runner handoff token / runner intake stub / execution handoff pre-entry`
- 防止第十八刀回头把 readiness seam 改名成 handoff token，却没有新增独立移交形态

白话讲，第十八刀必须建立在“runner 前准备边真的站住了”之上，而不是替第十七刀补课。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十八刀提供**实现落位感**。

它支撑第十八刀的方式是：

- 提醒第十八刀仍然处在恢复链后段、候选执行之前的最小桥接区域
- 帮助第十八刀只落到 handoff token / intake stub / pre-entry，而不是直接铺完整 runner 或执行器
- 防止第十八刀把“候选可以被移交给 runner intake 的最小形态”误写成“恢复动作已经开始运行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十八刀提供**链路位置感与越界控制**。

它支撑第十八刀的方式是：

- 帮助第十八刀继续沿恢复链路逐层向内收，而不是把 runner handoff、runner intake、runner execution、结果收口压成一层
- 帮助区分 readiness seam、handoff token、intake lane、execution runner 这些相邻但不同的问题域
- 防止第十八刀把 token / stub / pre-entry 写成完整 action lifecycle 的入口协议定稿

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十八刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十八刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十八刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 runner handoff token 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第十八刀最多说明“恢复相关候选有了一个能递到 runner intake 门口的最小移交形态”，不能说恢复动作已经开始执行。

## 4. 当前建议的第十八刀是什么

### 4.1 切片名称

建议把第十八刀收敛成：

**`pre-runner readiness seam / runner-facing pre-edge` 之后、完整 runner intake 与完整执行之前的最小 `runner handoff token / runner intake stub / execution handoff pre-entry`**

也可以白话地叫成：

**runner 门口的第一枚移交令牌 / 第一片 intake 空壳 / 执行移交前入口**

这里的关键词是：

- `runner handoff token`
- `runner intake stub`
- `execution handoff pre-entry`
- `pre-runner readiness seam` 之后的最小 runner 移交形态

它不是完整 runner，不是完整 runner intake lane，不是 executor，不是候选执行，也不是结果收口。

### 4.2 这第十八刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十七刀已经站住的 `pre-runner readiness seam / runner-facing pre-edge` 之后，最小承认“候选可以形成一个递给 runner intake 的 token / stub / pre-entry”
2. 让当前链路结构上能看出：readiness seam 之后不是直接跳进完整 runner intake，而是先进入一个极窄 runner handoff token 或 intake stub
3. 给第十九刀留下自然入口：runner handoff token 之后的最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`

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
  -> pre-runner readiness seam 之后、完整 runner intake 之前的最小 runner handoff token / runner intake stub / execution handoff pre-entry
```

这里的关键不是把第十八刀做成 runner，而是先把：

- 第十七刀已经站住的最小 pre-runner readiness seam
- readiness seam 之后、runner intake lane 之前的最小 handoff token / intake stub / pre-entry
- 当前链路对这片 runner handoff token 的最小暴露

这三者真实拆开。

## 5. 第十八刀包含什么

第十八刀建议只包含下面这些内容。

### 5.1 runner handoff token 的最小承认点

它只负责一件事：

- 在 `pre-runner readiness seam / runner-facing pre-edge` 之后，承认“候选可以拥有一个递给 runner intake 的最小移交形态”

第十八刀里，它应该做到：

- 明确 runner handoff token 位于 pre-runner readiness seam 与 runner intake lane 之间
- 明确它回答的是“候选是否已经有一个可以被 runner intake 接收的最小递交物”
- 让当前实现结构上能看出：它是 readiness seam 内侧的下一窄层，不是 readiness seam 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 token 成立

第十八刀里，它不需要做到：

- 完整 runner intake lane
- 完整 runner 接收流程
- 完整 runner 调度
- 完整 executor
- 完整候选执行
- 完整 action lifecycle
- 完整结果收口

### 5.2 runner intake stub 的第一片空壳

它只负责一件事：

- 让 handoff token 能落在一个极窄 intake stub 上，但不展开完整 intake lane、receiving strip 或 runner 内部协议

第十八刀里，它应该做到：

- 明确 runner intake stub 只是“可以被递到这里”的最小入口壳
- 允许表达“这里未来会被 runner intake lane 接住”，但不要求定义 intake lane 的完整接收逻辑
- 让当前链路能最小区分“有 intake stub”和“runner 已经接收并开始执行”
- 继续保持临时性、窄边界和可回滚

第十八刀里，它不需要做到：

- 完整 intake queue
- 完整 intake receiving strip
- 完整 execution planner
- 完整 runner state machine
- 完整 action lifecycle transition

### 5.3 execution handoff pre-entry 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 pre-runner readiness seam”前移到“存在一个执行移交前入口”

第十八刀里，它应该做到：

- 不再只证明 readiness seam 已经存在
- 改为至少能看出 readiness seam 之后已经开始出现 runner intake 前的最小递交入口
- 继续保持 pre-entry 角色，不顺手吞掉 runner intake lane、runner receiving strip、执行器、action lifecycle、结果收口或完整 `recover / resume / hydrate`

第十八刀里，它不需要做到：

- 完整 candidate execution 对象落地
- 完整 runner input schema 落地
- 完整 execution handoff protocol 落地
- 完整 consumer action 执行落地

## 6. 第十八刀不包含什么

为了保证第十八刀足够小，这一轮应明确排除下面这些内容：

- 完整 action candidate 对象
- 完整 action candidate 内容构造
- 完整 action candidate schema
- 完整候选字段全集
- 完整候选选择策略
- 完整候选排序策略
- 完整候选执行策略
- 完整 runner intake lane
- 完整 runner intake receiving strip
- 完整 execution-intake-facing seam
- 完整 action candidate runner
- 完整 consumer action runner
- 完整 executor 或执行调度器
- 完整 action lifecycle
- 完整结果对象与结果收口
- 完整 `recover` 真正收口
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 完整 recover-intake consumer 实现
- 完整 downstream consumption protocol
- 完整 readiness / preflight / policy 校验矩阵
- 最终 consumer schema
- 最终 recover intake schema
- 最终 runner input schema
- 最终 action candidate schema
- 最终 rule table
- 最终 protocol
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举

一句话说，第十八刀只做：

- pre-runner readiness seam 之后、完整 runner intake 之前的最小 runner handoff token / runner intake stub / execution handoff pre-entry 先站住

不做：

- 完整 runner 已经 intake
- 完整候选已经执行
- 完整 `recover / resume / hydrate` 已经展开

## 7. 与第十七刀、第十九刀的边界

### 7.1 与第十七刀的边界

第十七刀负责：

- candidate detail intake 之后的第一个极窄 pre-runner readiness seam
- 候选快要能面向 runner 的前置准备边被最小承认
- 当前链路最小暴露“pre-runner readiness seam 已存在”

第十八刀负责：

- pre-runner readiness seam 之后的第一个极窄 runner handoff token
- runner intake stub 或 execution handoff pre-entry 的最小承认
- 当前链路最小暴露“runner handoff token / intake stub 已存在”

它们的边界是：

```text
第十七刀
  pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck

第十八刀
  runner handoff token / runner intake stub / execution handoff pre-entry
```

第十八刀不能把第十七刀的 readiness seam 重命名成 handoff token，也不能把 handoff token 反向退化成 readiness seam 的一句未来说明。

### 7.2 与第十九刀的边界

第十九刀最自然可以接：

- runner handoff token 之后的最小 runner intake lane
- runner intake receiving strip 的第一条接收边
- execution-intake-facing seam 的最小占位

第十八刀不替第十九刀完成这些内容。

第十八刀只给第十九刀留下自然入口：

```text
runner handoff token / runner intake stub / execution handoff pre-entry
  -> next: runner intake lane / runner intake receiving strip / execution-intake-facing seam
```

白话讲，第十八刀只证明“候选有了递到 runner intake 门口的最小 token / stub”；第十九刀才适合开始讨论 runner intake 如何接住它，但仍然不应该直接跳到完整 runner 执行。

## 8. 与 recover / resume / hydrate 的关系

第十八刀与 `recover / resume / hydrate` 的关系必须压得很窄。

它可以说：

- 这个 runner handoff token 未来可能服务于第一个 `recover-intake consumer action candidate`
- 这个 intake stub 位于恢复链后段、候选执行之前
- 这个 execution handoff pre-entry 是完整 runner intake 或恢复动作执行之前的前置入口

它不能说：

- 完整 `recover` 已经开始执行
- 完整 `resume` 已经开始续接
- 完整 `hydrate` 已经开始灌回
- runner handoff token 已经包含恢复动作结果
- runner intake stub 已经定义了 `recover / resume / hydrate` 的最终协议或字段全集

白话讲，第十八刀最多让“恢复相关候选有了递交给 runner intake 的最小形态”这件事被看见，不能把这枚 token 或这个 stub 写成恢复动作本身。

## 9. 与 runner / executor 的关系

第十八刀与 runner 的关系是**runner intake 之前的移交关系**，不是完整 runner 关系。

它可以做：

- 承认 pre-runner readiness seam 之后的 runner handoff token
- 暴露 runner intake stub 已存在
- 保持 readiness seam、handoff token、intake stub 的分层
- 为后续 runner intake lane 留口

它不能做：

- 构造完整 runner
- 定义完整 runner input schema
- 做 runner intake lane
- 做 runner 调度
- 做候选执行
- 做 action lifecycle
- 做结果收口

第十八刀与 executor 的关系也必须明确：

- executor 是后续实际执行层，不属于第十八刀
- 第十八刀最多让候选出现一个可移交给 runner intake 的前入口
- 第十八刀不能为了“方便验证”引入完整 executor、伪 executor 或执行闭环

白话讲，第十八刀不是“候选已经被 runner 接收并执行”，而是“候选已经有了递到 runner intake 门口的第一枚 token 或 stub”。

## 10. 最小桥接链示意

第十八刀完成后，最小桥接链可以表达成：

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
  -> pre-runner readiness seam 之后、完整 runner intake 之前的最小 runner handoff token / runner intake stub / execution handoff pre-entry
```

这条链只证明一件事：

- runner 前准备边之后，已经可以最小承认一个递给 runner intake 的 handoff token / stub / pre-entry

它不证明：

- 完整 runner intake lane 已经存在
- 完整 runner receiving strip 已经存在
- 完整 runner 已经存在
- 完整 executor 已经存在
- 完整候选执行已经发生
- 完整 `recover / resume / hydrate` 已经存在
- 最终 schema / rule table / protocol 已经冻结

## 11. 推荐实施顺序

第十八刀如果进入实现，建议按下面顺序推进：

1. 先确认第十七刀的 `pre-runner readiness seam / runner-facing pre-edge` 已能被当前链路暴露
2. 再给 readiness seam 内侧补一个最小 runner handoff token，而不是直接补 runner intake lane
3. 再让这个 token 能落在一个极窄 runner intake stub 或 execution handoff pre-entry 上
4. 再让当前链路能最小表达“runner handoff token / intake stub 已存在”
5. 再补一个极窄验证路径，证明它不是 readiness seam 的换名，也不是完整 runner intake
6. 最后只留下第十九刀入口：runner intake lane / runner intake receiving strip / execution-intake-facing seam

推荐命名和结构应保持临时性、窄边界和可回滚，不要在这一刀冻结最终命名、最终字段、最终目录树或最终类树。

## 12. 最小验证方式

第十八刀的验证方式可以很轻，但必须证明三件事：

- 当前链路不再只暴露 `pre-runner readiness seam 已存在`
- 当前链路已经能最小暴露 `runner handoff token / runner intake stub 已存在`
- 这个 token / stub 没有承担 runner intake lane、runner 执行、候选选择、候选排序、action lifecycle 或结果收口职责

可接受的最小验证形态包括：

- smoke 级调用验证
- stub 驱动验证
- 极窄 happy-path 验证
- 最小链路暴露验证
- 文档级 done-enough 对照验证

不可接受的验证形态包括：

- 为了验证 runner handoff token，顺手实现完整 runner intake lane
- 为了验证 runner intake stub，冻结最终 runner input schema
- 为了验证 execution handoff pre-entry，把 `recover / resume / hydrate` 的完整动作层一起做掉
- 只检查命名存在，却无法证明 readiness seam 与 runner handoff token 是两层

## 13. done-enough 口径

第十八刀做到下面程度，就可以算 done-enough：

- `pre-runner readiness seam / runner-facing pre-edge` 之后已经真实站住一个独立的 runner handoff token / runner intake stub / execution handoff pre-entry
- 当前链路已经能最小暴露“runner handoff token / intake stub 已存在”
- handoff token 明确位于 pre-runner readiness seam 与 runner intake lane 之间
- intake stub 没有承担 runner intake lane、候选选择、候选排序、候选执行、runner 调度、action lifecycle 或结果收口职责
- 当前结构没有冻结最终 schema、rule table、protocol、目录树、类树或字段枚举
- 第十九刀可以自然接到 runner intake lane / runner intake receiving strip / execution-intake-facing seam，而不是回头补第十七刀或第十八刀

一句话说：

- `pre-runner readiness seam -> runner handoff token / runner intake stub` 这条极窄接线站住了，且没有越界成完整 runner intake 或完整 runner，就足够进入第十九刀。

## 14. 明确反模式

出现下面任一情况，都说明第十八刀写偏了：

- 把 runner handoff token 写成完整 runner intake lane
- 把 runner intake stub 写成完整 runner
- 把 execution handoff pre-entry 写成候选执行器
- 把 handoff token 写成完整 `recover` 动作
- 把 intake stub 写成完整 `resume` 或 `hydrate` 逻辑
- 为了“先完整一点”冻结 runner input schema、rule table、protocol 或字段枚举
- 把第十七刀的 pre-runner readiness seam 改名成 handoff token，却没有新增独立移交形态
- 把第十八刀写成第十九刀甚至更后面的 runner intake lane、runner receiving strip、runner execution 或 result layer
- 在文档里承诺最终目录树、最终 TS 类树、最终状态枚举或最终动作类树
- 为了验证方便引入完整 runner、伪 runner、executor 或动作执行闭环

这些反模式的共同问题是：

- 要么第十八刀没有真的比第十七刀前进一层
- 要么第十八刀一次前进太多，吞掉了第十九刀和后续动作执行层

## 15. 第十八刀完成后的第十九刀自然入口

第十八刀完成后，第十九刀最自然接到下面这个方向：

- runner handoff token 之后的最小 runner intake lane
- runner intake receiving strip 的第一条最小接收边
- execution-intake-facing seam 的最小占位

第十九刀仍然不应直接写成：

- 完整 action candidate runner
- 完整 executor
- 完整候选选择、排序或执行
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`
- 最终 schema、rule table、protocol 或 TypeScript 结构定稿

第十八刀给第十九刀留下的入口只应是：

```text
runner handoff token / runner intake stub / execution handoff pre-entry
  -> runner intake lane / runner intake receiving strip / execution-intake-facing seam
```

白话讲，第十八刀收在“runner intake 门口的第一枚移交 token / stub”；第十九刀才开始碰“runner intake 如何接住它的第一条 lane 或 receiving strip”，但仍然不能把接收之后的完整 runner 运行过程写完。
