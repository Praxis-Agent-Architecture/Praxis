# agentCore 第十一实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十一实施切片指南**。

它只回答一类问题：

- 如果第十刀已经完成，第十一轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把后面的完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十二刀最自然该接到哪里

本文**不是**：

- 新对象定义
- 任一 baseline 的替代品
- 第十刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十刀做完之后，第十一刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第十刀之后

第十刀已经把下面这条最小桥接链立住了：

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
```

第十刀解决的是：

- `intake lane` 之后，已经不再只是“有 lane”
- lane 之后已经单独站住一小片更靠近 `intake consumer` 的最小 `consumer-intake-facing seam / intake face / handoff strip`
- 当前链路已经能最小暴露“face 已存在”，而不是只暴露“lane 已存在”

但第十刀还刻意没有回答下面这一类问题：

- 这片 face 之后，consumer 侧最小先由哪里接住
- 这片 handoff strip 如何继续收成一个更靠近真正 `intake consumer` 的最小接手边
- 这个 consumer-side 接手边怎样独立站住，但仍然不冒充完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第十刀已经把“lane 之后更靠近 consumer 的 face”站住了；第十一刀最自然就是把 **face 之后、consumer 侧最小先接住的一条边** 补出来。

如果这一步不先补，后面很容易出现两种混写：

- 第十一刀一上来就被迫把完整 `recover` 动作层一起吞掉，只因为 face 之后没有单独站住 consumer-side 的最小接手边
- 第十二刀只能同时补“接手边”和“动作入口”，无法继续保持窄层推进

所以，第十一刀最自然不是回头重写第十刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 **face 之后的最小 consumer-side receiving edge / minimal intake hook** 站住，并优先保持在一个很小的接手边这一层。

## 3. 第十一刀依赖哪些上位文档 / 边界文档

第十一刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面六份。

### 3.1 `agent-core-tenth-implementation-slice-guide-v1.md`

这份文档负责给第十一刀提供**第十刀的收口位置**。

它支撑第十一刀的方式是：

- 明确第十刀只做到 `intake lane` 之后的最小 `consumer-intake-facing seam / intake face / handoff strip`
- 明确第十一刀最自然应继续收敛到这片 face 之后、更靠近真正 `intake consumer` 的下一窄层
- 防止第十一刀回头重拆 lane 或 face，或把 face 直接升级成完整动作层

白话讲，没有第十刀的 face，第十一刀就失去了“consumer 侧从哪里开始接手”的施工起点。

### 3.2 `agent-core-tenth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十一刀提供**进入条件与完成前提**。

它支撑第十一刀的方式是：

- 明确第十刀必须先让 lane、face、壳内 seam、consumer 壳和当前链路最小暴露都真实成立
- 明确第十一刀不是为了替第十刀补 face，而是建立在 face 已经站稳的前提上继续往里收
- 防止第十一刀一上来就补 consumer-side 接手边，但第十刀其实还停留在 lane 或 face 描述级别

白话讲，它决定第十一刀不是“另起炉灶”，而是接在第十刀已经站稳的最小 face 之后。

### 3.3 `agent-core-ninth-implementation-slice-guide-v1.md`

这份文档负责给第十一刀提供**更外侧的 lane 坐标**。

它支撑第十一刀的方式是：

- 明确第十刀的 face 是从第九刀的最小 `intake lane` 继续长出来的
- 明确第十一刀不能把 face 之后的接手边反向写成新的 lane
- 防止第十一刀把 lane、face、receiving edge 三者重新揉回一层

白话讲，没有第九刀的 lane，第十一刀就会失去“face 是从哪条路径向内长出来”的参考坐标。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十一刀提供**实现落位感**。

它支撑第十一刀的方式是：

- 明确 `acceptance / ack result` 之后，外面已经有 recovery-side consumer 壳、壳内 seam、lane 和 face
- 提醒第十一刀现在要从 face 再往真正 `intake consumer` 方向收束，但仍然不要扩成完整 consumer 模块树
- 帮第十一刀把焦点放在 consumer-side 的最小接手边上，而不是把完整恢复动作层一起带出来

