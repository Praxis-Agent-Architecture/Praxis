# agentCore 第十七实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十七实施切片指南**。

它只回答一类问题：

- 如果第十六刀已经完成，第十七轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 runner、执行器、action lifecycle、候选选择 / 排序 / 执行、结果收口、完整 action candidate、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十八刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十六刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 action candidate 设计稿
- 最终 action candidate runner 设计稿
- 最终执行器或 action lifecycle 设计稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table 或最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十六刀做完之后，第十七刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十七刀不是启动 runner，也不是让候选真正执行，而是在第十六刀预计固定的 `candidate body seam / candidate detail intake / candidate-body-facing edge` 之后，先补一个**完整 runner 之前的极窄 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck**。

## 2. 为什么它自然接在第十六刀之后

第十五刀已经把下面这段最小链路推进到第一个候选壳入口：

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
```

第十六刀将自然接在第十五刀之后，固定下面这片更内侧窄层：

```text
candidate shell / pre-ack / first candidate shell entry
  -> candidate body seam / candidate detail intake / candidate-body-facing edge
```

也就是说，第十六刀解决的是：

- candidate shell 之后不再只停留在“壳已被承认”
- 壳内侧已经出现最小候选体邻接面
- 当前链路可以最小表达“candidate detail intake 已存在”
- 但它仍然不启动 runner，不做完整执行，不冻结完整候选体 schema

第十六刀刻意不会回答下面这些问题：

- candidate detail intake 之后，候选是否已经接近 runner
- 完整 runner 之前是否可以先有一个极窄 readiness seam
- 候选是否能被表达成“快要能面向 runner”，但 runner 尚未 intake、尚未 handoff、尚未启动
- runner intake token、runner intake stub 或 execution handoff pre-entry 应该怎样出现

白话讲，第十六刀让“候选壳后面有最小候选体 / 细节接入面”这件事站住；第十七刀最自然就是继续问：**候选体邻接面之后，能不能先出现一个完整 runner 之前的极窄准备边，说明候选快要能面向 runner，但还没有把 runner 真的接进来。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `candidate detail intake`，就直接把完整 runner、执行器、候选执行和结果收口一起做掉
- 第十八刀只能同时补 pre-runner readiness、runner handoff token、runner intake stub 和 runner intake 逻辑，导致边界变粗

所以，第十七刀最自然不是回头重写第十五刀或第十六刀，也不是直接打通完整 runner，而是先把 **candidate body seam / candidate detail intake 之后、完整 runner 之前的最小 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck** 站住。

## 3. 第十七刀依赖哪些上位文档 / 边界文档

第十七刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-fifteenth-implementation-slice-guide-v1.md`

这份文档负责给第十七刀提供**更外侧 candidate shell 坐标**。

它支撑第十七刀的方式是：

- 明确第十五刀只做到 `candidate shell / pre-ack / first candidate shell entry`
- 明确第十五刀不是完整 action candidate，不是 runner，也不是完整 `recover / resume / hydrate`
- 帮助第十七刀确认自己不是重新立壳，而是在壳后面的 candidate body/detail intake 之后继续向 runner 前沿收束

白话讲，没有第十五刀的候选壳入口，第十七刀就会失去“这个候选为什么能继续靠近 runner”的外侧支点。

### 3.2 第十六刀的并行前置假设

第十六刀将自然固定：

- candidate shell 之后的最小 `candidate body seam`
- `candidate detail intake` 的第一条窄接线
- `candidate-body-facing edge` 的独立成立
- 当前链路最小暴露“candidate detail intake 已存在”

第十七刀以这个结果为直接上游前提。

它支撑第十七刀的方式是：

- 明确第十七刀不是补 candidate shell
- 明确第十七刀不是补 candidate body seam 或 candidate detail intake
- 明确第十七刀只在 detail intake 之后，再立一个完整 runner 之前的 readiness pre-edge

白话讲，第十六刀负责让“候选体细节能被接入”；第十七刀只负责让“候选快要能面向 runner 的前置准备边”能被看见。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十七刀提供**实现落位感**。

它支撑第十七刀的方式是：

- 提醒第十七刀仍然处在恢复链后段的候选形成 / 候选执行之前区域
- 帮助第十七刀只落到 pre-runner readiness seam，而不是直接铺完整 runner 或执行器
- 防止第十七刀把“候选快要能面向 runner”误写成“恢复动作已经可以运行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十七刀提供**链路位置感与越界控制**。

它支撑第十七刀的方式是：

