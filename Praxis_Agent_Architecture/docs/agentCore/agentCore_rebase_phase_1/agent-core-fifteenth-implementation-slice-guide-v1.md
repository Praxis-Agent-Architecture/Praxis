# agentCore 第十五实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十五实施切片指南**。

它只回答一类问题：

- 如果第十四刀已经完成，第十五轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 action candidate、完整 action candidate runner、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十六刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十四刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 action candidate 设计稿
- 最终 action candidate runner 设计稿
- 最终 `recover-intake consumer` 设计稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table 或最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十四刀做完之后，第十五刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十五刀不是宣布完整 action candidate 已经形成，也不是启动完整动作执行器，而是在第十四刀已经站住的 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam` 之后，先补一个**第一个极窄 action candidate 候选壳可以被承认、立壳、被入口看见**的前置承认层。

## 2. 为什么它自然接在第十四刀之后

第十四刀已经把下面这条最小桥接链继续往里推进了一层：

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
```

第十四刀解决的是：

- `pre-action consumer boundary / action-candidate-facing edge` 之后，已经不再只是“面向候选”
- boundary 内侧已经单独站住一片完整 action candidate 之前的 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam`
- 当前链路已经能最小暴露“action-candidate-pre-edge 已存在”，而不是只暴露“pre-action consumer boundary 已存在”

但第十四刀刻意没有回答下面这些问题：

- 第一个极窄 action candidate 候选壳怎样被承认
- `minimal action-candidate sightline` 之后，是否已经可以立出一个最小 candidate shell entry
- 第一个 `recover-intake consumer action candidate` 的入口壳是否可以被当前链路看见
- candidate shell 之后的 candidate body、candidate detail、runner 前层、结果收口或 action lifecycle 应该怎样展开

白话讲，第十四刀已经证明“完整 action candidate 之前的最小候选邻接 seam 已存在”；第十五刀最自然就是继续问：**这片 seam 之后，第一个极窄候选壳能不能先被承认和立住，但仍然不生成完整候选对象。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `action-candidate-pre-edge`，就直接把完整 action candidate、候选字段、选择策略和 runner 一起做掉
- 第十六刀只能同时补 candidate shell、candidate body seam、candidate detail intake 和 runner 前置层，导致边界再次变粗

所以，第十五刀最自然不是回头重写第十四刀，也不是直接把完整 action candidate 打通，而是先把 **action-candidate-pre-edge 之后、第一个完整 action candidate 之前的极窄 candidate shell / pre-ack / first candidate shell entry** 站住。

## 3. 第十五刀依赖哪些上位文档 / 边界文档

第十五刀不是凭空起一层，它至少依赖下面这些文档。

### 3.1 `agent-core-fourteenth-implementation-slice-guide-v1.md`

这份文档负责给第十五刀提供**直接起点**。

它支撑第十五刀的方式是：

- 明确第十四刀只做到 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam`
- 明确第十四刀不是完整 action candidate，不是 runner，也不是完整 `recover / resume / hydrate`
- 明确第十五刀最自然应接第一个极窄 action candidate 候选壳或前置承认点

白话讲，没有第十四刀的 action-candidate-pre-edge，第十五刀就会失去“从哪里承认第一个候选壳”的施工起点。

### 3.2 `agent-core-fourteenth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十五刀提供**进入条件与验收前提**。

它支撑第十五刀的方式是：

- 明确当前链路必须已经暴露“action-candidate-pre-edge 已存在”
- 明确 `pre-action consumer boundary` 与 `action-candidate-pre-edge` 已经拆开
- 明确第十五刀不是替第十四刀补 pre-edge，而是在 pre-edge 已站住之后继续往第一个候选壳收

白话讲，它防止第十五刀在第十四刀尚未完成时，直接把“候选壳”写成一个遮羞用的大对象。

### 3.3 `agent-core-thirteenth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十五刀提供**更外侧 consumer boundary 的边界坐标**。

它支撑第十五刀的方式是：

- 明确第十三刀已经站住 `pre-action consumer boundary / action-candidate-facing edge`
- 帮助第十五刀区分更外侧的 boundary、十四刀的 pre-edge、十五刀的 candidate shell entry 三者
- 防止第十五刀把 candidate shell 反向退化成 pre-action consumer boundary 或 action-candidate-facing edge 的换名

白话讲，第十五刀必须知道自己不是在补 pre-action consumer boundary，而是在 pre-edge 内侧先承认一个候选壳。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十五刀提供**实现落位感**。

它支撑第十五刀的方式是：

