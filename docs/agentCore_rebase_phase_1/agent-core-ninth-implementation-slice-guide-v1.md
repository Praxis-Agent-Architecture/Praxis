# agentCore 第九实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第九实施切片指南**。

它只回答一类问题：

- 如果第八刀已经完成，第九轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把后面的完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十刀最自然该接到哪里

本文**不是**：

- 新对象定义
- 任一 baseline 的替代品
- 第八刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第八刀做完之后，第九刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第八刀之后

第八刀已经把下面这条最小桥接链立住了：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
```

第八刀解决的是：

- `recovery-side` 第一个最小 consumer 壳里面，已经有一条独立最小 seam 站住了
- 这条 seam 已经可以被当前链路最小暴露出来，而不再只是“有 consumer 壳”
- 壳外 `entry`、壳、壳内 seam 已经至少被拆成三层

但第八刀还刻意没有回答下面这一类问题：

- 这条壳内 seam 之后，`recovery-side` 最小消费路径怎样继续收束成更明确的一小段
- 这条 seam 后面，怎样形成一个仍然很窄、但比单条 seam 更像“路径”的 intake lane
- 这条 lane 如何单独站住，而不直接偷跑成完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第八刀已经把“壳内第一条最小 seam”站住了；第九刀最自然就是把 **seam 之后那一小段更明确的最小消费路径** 补出来。

如果这一步不先补，后面很容易出现两种混写：

- 第九刀一上来就被迫把完整动作层一起吞掉，只因为壳内 seam 之后没有单独站住更明确的 intake path
- 第十刀只能同时补“路径”和“动作”，无法继续保持窄层推进

所以，第九刀最自然不是回头重写第八刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 **壳内 seam 之后的更明确 recovery-side 最小消费路径** 站住，并优先保持在最小 `intake lane` 这一层。

## 3. 第九刀依赖哪些上位文档 / 边界文档

第九刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-seventh-implementation-slice-guide-v1.md`

这份文档负责给第九刀提供**第七刀的外侧起点**。

它支撑第九刀的方式是：

- 明确第七刀只做到 `downstream consumption entry` 外侧的第一个最小 consumer 壳
- 明确第九刀不是回头改写 entry 外层，而是继续往壳内收束
- 防止第九刀把壳外层与壳内层重新混回去

白话讲，没有第七刀的外侧壳，第九刀就失去了“壳内 seam 是从哪一侧往里收”的参考坐标。

### 3.2 `agent-core-eighth-implementation-slice-guide-v1.md`

这份文档负责给第九刀提供**第八刀的收口位置**。

它支撑第九刀的方式是：

- 明确第八刀只做到 `recovery-side` 第一个最小 consumer 壳内侧的第一条最小消费接线
- 明确第九刀最自然应继续收敛到这条 seam 之后的更明确最小消费路径
- 防止第九刀回头重拆 seam，或把 seam 直接升级成完整动作层

白话讲，没有第八刀的 seam，第九刀就会失去“路径从哪里继续长出来”的施工起点。

### 3.3 `agent-core-eighth-implementation-slice-done-checklist-v1.md`

这份文档负责给第九刀提供**进入条件与完成前提**。

它支撑第九刀的方式是：

- 明确第八刀必须先让壳内 seam、壳、entry 与当前链路最小暴露都真实成立
- 明确第九刀不是为了替第八刀补 seam，而是建立在 seam 已经站稳的前提上继续往里收
- 防止第九刀一上来就补路径，但第八刀其实还停留在壳内 seam 描述级别

白话讲，它决定第九刀不是“另起炉灶”，而是接在第八刀已经站稳的最小 seam 之后。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第九刀提供**实现落位感**。

它支撑第九刀的方式是：

- 明确 `acceptance / ack result` 之后，外面已经有 recovery-side consumer 壳，再往里就是壳内 seam 和 seam 后路径
- 提醒第九刀现在要往壳内更深一层收敛，但仍然不要扩成完整 consumer 模块树
- 帮第九刀把焦点放在更明确的 `intake lane` 上，而不是把完整恢复动作层一起带出来

