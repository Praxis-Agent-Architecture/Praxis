# agentCore 第十实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十实施切片指南**。

它只回答一类问题：

- 如果第九刀已经完成，第十轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把后面的完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十一刀最自然该接到哪里

本文**不是**：

- 新对象定义
- 任一 baseline 的替代品
- 第九刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第九刀做完之后，第十刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第九刀之后

第九刀已经把下面这条最小桥接链立住了：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
```

第九刀解决的是：

- `recovery-side` 壳内 seam 之后，已经不再只是“有 seam”
- seam 之后已经单独站住一条更明确的最小消费路径，也就是一个最小 `intake lane`
- 当前链路已经能最小暴露“lane 已存在”，而不是只暴露“壳内 seam 已存在”

但第九刀还刻意没有回答下面这一类问题：

- 这条 lane 之后，怎样再往 `intake consumer` 方向收成一小片更靠内的 intake-facing 面
- 这条 lane 如何单独交出一个更窄的 `consumer-intake-facing seam / intake face / intake handoff strip`
- 这条更靠内的窄层怎样站住，但仍然不冒充完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第九刀已经把“lane”站住了；第十刀最自然就是把 **lane 之后、更靠近 intake consumer 的下一窄层** 补出来。

如果这一步不先补，后面很容易出现两种混写：

- 第十刀一上来就被迫把完整动作层一起吞掉，只因为 lane 之后没有单独站住更靠近 consumer 的 intake-facing 面
- 第十一刀只能同时补“face”和“动作”，无法继续保持窄层推进

所以，第十刀最自然不是回头重写第九刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 **lane 之后的最小 consumer-intake-facing seam** 站住，并优先保持在一个很小的 intake face / handoff strip 这一层。

## 3. 第十刀依赖哪些上位文档 / 边界文档

第十刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-ninth-implementation-slice-guide-v1.md`

这份文档负责给第十刀提供**第九刀的收口位置**。

它支撑第十刀的方式是：

- 明确第九刀只做到 `recovery-side` 壳内 seam 之后的更明确最小消费路径，也就是最小 `intake lane`
- 明确第十刀最自然应继续收敛到 `intake lane` 之后更靠近 `intake consumer` 的下一窄层
- 防止第十刀回头重拆 seam 或 lane，或把 lane 直接升级成完整动作层

白话讲，没有第九刀的 lane，第十刀就失去了“从哪里继续往 consumer 方向收”的施工起点。

### 3.2 `agent-core-ninth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十刀提供**进入条件与完成前提**。

它支撑第十刀的方式是：

- 明确第九刀必须先让 lane、seam、壳和当前链路最小暴露都真实成立
- 明确第十刀不是为了替第九刀补 lane，而是建立在 lane 已经站稳的前提上继续往里收
- 防止第十刀一上来就补更靠内的 face，但第九刀其实还停留在 lane 描述级别

白话讲，它决定第十刀不是“另起炉灶”，而是接在第九刀已经站稳的最小 lane 之后。

### 3.3 `agent-core-eighth-implementation-slice-guide-v1.md`

这份文档负责给第十刀提供**壳内 seam 的更早一级坐标**。

它支撑第十刀的方式是：

- 明确更深一层的 lane 是从壳内最小 intake seam 长出来的，不是凭空出现的
- 明确第十刀不能把 lane 写成新的壳，也不能把 face 写成新的完整 consumer
- 防止第十刀把 seam、lane、face 三者重新揉回一层

白话讲，没有第八刀的 seam，第十刀就会失去“lane 是从哪一侧向内长出来”的参考坐标。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十刀提供**实现落位感**。

它支撑第十刀的方式是：

- 明确 `acceptance / ack result` 之后，外面已经有 recovery-side consumer 壳
- 提醒第十刀现在要从 lane 再往 `intake consumer` 方向收束，但仍然不要扩成完整 consumer 模块树
- 帮第十刀把焦点放在更靠内的 intake face / handoff strip 上，而不是把完整恢复动作层一起带出来

白话讲，这份落位图的作用不是让第十刀定最终代码树，而是提醒“这一刀已经进入 lane 之后的 consumer-facing 窄层，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十刀提供**链路位置感与越界控制**。

它支撑第十刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> consumer 壳 -> seam -> lane` 的门口
- 明确 lane 之后确实还有更靠近 intake consumer 的最小 face，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第十刀把“lane 已经存在”与“lane 之后的 consumer-facing 窄层已经完成”混成一层

白话讲，它帮助第十刀记住：这一步仍然是恢复链后段的 intake-facing 层，不是终局动作层。

## 4. 当前建议的第十刀是什么

### 4.1 切片名称

建议把第十刀收敛成：

**`intake lane` 之后的最小 `consumer-intake-facing seam`**

也可以白话地叫成：

**lane 之后更靠近 `intake consumer` 的一小片 intake face / handoff strip**

它不是完整 `recover`，也不是完整 `resume` 或完整 `hydrate`，只是比第九刀那条 lane 更里一层、但仍然极小的“下一小段 consumer-facing 面”。

### 4.2 这第十刀的最小组合

这一刀建议只包含下面三件事：

1. 把第九刀留下的最小 `intake lane`，继续向内收成一条**更靠近 intake consumer 的最小 face**
2. 让当前链路结构上能看出：lane 之后不是直接跳进完整 `recover` 动作，而是先进入一个很窄的 `consumer-intake-facing seam / intake handoff strip`
3. 让后续第十一刀可以从这个 face 再往里接更接近真正 `intake consumer` 的下一窄层，而不是回头重拆第八刀或第九刀

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
```