- 提醒第十五刀仍然处在恢复链后段的候选形成前区域
- 帮助第十五刀只落到 candidate shell / pre-ack / first candidate shell entry，而不是直接铺完整候选树或动作执行树
- 防止第十五刀把“入口能看见候选壳”误写成“完整恢复动作层已经可以运行”

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十五刀提供**链路位置感与越界控制**。

它支撑第十五刀的方式是：

- 明确当前主链从 recognition result 一路收到了 action-candidate-pre-edge
- 明确 pre-edge 之后可以继续长出第一个候选壳入口，但不能越层进入完整 candidate body、runner 或结果层
- 防止第十五刀把候选壳、候选体、候选执行和恢复结果收口混成一层

### 3.6 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十五刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十五刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十五刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 candidate shell 被误写成恢复动作本身、续接策略本身或灌回逻辑本身

白话讲，第十五刀只是在动作候选形成前承认第一个壳，不是在实现完整恢复引擎。

## 4. 当前建议的第十五刀是什么

### 4.1 切片名称

建议把第十五刀收敛成：

**`action-candidate-pre-edge / minimal action-candidate sightline` 之后的第一个极窄 `candidate shell / pre-ack / first candidate shell entry`**

也可以白话地叫成：

**第一个 `recover-intake consumer action candidate` 的最小候选壳入口承认点**

这里的关键词是：

- `candidate shell`
- `pre-ack`
- `first candidate shell entry`
- `recover-intake consumer action candidate` 的最小入口壳

它不是完整 action candidate 对象，也不是完整 action candidate selector、sorter、runner、lifecycle 或 result layer。

### 4.2 这第十五刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十四刀的 `action-candidate-pre-edge / minimal action-candidate sightline` 之后，最小承认“第一个候选壳入口可以存在”
2. 让当前链路结构上能看出：pre-edge 之后不是直接跳进完整 action candidate，而是先进入一个极窄 candidate shell / pre-ack / first candidate shell entry
3. 给第十六刀留下自然入口：candidate shell 之后的最小 candidate body seam、candidate detail intake，或 runner 前的下一窄层

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
```

这里的关键不是把第十五刀做成完整候选，而是先把：

- 第十四刀已经站住的最小 action-candidate-pre-edge
- pre-edge 之后、第一个完整 action candidate 之前的最小 candidate shell entry
- 当前链路对这片候选壳入口承认点的最小暴露

这三者真实拆开。

## 5. 第十五刀包含什么

第十五刀建议只包含下面这些内容。

### 5.1 第一个候选壳入口的最小承认点

它只负责一件事：

- 在 `action-candidate-pre-edge / minimal action-candidate sightline` 之后，承认“第一个极窄 action candidate 候选壳入口可以存在”

第十五刀里，它应该做到：

- 明确 candidate shell 位于 action-candidate-pre-edge 与完整 action candidate 之间
- 明确它回答的是“候选壳能否先被看见 / 被立壳 / 被入口承认”
- 让当前实现结构上能看出：它是 pre-edge 内侧的下一窄层，不是 pre-edge 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 shell entry 成立

第十五刀里，它不需要做到：

- 完整 action candidate 内容构造
- 完整候选字段定义
- 完整候选选择、排序、执行
- 完整 action candidate runner
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`

### 5.2 pre-edge 到 candidate shell 的最小过渡

它只负责一件事：

- 让第十四刀的 `minimal action-candidate sightline` 不再停留在“候选即将被看见”，而是最小地交给“第一个候选壳入口已被承认”

第十五刀里，它应该做到：

- 明确 `action-candidate-pre-edge / minimal action-candidate sightline` 与 `candidate shell / pre-ack / first candidate shell entry` 不等价
- 至少让实现结构上能看出：一旦 pre-edge 成立，内侧会留下一个更窄的 candidate shell entry
- 允许当前过渡非常窄，只表达“这片 pre-edge 现在先交给第一个候选壳入口”
- 让后续第十六刀有自然入口，而不是回头重拆第十三刀或第十四刀

第十五刀里，它不需要做到：

- 完整 candidate body
- 完整 candidate detail intake
- 完整 runner 前校验矩阵
- 完整 runner 执行调度
- 完整恢复结果生成

### 5.3 当前链路对 candidate shell entry 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 action-candidate-pre-edge”前移到“存在第一个极窄 candidate shell / pre-ack / first candidate shell entry”

第十五刀里，它应该做到：

- 不再只证明 action-candidate-pre-edge 已经存在
- 改为至少能看出 pre-edge 之后已经开始出现第一个候选壳入口承认点
- 继续保持 candidate shell entry 角色，不顺手吞掉候选内容、候选选择、runner、action lifecycle、结果收口或完整 `recover / resume / hydrate`

