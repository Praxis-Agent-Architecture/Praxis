# agentCore 第十六实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十六实施切片指南**。

它只回答一类问题：

- 如果第十五刀已经完成，第十六轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 action candidate、完整 action candidate runner、候选选择 / 排序 / 执行、action lifecycle、结果层、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十七刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十五刀指南的替代品
- 全面施工计划
- 最终 roadmap
- 最终 action candidate 设计稿
- 最终 action candidate runner 设计稿
- 最终 candidate schema、rule table 或 protocol 定稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十五刀做完之后，第十六刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十六刀不是宣布完整 action candidate 已经形成，也不是启动 runner，而是在第十五刀已经站住的 `candidate shell / pre-ack / first candidate shell entry` 之后，先补一个**候选壳后面、完整候选体之前的极窄 candidate body seam / candidate detail intake 邻接面**。

## 2. 为什么它自然接在第十五刀之后

第十五刀已经把下面这条最小桥接链继续往里推进了一层：

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

第十五刀解决的是：

- `action-candidate-pre-edge / minimal action-candidate sightline` 之后，已经不再只是“候选即将被看见”
- pre-edge 内侧已经单独站住一个极窄 `candidate shell / pre-ack / first candidate shell entry`
- 当前链路已经能最小暴露“first candidate shell entry 已存在”，而不是只暴露“action-candidate-pre-edge 已存在”

但第十五刀刻意没有回答下面这些问题：

- 候选壳之后，候选体的第一个邻接面怎样被接近
- `first candidate shell entry` 之后，是否可以承载一点点 candidate detail intake
- 候选体是否已经可以被当前链路最小地“面对”，但仍然不是完整 action candidate
- runner 前置 readiness seam、runner-facing pre-edge 或候选执行前校验应该怎样展开

白话讲，第十五刀已经证明“第一个候选壳能被承认、立壳、被入口看见”；第十六刀最自然就是继续问：**这个壳后面，能不能先出现一片极窄候选体邻接面，让候选体可以被接近、被承载一点点 detail intake，但仍然不生成完整 action candidate。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 candidate shell entry，就直接把完整 action candidate、候选字段全集、选择策略、排序策略和 runner 一起做掉
- 第十七刀只能同时补 candidate body seam、runner readiness、runner-facing pre-edge 和执行前校验，导致边界再次变粗

所以，第十六刀最自然不是回头重写第十五刀，也不是直接把完整 action candidate 打通，而是先把 **candidate shell / first candidate shell entry 之后、完整 action candidate 之前的最小 candidate body seam / candidate detail intake / candidate-body-facing edge** 站住。

## 3. 第十六刀依赖哪些上位文档 / 边界文档

第十六刀不是凭空起一层，它至少依赖下面这些文档。

### 3.1 `agent-core-fifteenth-implementation-slice-guide-v1.md`

这份文档负责给第十六刀提供**直接起点**。

它支撑第十六刀的方式是：

- 明确第十五刀只做到 `candidate shell / pre-ack / first candidate shell entry`
- 明确第十五刀不是完整 action candidate，不是 runner，也不是完整 `recover / resume / hydrate`
- 明确第十六刀最自然应接 candidate shell 之后的最小 candidate body seam、candidate detail intake 或 runner 前的更窄层

白话讲，没有第十五刀的 candidate shell entry，第十六刀就会失去“从哪个壳后面接入候选体邻接面”的施工起点。

### 3.2 `agent-core-fourteenth-implementation-slice-guide-v1.md`

这份文档负责给第十六刀提供**更外侧 pre-edge 坐标**。

它支撑第十六刀的方式是：

- 明确第十四刀只做到 `action-candidate-pre-edge / minimal action-candidate sightline`
- 帮助第十六刀区分 pre-edge、candidate shell entry、candidate body seam 三者
- 防止第十六刀把 candidate body seam 反向退化成 action-candidate-pre-edge 或 candidate shell 的换名

白话讲，第十六刀必须知道自己不是在补 pre-edge，也不是在补候选壳，而是在候选壳之后继续接一个候选体邻接面。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十六刀提供**实现落位感**。

它支撑第十六刀的方式是：

- 提醒第十六刀仍然处在恢复链后段的候选形成前区域
- 帮助第十六刀只落到 candidate body seam / candidate detail intake / candidate-body-facing edge，而不是直接铺完整候选树或动作执行树
- 防止第十六刀把“候选体可以被接近”误写成“完整恢复动作层已经可以运行”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十六刀提供**链路位置感与越界控制**。

它支撑第十六刀的方式是：