白话讲，这份落位图的作用不是让第十一刀定最终代码树，而是提醒“这一刀已经来到 face 之后的 consumer-side 接手边，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十一刀提供**链路位置感与越界控制**。

它支撑第十一刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> consumer 壳 -> seam -> lane -> face` 的门口
- 明确 face 之后确实还有更靠近 `intake consumer` 的最小接手边，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第十一刀把“face 已经存在”与“consumer-side 接手边已经站住”混成一层

白话讲，它帮助第十一刀记住：这一步仍然是恢复链后段的 consumer-side intake 邻接层，不是终局动作层。

### 3.6 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十一刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十一刀的方式是：

- 明确 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十一刀现在仍然只站在 face 之后的 consumer-side 最小接手边上，不应把完整恢复动作层偷进来
- 防止第十一刀虽然口头说“不做完整恢复”，但依然没有一个明确的正式基线来托住这条边界

白话讲，这份正式基线的作用，是让第十一刀知道自己不是在启动恢复引擎，而是在恢复引擎前方继续补一条更靠近 intake consumer 的最小接手边。

## 4. 当前建议的第十一刀是什么

### 4.1 切片名称

建议把第十一刀收敛成：

**`intake face / handoff strip` 之后的最小 `consumer-side receiving edge`**

也可以白话地叫成：

**face 之后更靠近真正 `intake consumer` 的最小接手边 / minimal intake hook**

它不是完整 `recover`，也不是完整 `resume` 或完整 `hydrate`，只是比第十刀那片 face 更里一层、但仍然极小的“consumer 侧最小先接住哪里”。

### 4.2 这第十一刀的最小组合

这一刀建议只包含下面三件事：

1. 把第十刀留下的最小 `intake face / handoff strip`，继续向内收成一条**更靠近真正 intake consumer 的最小接手边**
2. 让当前链路结构上能看出：face 之后不是直接跳进完整 `recover` 动作，而是先进入一个很窄的 `consumer-side receiving edge / minimal intake hook`
3. 让后续第十二刀可以从这个 receiving edge 再往里接更接近真正 `recover-intake consumer` 的下一窄层，而不是回头重拆第九刀或第十刀

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
```

这里的关键不是把第十一刀做成完整消费协议或完整恢复出口，而是先把：

- 第十刀已经站住的最小 intake face / handoff strip
- face 之后 consumer 侧最小先接住的一条 receiving edge
- 当前链路对这条 receiving edge 的最小暴露

这三者真实拆开。

## 5. 这第十一刀包含什么

第十一刀建议只包含下面这些内容。

### 5.1 face 之后的一条最小 consumer-side receiving edge

它只负责一件事：

- 在最小 intake face / handoff strip 之后，单独站住一条“consumer 侧最小先由哪里接住”的 receiving edge

第十一刀里，它应该做到：

- 明确这条 receiving edge 站在 face 与真正 `recover` 动作之间
- 明确它回答的是“这片 face 再往里，consumer 侧最小先在哪里接住”
- 让当前实现结构上能看出：它是 face 之后的更内侧窄层，不再只是 face 的未来说明
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 hook 成立

第十一刀里，它不需要做到：

- 最终 recover 动作收口
- 最终 resume 接续策略
- 最终 hydrate 灌回逻辑
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 face 到 minimal intake hook 的最小过渡

它只负责一件事：

- 让第十刀的最小 face 不再停留在“已经有 handoff strip”，而是最小地向内交出一个 consumer 侧可接住的 hook

第十一刀里，它应该做到：

- 明确 `intake face / handoff strip` 与 `consumer-side receiving edge / minimal intake hook` 不等价
- 至少让实现结构上能看出：一旦 face 成立，face 内侧会再留下一个更窄的 consumer-side 接手边
- 允许当前过渡非常窄，只表达“这片 face 现在先由这个 hook 接住”，而不表达完整恢复动作
- 让后续第十二刀有自然入口，而不是到时候只能回头改写 face 或 lane

第十一刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 recover 结果收口
- 完整 consumer lifecycle

### 5.3 当前链路对 receiving edge 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 lane 之后的最小 face”前移到“存在 face 之后 consumer 侧的最小接手边”