- 明确恢复链路是从 recognition result 一路逐层收束到候选形成前后区域
- 帮助第十七刀把 candidate shell、candidate body seam、pre-runner readiness 和 runner handoff 拆成相邻但不同的窄层
- 防止第十七刀把 readiness seam、runner intake、runner execution 和结果收口混成一层

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十七刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十七刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十七刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 readiness seam 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第十七刀最多说明“恢复相关候选快要能交给 runner 前沿”，不能说恢复动作已经开始执行。

## 4. 当前建议的第十七刀是什么

### 4.1 切片名称

建议把第十七刀收敛成：

**`candidate body seam / candidate detail intake` 之后、完整 runner 之前的最小 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`**

也可以白话地叫成：

**候选体细节接入后、runner 尚未启动前的最小执行准备前沿**

这里的关键词是：

- `pre-runner readiness seam`
- `runner-facing pre-edge`
- `candidate execution readiness precheck`
- `candidate detail intake` 之后的 runner 前准备边

它不是完整 runner，不是执行器，不是 runner intake，不是候选执行，也不是结果收口。

### 4.2 这第十七刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十六刀预计固定的 `candidate body seam / candidate detail intake` 之后，最小承认“候选可以出现一个完整 runner 之前的 readiness seam”
2. 让当前链路结构上能看出：candidate detail intake 之后不是直接跳进 runner，而是先进入一个极窄 runner-facing pre-edge
3. 给第十八刀留下自然入口：第一个极窄 runner handoff token / runner intake stub / execution handoff pre-entry

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
```

这里的关键不是把第十七刀做成 runner，而是先把：

- 第十六刀预计站住的最小 candidate body seam / candidate detail intake
- detail intake 之后、完整 runner 之前的最小 runner-facing pre-edge
- 当前链路对这片 pre-runner readiness seam 的最小暴露

这三者真实拆开。

## 5. 第十七刀包含什么

第十七刀建议只包含下面这些内容。

### 5.1 runner 前准备边的最小承认点

它只负责一件事：

- 在 `candidate body seam / candidate detail intake` 之后，承认“候选已经可以出现一个完整 runner 之前的极窄准备边”

第十七刀里，它应该做到：

- 明确 pre-runner readiness seam 位于 candidate detail intake 与 runner handoff / runner intake 之间
- 明确它回答的是“候选是否已经快要能面向 runner”
- 让当前实现结构上能看出：它是 detail intake 内侧的下一窄层，不是 detail intake 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 readiness seam 成立

第十七刀里，它不需要做到：

- 完整 runner
- 完整 runner intake
- 完整执行器
- 完整候选执行
- 完整 action lifecycle
- 完整结果收口

### 5.2 candidate detail intake 到 runner-facing pre-edge 的最小过渡

它只负责一件事：

- 让第十六刀的 `candidate detail intake` 不再停留在“候选体细节可被接入”，而是最小地交给“runner 前准备边已被承认”

第十七刀里，它应该做到：

- 明确 `candidate detail intake` 与 `pre-runner readiness seam` 不等价
- 至少让实现结构上能看出：一旦 detail intake 成立，内侧会留下一个更窄的 runner-facing pre-edge
- 允许当前过渡非常窄，只表达“这片 detail intake 现在先交给 runner 前准备边”
- 让后续第十八刀有自然入口，而不是回头重拆第十五刀或第十六刀

第十七刀里，它不需要做到：

- 完整 runner handoff
- 完整 runner intake stub
- 完整 execution handoff
- 完整执行调度
- 完整候选选择、排序或执行

### 5.3 当前链路对 pre-runner readiness seam 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 candidate detail intake”前移到“存在第一个极窄 pre-runner readiness seam”

第十七刀里，它应该做到：

- 不再只证明 candidate detail intake 已经存在
- 改为至少能看出 detail intake 之后已经开始出现 runner 前准备边
- 继续保持 readiness seam 角色，不顺手吞掉 runner handoff、runner intake、执行器、action lifecycle、结果收口或完整 `recover / resume / hydrate`

第十七刀里，它不需要做到：

- 完整 candidate 对象落地
- 完整 candidate schema 落地
- 完整 action runner 落地
- 完整 consumer action 执行落地

## 6. 第十七刀不包含什么

为了保证第十七刀足够小，这一轮应明确排除下面这些内容：