- 明确当前主链从 recognition result 一路收到了 candidate shell entry
- 明确 shell entry 之后可以继续长出一片候选体邻接面，但不能越层进入完整 candidate、runner 或结果层
- 防止第十六刀把候选壳、候选体、候选执行和恢复结果收口混成一层

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十六刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十六刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十六刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 candidate body seam 被误写成恢复动作本身、续接策略本身或灌回逻辑本身

白话讲，第十六刀只是在候选壳之后承认候选体邻接面，不是在实现完整恢复引擎。

## 4. 当前建议的第十六刀是什么

### 4.1 切片名称

建议把第十六刀收敛成：

**`candidate shell / first candidate shell entry` 之后的最小 `candidate body seam / candidate detail intake / candidate-body-facing edge`**

也可以白话地叫成：

**第一个 `recover-intake consumer action candidate` 的候选体邻接面与细节接入口**

这里的关键词是：

- `candidate body seam`
- `candidate detail intake`
- `candidate-body-facing edge`
- `first candidate shell entry` 之后的最小候选体邻接面

它不是完整 action candidate 对象，也不是完整 action candidate selector、sorter、runner、lifecycle 或 result layer。

### 4.2 这第十六刀的最小组合

这一刀建议只包含下面三件事：

1. 在第十五刀的 `candidate shell / pre-ack / first candidate shell entry` 之后，最小承认“候选体邻接面可以存在”
2. 让当前链路结构上能看出：candidate shell 之后不是直接跳进完整 action candidate，而是先进入一个极窄 candidate body seam / candidate detail intake
3. 给第十七刀留下自然入口：candidate body seam 之后的最小 pre-runner readiness seam、runner-facing pre-edge，或 candidate execution readiness precheck

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
  -> candidate shell 之后、完整 action candidate 之前的最小 candidate body seam / candidate detail intake / candidate-body-facing edge
```

这里的关键不是把第十六刀做成完整候选，而是先把：

- 第十五刀已经站住的最小 candidate shell / first candidate shell entry
- candidate shell 之后、完整 action candidate 之前的最小 candidate body seam
- 当前链路对这片候选体邻接面与 detail intake 的最小暴露

这三者真实拆开。

## 5. 第十六刀包含什么

第十六刀建议只包含下面这些内容。

### 5.1 候选体邻接面的最小承认点

它只负责一件事：

- 在 `candidate shell / pre-ack / first candidate shell entry` 之后，承认“候选体可以被接近，但还没有完整形成”

第十六刀里，它应该做到：

- 明确 candidate body seam 位于 candidate shell entry 与完整 action candidate 之间
- 明确它回答的是“候选壳后面，候选体的第一片邻接面能否先被看见”
- 让当前实现结构上能看出：它是 shell 内侧的下一窄层，不是 shell 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 body seam 成立

第十六刀里，它不需要做到：

- 完整 action candidate 内容构造
- 完整候选字段定义
- 完整候选选择、排序、执行
- 完整 action candidate runner
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`

### 5.2 candidate detail intake 的第一条窄接线

它只负责一件事：

- 让 candidate shell 之后可以承载一点点候选细节输入，但不把这些细节固化成完整 candidate schema

第十六刀里，它应该做到：

- 明确 detail intake 只是候选体邻接面的窄接线
- 允许表达“这里可以接入候选细节”，但不要求定义最终字段全集
- 让当前链路能最小区分“有 detail intake 接入口”和“完整 action candidate 已经构造完成”
- 继续保持临时性、窄边界和可回滚

第十六刀里，它不需要做到：

- 最终 candidate schema
- 最终字段枚举
- 最终 serialization / DSL / JSON 格式
- 完整 validation matrix
- 完整 action candidate builder

### 5.3 当前链路对 candidate-body-facing edge 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 first candidate shell entry”前移到“存在最小 candidate body seam / candidate-body-facing edge”

第十六刀里，它应该做到：

- 不再只证明 candidate shell entry 已经存在
- 改为至少能看出 shell 之后已经开始出现一片候选体邻接面
- 继续保持 candidate-body-facing edge 角色，不顺手吞掉完整候选内容、候选选择、runner、action lifecycle、结果收口或完整 `recover / resume / hydrate`

第十六刀里，它不需要做到：

- 完整 candidate 对象落地
- 完整 candidate schema 落地
- 完整 action runner 落地
- 完整 consumer action 执行落地

## 6. 第十六刀不包含什么

为了保证第十六刀足够小，这一轮应明确排除下面这些内容：

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
- 完整 pre-runner readiness matrix
- 完整 candidate execution readiness precheck
- 最终 consumer schema
- 最终 recover intake schema
- 最终 action candidate schema
- 最终 rule table
- 最终 protocol
- 最终 TypeScript 目录树、类名、状态枚举、动作类树或字段枚举