第十一刀里，它应该做到：

- 不再只证明 face 已经存在
- 改为至少能看出 face 之后已经开始出现 consumer-side 最小 receiving edge
- 继续保持 receiving edge 角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第十一刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回

## 6. 这第十一刀明确不包含什么

为了保证第十一刀足够小，这一轮应明确排除下面这些内容：

- 完整 `recover` 真正收口
- 完整 `recover` 结果对象
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 完整 downstream consumer 实现
- 完整 consumer 选择 / 路由策略
- 完整 consumer action runner
- 完整 downstream consumption protocol
- 最终 consumer schema
- 最终 recover intake schema
- 最终 rule table
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第十一刀只做：

- face 之后 consumer 侧最小接手边先站住

不做“完整 recover 动作层已经开始全面展开”的下一层。

## 7. 为什么这一刀适合作为第十一刀

这一刀适合作为第十一刀，核心原因不是“功能更多”，而是“第十刀的 face 之后还有一条必须先独立站住的最小接手边”。

### 7.1 它顺着第十刀的结果继续收

第十刀已经证明：

- `intake lane` 之后确实还有一片更靠近 `intake consumer` 的最小 face
- 这片 face 已经可以被叫成最小 `consumer-intake-facing seam / handoff strip`
- 当前链路已经能暴露 face 的存在

第十一刀只需要继续问：

- 这片 face 再往里，consumer 侧最小先由哪一条边接住

这样做的好处是：

- 不回头重拆第十刀
- 不直接越到完整恢复动作层
- 不把 face 和 receiving edge 混成一层

### 7.2 它把 face 与真正 recover 动作再隔一层很窄的接手边

第十一刀的价值在于把“已经有 face”继续变成“face 内侧已经有一个 consumer-side 的最小接手点”。

这样做的好处是：

- 第十二刀可以更自然地接到更接近真正 `recover-intake consumer` 的下一窄层
- 当前实现不会因为 face 太粗而直接被迫吞进完整 `recover`
- `lane -> face -> receiving edge -> consumer` 的边界会更清楚

### 7.3 它仍然足够小，适合 phase_1 的切片方式

第十一刀如果写得太大，就会立刻变成完整动作层问题。

所以它必须维持：

- 只收一条 receiving edge
- 只收一个 very narrow minimal intake hook
- 只收 face 到 consumer-side 接手边的最小暴露

这正好符合 phase_1 里“小切片、强边界、非最终定稿”的原则。

## 8. 做完后第十二刀最自然接到哪里

第十一刀完成后，第十二刀最自然接到下面这个方向：

- 更接近真正 `recover-intake consumer` 的下一窄层
- 或 `consumer-side receiving edge` 之后、但仍然不是完整 `recover` 动作层的下一小段

白话讲，第十二刀应该去补：

- 这个 receiving edge 之后，真正 `recover-intake consumer` 前方最小的 pre-action 接口或接入槽是什么
- 但仍然不把完整 `recover / resume / hydrate` 全面展开

它仍然应该是：

- 更靠近 recover-intake consumer 的一小段
- 而不是完整动作层
- 而不是最终 schema
- 而不是最终 rule table
- 而不是最终 protocol

## 9. 一个很小的主线图

```text
done (第十刀)
  downstream consumption entry
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
  -> lane 之后更靠近 intake consumer 的最小 consumer-intake-facing seam
  -> 最小 intake face / handoff strip

第十一刀
  -> face 之后 consumer 侧最小接手边
  -> minimal intake hook / consumer-side receiving edge

not yet
  完整 recover
  完整 resume
  完整 hydrate
  最终 schema / rule table / protocol
```

## 10. 结论

第十一刀应该被收敛成：

- `intake face / handoff strip` 之后、更靠近真正 `intake consumer` 的最小 `consumer-side receiving edge / minimal intake hook`

它的任务只有一个：

- 把第十刀已经站住的 face，再往 consumer 侧收成一条最小接手边

如果还停留在“只有 face，没有 receiving edge”“receiving edge 只是 face 的换名说法”“一做 hook 就直接偷跑完整 `recover / resume / hydrate`”，都不应算第十一刀。