第十五刀里，它不需要做到：

- 完整 candidate 对象落地
- 完整 candidate schema 落地
- 完整 action runner 落地
- 完整 consumer action 执行落地

## 6. 第十五刀不包含什么

为了保证第十五刀足够小，这一轮应明确排除下面这些内容：

- 完整 action candidate 对象
- 完整 action candidate 内容构造
- 完整 action candidate schema
- 完整候选字段全集
- 完整候选选择策略
- 完整候选排序策略
- 完整候选执行策略
- 完整 action candidate runner
- 完整 consumer action runner
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

一句话说，第十五刀只做：

- action-candidate-pre-edge 之后、第一个完整 action candidate 之前的最小 candidate shell / pre-ack / first candidate shell entry 先站住

不做：

- 完整 action candidate 已经形成
- 完整 action runner 已经启动
- 完整 `recover / resume / hydrate` 已经展开

## 7. 与第十四刀、第十六刀的边界

### 7.1 与第十四刀的边界

第十四刀负责：

- `pre-action consumer boundary / action-candidate-facing edge` 之后的最小 `action-candidate-pre-edge`
- `minimal action-candidate sightline / candidate-adjacent seam` 的独立成立
- 当前链路最小暴露“action-candidate-pre-edge 已存在”

第十五刀负责：

- `action-candidate-pre-edge / minimal action-candidate sightline` 之后的第一个极窄 candidate shell entry
- 第一个候选壳能被最小承认、立壳、被入口看见
- 当前链路最小暴露“first candidate shell entry 已存在”

它们的边界是：

```text
第十四刀
  action-candidate-pre-edge / minimal action-candidate sightline

第十五刀
  candidate shell / pre-ack / first candidate shell entry
```

第十五刀不能把第十四刀的 pre-edge 重命名成 candidate shell，也不能把 candidate shell 反向退化成 pre-edge 的一句未来说明。

### 7.2 与第十六刀的边界

第十六刀最自然可以接：

- candidate shell 之后的最小 candidate body seam
- candidate detail intake 的第一条窄接线
- runner 前、但仍然不是 runner 的下一层 candidate detail / readiness seam

第十五刀不替第十六刀完成这些内容。

第十五刀只给第十六刀留下自然入口：

```text
candidate shell / pre-ack / first candidate shell entry
  -> next: minimal candidate body seam / candidate detail intake / pre-runner seam
```

白话讲，第十五刀只立壳；第十六刀才适合开始讨论壳后面最小候选内容接线，仍然不应该直接跳到完整 runner。

## 8. 与 recover / resume / hydrate 的关系

第十五刀与 `recover / resume / hydrate` 的关系必须压得很窄。

它可以说：

- 这个 candidate shell 未来可能服务于第一个 `recover-intake consumer action candidate`
- 这个 candidate shell 位于恢复链后段、动作候选形成前
- 这个 candidate shell 是完整恢复动作层之前的入口承认点

它不能说：

- 完整 `recover` 已经开始执行
- 完整 `resume` 已经开始续接
- 完整 `hydrate` 已经开始灌回
- candidate shell 已经包含恢复动作结果
- candidate shell 已经定义了 `recover / resume / hydrate` 的最终协议或字段全集

白话讲，第十五刀最多让“恢复相关的第一个动作候选壳可以被看见”，不能把这个壳写成恢复动作本身。

## 9. 与 action candidate / runner 的关系

第十五刀与 action candidate 的关系是**壳入口关系**，不是完整候选关系。

它可以做：

- 承认第一个候选壳入口
- 暴露 candidate shell entry 已存在
- 保持 candidate shell 与 pre-edge 的分层
- 为后续 candidate body seam 留口

它不能做：

- 构造完整 action candidate
- 定义完整 action candidate schema
- 做候选选择 / 排序 / 执行
- 做 runner 调度
- 做 action lifecycle
- 做结果收口

第十五刀与 runner 的关系也必须明确：

- runner 是后续动作执行层，不属于第十五刀
- 第十五刀最多给 runner 前的更后续窄层留下方向
- 第十五刀不能为了“方便验证”引入完整 runner 或伪 runner

白话讲，第十五刀不是“候选已经能跑”，而是“候选壳已经能被承认”。

## 10. 最小桥接链示意

第十五刀完成后，最小桥接链可以表达成：

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

这条链只证明一件事：

- 第一个候选壳入口已经可以被最小承认

它不证明：