一句话说，第十六刀只做：

- candidate shell 之后、完整 action candidate 之前的最小 candidate body seam / candidate detail intake / candidate-body-facing edge 先站住

不做：

- 完整 action candidate 已经形成
- 完整 action runner 已经启动
- 完整执行前 readiness 体系已经完成
- 完整 `recover / resume / hydrate` 已经展开

## 7. 与第十五刀、第十七刀的边界

### 7.1 与第十五刀的边界

第十五刀负责：

- `action-candidate-pre-edge / minimal action-candidate sightline` 之后的第一个极窄 candidate shell entry
- 第一个候选壳能被最小承认、立壳、被入口看见
- 当前链路最小暴露“first candidate shell entry 已存在”

第十六刀负责：

- `candidate shell / first candidate shell entry` 之后的最小 candidate body seam
- 候选体可以被接近、被承载一点点 detail intake
- 当前链路最小暴露“candidate body seam / candidate-body-facing edge 已存在”

它们的边界是：

```text
第十五刀
  candidate shell / pre-ack / first candidate shell entry

第十六刀
  candidate body seam / candidate detail intake / candidate-body-facing edge
```

第十六刀不能把第十五刀的 candidate shell 重命名成 candidate body seam，也不能把 candidate body seam 反向退化成 shell entry 的一句未来说明。

### 7.2 与第十七刀的边界

第十七刀最自然可以接：

- candidate body seam 之后的最小 pre-runner readiness seam
- runner-facing pre-edge
- candidate execution readiness precheck 的第一条极窄前置线

第十六刀不替第十七刀完成这些内容。

第十六刀只给第十七刀留下自然入口：

```text
candidate body seam / candidate detail intake / candidate-body-facing edge
  -> next: pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
```

白话讲，第十六刀只让候选壳后面出现候选体邻接面；第十七刀才适合开始讨论 runner 前的 readiness seam，仍然不应该直接跳到完整 runner。

## 8. 与 recover / resume / hydrate 的关系

第十六刀与 `recover / resume / hydrate` 的关系必须压得很窄。

它可以说：

- 这个 candidate body seam 未来可能服务于第一个 `recover-intake consumer action candidate`
- 这个 candidate detail intake 位于恢复链后段、动作候选完整形成之前
- 这个 candidate-body-facing edge 是完整恢复动作层之前的一片候选体邻接面

它不能说：

- 完整 `recover` 已经开始执行
- 完整 `resume` 已经开始续接
- 完整 `hydrate` 已经开始灌回
- candidate body seam 已经包含恢复动作结果
- candidate detail intake 已经定义了 `recover / resume / hydrate` 的最终协议或字段全集

白话讲，第十六刀最多让“恢复相关的第一个动作候选体可以被接近并接收一点细节”，不能把这片 seam 写成恢复动作本身。

## 9. 与 action candidate / runner 的关系

第十六刀与 action candidate 的关系是**候选体邻接关系**，不是完整候选关系。

它可以做：

- 承认最小 candidate body seam
- 暴露 candidate detail intake 已存在
- 保持 candidate shell 与 candidate body seam 的分层
- 为后续 pre-runner readiness seam 留口

它不能做：

- 构造完整 action candidate
- 定义完整 action candidate schema
- 做候选选择 / 排序 / 执行
- 做 runner 调度
- 做 action lifecycle
- 做结果收口

第十六刀与 runner 的关系也必须明确：

- runner 是后续动作执行层，不属于第十六刀
- 第十六刀最多给 runner 前的第十七刀窄层留下方向
- 第十六刀不能为了“方便验证”引入完整 runner、伪 runner 或执行闭环

白话讲，第十六刀不是“候选已经能跑”，甚至还不是“候选已经完整”；它只是“候选壳后面的候选体邻接面已经能被承认”。

## 10. 最小桥接链示意

第十六刀完成后，最小桥接链可以表达成：

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
  -> candidate shell 之后、完整 action candidate 之前的最小 candidate body seam / candidate detail intake / candidate-body-facing edge