白话讲，这份落位图的作用不是让第九刀定最终代码树，而是提醒“这一刀已经进入壳内 seam 之后的路径层，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第九刀提供**链路位置感与越界控制**。

它支撑第九刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> consumer 壳 -> 壳内 seam` 的门口
- 明确 seam 之后确实还有更内侧的最小消费路径，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第九刀把“seam 已经存在”与“seam 之后的最小路径已经明确”混成一层

白话讲，它帮助第九刀记住：这一步仍然是恢复链后段的 intake path 层，不是终局动作层。

## 4. 当前建议的第九刀是什么

### 4.1 切片名称

建议把第九刀收敛成：

**`recovery-side` 最小消费路径的第一段收束**

也可以白话地叫成：

**壳内 seam 之后的最小 `intake lane`**

它不是完整 `recover`，也不是完整 `resume` 或完整 `hydrate`，只是比第八刀那条 seam 更里一层、但仍然极小的“下一小段消费路径”。

### 4.2 这第九刀的最小组合

这一刀建议只包含下面三件事：

1. 把第八刀留下的壳内最小 seam，继续向内收成一条**更明确的最小消费路径**
2. 让当前链路结构上能看出：seam 之后不是直接跳进完整 `recover` 动作，而是先进入 recovery-side 的一条极窄 `intake lane`
3. 让后续第十刀可以从这条 lane 再往里接更靠近 consumer intake 的下一窄层，而不是回头重拆第七刀或第八刀

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
```

这里的关键不是把第九刀做成完整消费协议或完整恢复出口，而是先把：

- 第八刀已经站住的壳内 seam
- seam 之后更明确的一条最小消费路径
- 当前链路对这条路径的最小暴露

这三者真实拆开。

## 5. 这第九刀包含什么

第九刀建议只包含下面这些内容。

### 5.1 壳内 seam 之后的一条最小 intake lane

它只负责一件事：

- 在壳内最小 seam 之后，单独站住一条“最小先往哪里继续消费”的 intake lane

第九刀里，它应该做到：

- 明确这条 lane 站在 seam 与真正 `recover` 动作之间
- 明确它回答的是“这条 seam 之后，最小先往哪一段继续长”
- 让当前实现结构上能看出：它是壳内更深一层窄路径，而不是完整动作层
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 lane 成立

第九刀里，它不需要做到：

- 最终 recover 动作收口
- 最终 resume 接续策略
- 最终 hydrate 灌回逻辑
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 seam 到 lane 的最小过渡

它只负责一件事：

- 让第八刀的壳内 seam 不再停留在“已经有 seam”，而是最小地向内交出一条明确可挂接的 intake lane

第九刀里，它应该做到：

- 明确 `壳内 seam` 与 `最小 intake lane` 不等价
- 至少让实现结构上能看出：一旦 seam 成立，壳里面会再留下一个更明确的最小消费路径
- 允许当前过渡非常窄，只表达“这条 seam 现在先走这条 lane”，而不表达完整恢复动作
- 让后续第十刀有自然入口，而不是到时候只能回头改写 seam 或 lane

第九刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 recover 结果收口

### 5.3 当前链路对 lane 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在壳内 seam”前移到“存在壳内 seam 之后的更明确最小消费路径”

第九刀里，它应该做到：

- 不再只证明壳内 seam 已存在
- 改为至少能看出 seam 之后还有一条更明确的 recovery-side 最小消费路径
- 继续保持 `intake lane` 角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第九刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回

## 6. 这第九刀明确不包含什么

为了保证第九刀足够小，这一轮应明确排除下面这些内容：

- 完整 `recover` 真正收口
- 完整 `recover` 结果对象
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 完整 downstream consumer 实现
- 完整 consumer 选择 / 路由策略
- 最终 consumer schema
- 最终 recover intake schema
- 最终 rule table
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第九刀只做：