- 完整 action candidate 已经构造完
- 完整 candidate body 已经存在
- 完整 runner 已经存在
- 完整 `recover / resume / hydrate` 已经存在
- 最终 schema / rule table / protocol 已经冻结

## 11. 推荐实施顺序

第十五刀如果进入实现，建议按下面顺序推进：

1. 先确认第十四刀的 `action-candidate-pre-edge / minimal action-candidate sightline` 已能被当前链路暴露
2. 再给 pre-edge 内侧补一个最小 candidate shell entry，而不是直接补完整 action candidate
3. 再让当前链路能最小表达“first candidate shell entry 已存在”
4. 再补一个极窄验证路径，证明它不是 pre-edge 的换名，也不是完整 action candidate
5. 最后只留下第十六刀入口：candidate body seam / candidate detail intake / pre-runner seam

推荐命名和结构应保持临时性、窄边界和可回滚，不要在这一刀冻结最终命名、最终字段、最终目录树或最终类树。

## 12. 最小验证方式

第十五刀的验证方式可以很轻，但必须证明三件事：

- 当前链路不再只暴露 `action-candidate-pre-edge 已存在`
- 当前链路已经能最小暴露 `first candidate shell entry 已存在`
- 这个 candidate shell entry 没有承担完整候选构造、候选选择、runner 执行或结果收口职责

可接受的最小验证形态包括：

- smoke 级调用验证
- stub 驱动验证
- 极窄 happy-path 验证
- 最小链路暴露验证
- 文档级 done-enough 对照验证

不可接受的验证形态包括：

- 为了验证 candidate shell，顺手实现完整 action candidate runner
- 为了验证 candidate shell，冻结最终 action candidate schema
- 为了验证 candidate shell，把 `recover / resume / hydrate` 的完整动作层一起做掉
- 只检查命名存在，却无法证明 pre-edge 与 candidate shell entry 是两层

## 13. done-enough 口径

第十五刀做到下面程度，就可以算 done-enough：

- `action-candidate-pre-edge / minimal action-candidate sightline` 之后已经真实站住一个独立的 candidate shell / pre-ack / first candidate shell entry
- 当前链路已经能最小暴露“first candidate shell entry 已存在”
- candidate shell entry 明确位于 pre-edge 与完整 action candidate 之间
- candidate shell entry 没有承担 candidate body、candidate detail、候选选择、候选排序、候选执行、runner、action lifecycle 或结果收口职责
- 当前结构没有冻结最终 schema、rule table、protocol、目录树、类树或字段枚举
- 第十六刀可以自然接到 candidate body seam / candidate detail intake / pre-runner seam，而不是回头补第十四刀

一句话说：

- `pre-edge -> candidate shell entry` 这条极窄接线站住了，且没有越界成完整 action candidate，就足够进入第十六刀。

## 14. 明确反模式

出现下面任一情况，都说明第十五刀写偏了：

- 把 candidate shell 写成完整 action candidate
- 把 pre-ack 写成候选选择器
- 把 first candidate shell entry 写成 runner 入口
- 把 candidate shell entry 写成完整 `recover` 动作
- 把 candidate shell entry 写成完整 `resume` 或 `hydrate` 逻辑
- 为了“先完整一点”冻结 action candidate schema、rule table、protocol 或字段枚举
- 把第十四刀的 action-candidate-pre-edge 改名成 candidate shell，却没有新增独立壳入口层
- 把第十五刀写成第十六刀、第十七刀甚至更后面的 candidate body、detail intake、runner 或 result layer
- 在文档里承诺最终目录树、最终 TS 类树、最终状态枚举或最终动作类树
- 为了验证方便引入完整 runner、伪 runner 或动作执行闭环

这些反模式的共同问题是：

- 要么第十五刀没有真的比第十四刀前进一层
- 要么第十五刀一次前进太多，吞掉了第十六刀和后续动作执行层

## 15. 第十五刀完成后的第十六刀自然入口

第十五刀完成后，第十六刀最自然接到下面这个方向：

- candidate shell 之后的最小 candidate body seam
- candidate detail intake 的第一条极窄接线
- runner 前、但仍然不是 runner 的最小 readiness seam

第十六刀仍然不应直接写成：

- 完整 action candidate
- 完整 action candidate runner
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`
- 最终 schema、rule table、protocol 或 TypeScript 结构定稿

白话讲，第十五刀完成后，链路最多来到“第一个候选壳已经被承认”；第十六刀才适合继续问“壳后面最小候选内容 seam 怎么进来”，但仍然要继续保持小切片、强边界、非最终定稿。