- 完整 action candidate 对象
- 完整 action candidate 内容构造
- 完整 action candidate schema
- 完整候选字段全集
- 完整候选选择策略
- 完整候选排序策略
- 完整候选执行策略
- 完整 runner handoff token 语义
- 完整 runner intake stub
- 完整 action candidate runner
- 完整 consumer action runner
- 完整执行器
- 完整 action lifecycle
- 完整结果对象与结果收口
- 完整 `recover` 真正收口
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 完整 recover-intake consumer 实现
- 完整 downstream consumption protocol
- 完整 pre-action 校验矩阵
- 最终 consumer schema
- 最终 recover intake schema
- 最终 action candidate schema
- 最终 rule table
- 最终 protocol
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举

一句话说，第十七刀只做：

- candidate detail intake 之后、完整 runner 之前的最小 pre-runner readiness seam / runner-facing pre-edge 先站住

不做：

- 完整 runner 已经接手
- 完整候选已经执行
- 完整 `recover / resume / hydrate` 已经展开

## 7. 与第十六刀、第十八刀的边界

### 7.1 与第十六刀的边界

第十六刀负责：

- candidate shell 之后的最小 candidate body seam
- candidate detail intake 的第一条窄接线
- candidate-body-facing edge 的独立成立
- 当前链路最小暴露“candidate detail intake 已存在”

第十七刀负责：

- candidate detail intake 之后的第一个极窄 pre-runner readiness seam
- 候选快要能面向 runner 的前置准备边被最小承认
- 当前链路最小暴露“pre-runner readiness seam 已存在”

它们的边界是：

```text
第十六刀
  candidate body seam / candidate detail intake / candidate-body-facing edge

第十七刀
  pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
```

第十七刀不能把第十六刀的 candidate detail intake 重命名成 readiness seam，也不能把 readiness seam 反向退化成 detail intake 的一句未来说明。

### 7.2 与第十八刀的边界

第十八刀最自然可以接：

- 第一个极窄 runner handoff token
- runner intake stub 的第一条入口边
- execution handoff pre-entry 的最小占位

第十七刀不替第十八刀完成这些内容。

第十七刀只给第十八刀留下自然入口：

```text
pre-runner readiness seam / runner-facing pre-edge
  -> next: runner handoff token / runner intake stub / execution handoff pre-entry
```

白话讲，第十七刀只证明“候选快要能面向 runner”；第十八刀才适合开始讨论第一个 runner handoff token 或 runner intake stub，仍然不应该直接跳到完整 runner。

## 8. 与 recover / resume / hydrate 的关系

第十七刀与 `recover / resume / hydrate` 的关系必须压得很窄。

它可以说：

- 这个 pre-runner readiness seam 未来可能服务于第一个 `recover-intake consumer action candidate`
- 这个 readiness seam 位于恢复链后段、候选执行之前
- 这个 readiness seam 是完整 runner 或恢复动作执行之前的前置准备边

它不能说：

- 完整 `recover` 已经开始执行
- 完整 `resume` 已经开始续接
- 完整 `hydrate` 已经开始灌回
- readiness seam 已经包含恢复动作结果
- readiness seam 已经定义了 `recover / resume / hydrate` 的最终协议或字段全集

白话讲，第十七刀最多让“恢复相关候选快要能交给 runner 前沿”这件事被看见，不能把这条准备边写成恢复动作本身。

## 9. 与 action candidate / runner 的关系

第十七刀与 action candidate 的关系是**候选体之后、执行之前的准备边关系**，不是完整候选关系。

它可以做：

- 承认 candidate detail intake 之后的 runner 前准备边
- 暴露 pre-runner readiness seam 已存在
- 保持 detail intake 与 runner-facing pre-edge 的分层
- 为后续 runner handoff token 留口

它不能做：

- 构造完整 action candidate
- 定义完整 action candidate schema
- 做候选选择 / 排序 / 执行
- 做 runner 调度
- 做 action lifecycle
- 做结果收口

第十七刀与 runner 的关系也必须明确：

- runner 是后续动作执行层，不属于第十七刀
- 第十七刀最多让候选靠近 runner 前沿
- 第十七刀不能为了“方便验证”引入完整 runner、伪 runner 或执行闭环

白话讲，第十七刀不是“候选已经能跑”，而是“候选已经来到 runner 前的准备边”。

## 10. 最小桥接链示意

第十七刀完成后，最小桥接链可以表达成：

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

这条链只证明一件事：

- 候选体细节接入之后，runner 前准备边已经可以被最小承认

它不证明：

- 完整 action candidate 已经构造完
- 完整 runner handoff token 已经存在
- 完整 runner intake 已经存在
- 完整 runner 已经存在
- 完整 `recover / resume / hydrate` 已经存在
- 最终 schema / rule table / protocol 已经冻结