- 壳内 seam 之后的更明确最小消费路径先站住

不做“recover 这半条后链已经完整跑通”的下一层。

## 7. 为什么这个切片适合作为第九刀

这个切片适合作为第九刀，主要有六个原因。

### 7.1 它正好补上第八刀之后最明显的缺口

第八刀已经证明：

- 壳内 seam 可以独立存在
- 当前链路可以明确暴露壳内 seam

但“seam 之后最小往哪里继续走”还没站住。  
第九刀正好补这个缺口，不需要回头改写第八刀。

### 7.2 它先把 seam 与 lane 分开

如果第九刀不先补这一步，后面很容易继续出现：

- 壳内 seam 长期停留在“已经有 seam”的抽象口号，没有 seam 之后更明确的最小路径
- 第十刀一上来就被迫把路径与动作一起吞掉，只因为前面没有单独站住 lane

第九刀先把这两层拆开，后面才好继续往里收。

### 7.3 它仍然是窄层，不会把完整动作层拉进来

第九刀只是在壳内 seam 之后再收一小段路径：

- 仍然是 `intake lane`
- 仍然是最小消费路径
- 仍然不等于完整 `recover`

这正好符合 phase_1 当前文档组的推进方式：每一刀都只多走一小步。

### 7.4 它能让第十刀的接点更清楚

第九刀如果只做 seam 后的一条更明确 lane，那么第十刀就可以自然接到：

- 更靠近 recovery-side intake consumer 的下一窄层
- 或者 lane 之后更内侧、但仍非完整动作层的下一小段

这样第十刀不会被迫同时承担“定义路径”和“定义动作”的双重任务。

### 7.5 它避免把第九刀误写成完整 recover 的开始

第九刀最容易犯的错误，就是把“seam 之后的路径”写成“recover 已经开始全面展开”。

本刀故意把边界压在：

- 路径更明确
- 但仍然不是动作层

这样就不会把 `recover`、`resume`、`hydrate` 过早拉进来。

### 7.6 它和前两刀的关系最顺

第七刀解决的是壳外第一层。  
第八刀解决的是壳内第一条 seam。  
第九刀最顺的任务就是把 seam 之后那条更明确的最小路径补出来。

这三刀连起来，主线是连续的，不需要回跳：

```text
entry 外侧第一层壳
  -> 壳内第一条 seam
  -> seam 之后更明确的最小消费路径
```

## 8. 做完后第十刀最自然接到哪里

第九刀做完后，第十刀最自然接到的地方，不应该是完整 `recover`、完整 `resume` 或完整 `hydrate`，而应该是：

- 更靠近 recovery-side intake consumer 的下一窄层
- 或者把第九刀那条最小 `intake lane` 再向内收一点，让它更像真正可承接的消费入口面

白话讲：

- 第九刀负责把“壳内 seam 之后的路”说清楚
- 第十刀负责把这条路再往里压一层，但仍然不碰完整动作层

这样第十刀仍然能保持“小切片、强边界、非最终定稿”的风格。

## 9. 一个很小的主线图

```text
cursor advancement recognition result
  -> acceptance / ack result
  -> downstream handoff / downstream consumption
  -> downstream consumption entry
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
  -> 第十刀再往更靠近 intake consumer 的下一窄层
```

这张图只表达一件事：

- 第九刀不是再造一个壳
- 第九刀也不是开完整 `recover`
- 第九刀只是把壳内 seam 之后的最小消费路径再收清楚一小段

## 10. 结论

第九刀应该收敛成：

- `recovery-side` 壳内 seam 之后的一条更明确的最小消费路径
- 或白话的 `intake lane`

它的任务不是让完整 `recover` 开始展开，而是让第八刀已经站住的壳内 seam，后面再多出一小段更明确、仍然极窄的路径层。  
如果做到这一步，第十刀就能自然接到更靠近 consumer intake 的下一窄层，而不会把完整动作层提前拉进来。