```

这条链只证明一件事：

- 候选壳之后的候选体邻接面已经可以被最小承认

它不证明：

- 完整 action candidate 已经构造完
- 完整 candidate body 已经定型
- 完整 detail schema 已经冻结
- 完整 runner 已经存在
- 完整 `recover / resume / hydrate` 已经存在
- 最终 schema / rule table / protocol 已经冻结

## 11. 推荐实施顺序

第十六刀如果进入实现，建议按下面顺序推进：

1. 先确认第十五刀的 `candidate shell / pre-ack / first candidate shell entry` 已能被当前链路暴露
2. 再给 candidate shell 内侧补一个最小 candidate body seam，而不是直接补完整 action candidate
3. 再让当前链路能最小表达“candidate body seam / candidate-body-facing edge 已存在”
4. 再补一条极窄 candidate detail intake 接线，证明它能承载一点候选细节但不冻结完整 schema
5. 再补一个极窄验证路径，证明它不是 candidate shell 的换名，也不是完整 action candidate
6. 最后只留下第十七刀入口：pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck

推荐命名和结构应保持临时性、窄边界和可回滚，不要在这一刀冻结最终命名、最终字段、最终目录树或最终类树。

## 12. 最小验证方式

第十六刀的验证方式可以很轻，但必须证明四件事：

- 当前链路不再只暴露 `first candidate shell entry 已存在`
- 当前链路已经能最小暴露 `candidate body seam / candidate-body-facing edge 已存在`
- 这条 candidate detail intake 只承载一点候选细节接入，不冻结完整 candidate schema
- 这个 candidate body seam 没有承担完整候选构造、候选选择、runner 执行或结果收口职责

可接受的最小验证形态包括：

- smoke 级调用验证
- stub 驱动验证
- 极窄 happy-path 验证
- 最小链路暴露验证
- 文档级 done-enough 对照验证

不可接受的验证形态包括：

- 为了验证 candidate body seam，顺手实现完整 action candidate runner
- 为了验证 detail intake，冻结最终 action candidate schema
- 为了验证 candidate-body-facing edge，把 `recover / resume / hydrate` 的完整动作层一起做掉
- 只检查命名存在，却无法证明 candidate shell 与 candidate body seam 是两层

## 13. done-enough 口径

第十六刀做到下面程度，就可以算 done-enough：

- `candidate shell / pre-ack / first candidate shell entry` 之后已经真实站住一个独立的 candidate body seam / candidate detail intake / candidate-body-facing edge
- 当前链路已经能最小暴露“candidate body seam / candidate-body-facing edge 已存在”
- candidate body seam 明确位于 candidate shell 与完整 action candidate 之间
- candidate detail intake 只承载一点候选细节接入，没有冻结完整 candidate schema
- candidate body seam 没有承担候选选择、候选排序、候选执行、runner、action lifecycle 或结果收口职责
- 当前结构没有冻结最终 schema、rule table、protocol、目录树、类树或字段枚举
- 第十七刀可以自然接到 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck，而不是回头补第十五刀

一句话说：

- `candidate shell entry -> candidate body seam / detail intake` 这条极窄接线站住了，且没有越界成完整 action candidate 或 runner，就足够进入第十七刀。

## 14. 明确反模式

出现下面任一情况，都说明第十六刀写偏了：

- 把 candidate body seam 写成完整 action candidate
- 把 candidate detail intake 写成最终 schema 或字段全集
- 把 candidate-body-facing edge 写成候选选择器
- 把 candidate body seam 写成 runner 入口
- 把 candidate detail intake 写成完整 pre-runner readiness matrix
- 把 candidate body seam 写成完整 `recover` 动作
- 把 candidate body seam 写成完整 `resume` 或 `hydrate` 逻辑
- 为了“先完整一点”冻结 action candidate schema、rule table、protocol 或字段枚举
- 把第十五刀的 candidate shell entry 改名成 candidate body seam，却没有新增独立候选体邻接层
- 把第十六刀写成第十七刀、第十八刀甚至更后面的 runner readiness、runner、action lifecycle 或 result layer
- 在文档里承诺最终目录树、最终 TS 类树、最终状态枚举或最终动作类树
- 为了验证方便引入完整 runner、伪 runner 或动作执行闭环

这些反模式的共同问题是：

- 要么第十六刀没有真的比第十五刀前进一层
- 要么第十六刀一次前进太多，吞掉了第十七刀和后续动作执行层

## 15. 第十六刀完成后的第十七刀自然入口

第十六刀完成后，第十七刀最自然接到下面这个方向：

- candidate body seam 之后的最小 pre-runner readiness seam
- runner-facing pre-edge 的第一条极窄接线
- candidate execution readiness precheck 的最小前置承认点

第十七刀仍然不应直接写成：

- 完整 action candidate runner
- 完整候选选择 / 排序 / 执行
- 完整 action lifecycle
- 完整结果收口
- 完整 `recover / resume / hydrate`
- 最终 schema、rule table、protocol 或 TypeScript 结构定稿

白话讲，第十六刀结束后，链路应该停在“候选体邻接面已经能承载一点 detail intake”；第十七刀才接“执行前是否最小可准备”，但仍然不替后续刀完成真正 runner。