## 11. 推荐实施顺序

第十七刀如果进入实现，建议按下面顺序推进：

1. 先确认第十六刀的 `candidate body seam / candidate detail intake` 已能被当前链路暴露
2. 再给 detail intake 内侧补一个最小 pre-runner readiness seam，而不是直接补 runner handoff 或 runner intake
3. 再让当前链路能最小表达“pre-runner readiness seam 已存在”
4. 再补一个极窄验证路径，证明它不是 candidate detail intake 的换名，也不是完整 runner
5. 最后只留下第十八刀入口：runner handoff token / runner intake stub / execution handoff pre-entry

推荐命名和结构应保持临时性、窄边界和可回滚，不要在这一刀冻结最终命名、最终字段、最终目录树或最终类树。

## 12. 最小验证方式

第十七刀的验证方式可以很轻，但必须证明三件事：

- 当前链路不再只暴露 `candidate detail intake 已存在`
- 当前链路已经能最小暴露 `pre-runner readiness seam 已存在`
- 这个 readiness seam 没有承担 runner intake、runner 执行、候选选择、候选排序、action lifecycle 或结果收口职责

可接受的最小验证形态包括：

- smoke 级调用验证
- stub 驱动验证
- 极窄 happy-path 验证
- 最小链路暴露验证
- 文档级 done-enough 对照验证

不可接受的验证形态包括：

- 为了验证 readiness seam，顺手实现完整 action candidate runner
- 为了验证 readiness seam，冻结最终 action candidate schema
- 为了验证 readiness seam，把 `recover / resume / hydrate` 的完整动作层一起做掉
- 只检查命名存在，却无法证明 detail intake 与 pre-runner readiness seam 是两层

## 13. done-enough 口径

第十七刀做到下面程度，就可以算 done-enough：

- `candidate body seam / candidate detail intake` 之后已经真实站住一个独立的 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
- 当前链路已经能最小暴露“pre-runner readiness seam 已存在”
- readiness seam 明确位于 candidate detail intake 与 runner handoff / runner intake 之间
- readiness seam 没有承担 runner handoff token、runner intake stub、候选选择、候选排序、候选执行、runner、action lifecycle 或结果收口职责
- 当前结构没有冻结最终 schema、rule table、protocol、目录树、类树或字段枚举
- 第十八刀可以自然接到 runner handoff token / runner intake stub / execution handoff pre-entry，而不是回头补第十六刀

一句话说：

- `candidate detail intake -> pre-runner readiness seam` 这条极窄接线站住了，且没有越界成完整 runner，就足够进入第十八刀。

## 14. 明确反模式

出现下面任一情况，都说明第十七刀写偏了：

- 把 pre-runner readiness seam 写成完整 runner
- 把 runner-facing pre-edge 写成 runner intake stub
- 把 candidate execution readiness precheck 写成候选执行器
- 把 readiness seam 写成完整 `recover` 动作
- 把 readiness seam 写成完整 `resume` 或 `hydrate` 逻辑
- 为了“先完整一点”冻结 action candidate schema、rule table、protocol 或字段枚举
- 把第十六刀的 candidate detail intake 改名成 readiness seam，却没有新增独立 runner 前准备层
- 把第十七刀写成第十八刀甚至更后面的 runner handoff、runner intake、runner execution 或 result layer
- 在文档里承诺最终目录树、最终 TS 类树、最终状态枚举或最终动作类树
- 为了验证方便引入完整 runner、伪 runner 或动作执行闭环

这些反模式的共同问题是：

- 要么第十七刀没有真的比第十六刀前进一层
- 要么第十七刀一次前进太多，吞掉了第十八刀和后续动作执行层

## 15. 第十七刀完成后的第十八刀自然入口

第十七刀完成后，第十八刀最自然接到下面这个方向：

- 第一个极窄 runner handoff token
- runner intake stub 的第一条最小入口边
- execution handoff pre-entry 的最小占位

第十八刀仍然不应直接写成：

- 完整 action candidate runner
- 完整执行器
- 完整候选选择、排序或执行
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`
- 最终 schema、rule table、protocol 或 TypeScript 结构定稿

第十七刀给第十八刀留下的入口只应是：

```text
pre-runner readiness seam / runner-facing pre-edge
  -> runner handoff token / runner intake stub / execution handoff pre-entry
```

白话讲，第十七刀收在“runner 门口的准备边”；第十八刀才开始碰“runner 门口的第一个递交令牌或 intake stub”，但仍然不能把门后面的完整 runner 运行过程写完。