这里的关键不是把第十刀做成完整消费协议或完整恢复出口，而是先把：

- 第九刀已经站住的最小 intake lane
- lane 之后更靠近 intake consumer 的最小 face
- 当前链路对这条 face 的最小暴露

这三者真实拆开。

## 5. 这第十刀包含什么

第十刀建议只包含下面这些内容。

### 5.1 lane 之后的一小片 intake face

它只负责一件事：

- 在最小 intake lane 之后，单独站住一小片“更靠近 intake consumer 会怎么看见、怎么接住”的 intake face

第十刀里，它应该做到：

- 明确这片 face 站在 lane 与真正 `recover` 动作之间
- 明确它回答的是“这条 lane 再往里，最小先长成什么 consumer-facing 的样子”
- 让当前实现结构上能看出：它是 lane 之后的窄层，不再只是 lane 的未来说明
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 face 成立

第十刀里，它不需要做到：

- 最终 recover 动作收口
- 最终 resume 接续策略
- 最终 hydrate 灌回逻辑
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 lane 到 intake consumer-facing seam 的最小过渡

它只负责一件事：

- 让第九刀的最小 intake lane 不再停留在“已经有 lane”，而是最小地向内交出一条更靠近 intake consumer 的可挂接 face

第十刀里，它应该做到：

- 明确 `intake lane` 与 `consumer-intake-facing seam` 不等价
- 至少让实现结构上能看出：一旦 lane 成立，lane 里面会再留下一个更窄的 consumer-facing strip
- 允许当前过渡非常窄，只表达“这条 lane 现在先往这个 face 收”，而不表达完整恢复动作
- 让后续第十一刀有自然入口，而不是到时候只能回头改写 lane 或 face

第十刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 recover 结果收口

### 5.3 当前链路对 consumer-facing strip 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在最小 intake lane”前移到“存在 lane 之后更靠近 intake consumer 的最小 face”

第十刀里，它应该做到：

- 不再只证明 lane 已经存在
- 改为至少能看出 lane 之后已经开始出现最小的 consumer-intake-facing seam
- 继续保持 intake face 角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第十刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回

## 6. 这第十刀明确不包含什么

为了保证第十刀足够小，这一轮应明确排除下面这些内容：

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

一句话说，第十刀只做：

- lane 之后的最小 consumer-facing 面先站住

## 7. 为什么这一刀适合作为第十刀

这一刀适合作为第十刀，核心原因不是“细节更大”，而是“边界更靠内，但仍然很小”。

### 7.1 它顺着第九刀的结果继续收

第九刀已经证明：

- 壳内 seam 之后确实还有一条更明确的最小消费路径
- 这条路径已经可以被叫成最小 `intake lane`
- 当前链路已经能暴露 lane 的存在

第十刀只需要继续问：

- 这条 lane 再往里，最小先长成什么更靠近 intake consumer 的 face

这样做的好处是：

- 不回头重拆第九刀
- 不直接越到完整恢复动作层
- 不把 lane 和 face 混成一层

### 7.2 它把 lane 与真正 consumer 再隔一层很窄的面

第十刀的价值在于把“已经有 lane”继续变成“lane 还能向 consumer-facing 方向再收一层”。

这样做的好处是：

- 第十一刀可以更自然地接到真正更靠近 `intake consumer` 的下一窄层
- 当前实现不会因为 lane 太粗而直接被迫吞进完整 `recover`
- `lane -> face -> consumer` 的边界会更清楚

### 7.3 它仍然足够小，适合 phase_1 的切片方式

第十刀如果写得太大，就会立刻变成完整动作层问题。

所以它必须维持：

- 只收一小片 face
- 只收一个 very narrow handoff strip
- 只收 lane 到 consumer-facing seam 的最小暴露

这正好符合 phase_1 里“小切片、强边界、非最终定稿”的原则。

## 8. 做完后第十一刀最自然接到哪里

第十刀完成后，第十一刀最自然接到下面这个方向：

- 更靠近真正 `intake consumer` 的下一窄层
- 或 `consumer-intake-facing seam` 之后、但仍然不是完整 `recover` 动作层的下一小段

白话讲，第十一刀应该去补：

- 这片 face 之后，consumer 侧最小的接手点是什么
- 但仍然不把完整 `recover / resume / hydrate` 全面展开

它仍然应该是：

- 更靠近 intake consumer 的一小段
- 而不是完整动作层
- 而不是最终 schema
- 而不是最终 rule table

## 9. 一个很小的主线图

```text
done (第九刀)
  downstream consumption entry
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane

第十刀
  -> lane 之后更靠近 intake consumer 的最小 consumer-intake-facing seam
  -> 最小 intake face / handoff strip

not yet
  完整 recover
  完整 resume
  完整 hydrate
  最终 schema / rule table / protocol
```

## 10. 结论

第十刀应该被收敛成：

- `intake lane` 之后、更靠近 `intake consumer` 的最小 `consumer-intake-facing seam`

它的任务只有一个：

- 把第九刀已经站住的 lane，再往 consumer 方向收成一小片 face / handoff strip

如果还停留在“只有 lane，没有 face”“face 只是 lane 的换名说法”“一做 face 就直接偷跑完整 `recover` / `resume` / `hydrate`”，都不应算第十刀。
