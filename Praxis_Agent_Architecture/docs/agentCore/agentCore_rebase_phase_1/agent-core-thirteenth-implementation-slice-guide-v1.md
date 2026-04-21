# agentCore 第十三实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第十三实施切片指南**。

它只回答一类问题：

- 如果第十二刀已经完成，第十三轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把后面的完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第十四刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十二刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 `recover-intake consumer` 设计稿
- 最终 action candidate 设计稿
- 最终 schema、最终 rule table 或最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举或动作类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第十二刀做完之后，第十三刀先落哪一小段”收敛成一个可执行建议。

白话讲，第十三刀不是宣布完整恢复动作层开始全面展开，而是在第十二刀已经站住的 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port` 之后，继续往真正 `recover-intake consumer` 方向收一小片**动作候选之前**的 consumer 边界。

## 2. 为什么它自然接在第十二刀之后

第十二刀已经把下面这条最小桥接链立住了：

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
```

第十二刀解决的是：

- `consumer-side receiving edge / minimal intake hook` 之后，已经不再只是“有 hook”
- hook 之后已经单独站住一个动作层之前的最小 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port`
- 当前链路已经能最小暴露“pre-action slot 已存在”，而不是只暴露“receiving edge / hook 已存在”

但第十二刀还刻意没有回答下面这一类问题：

- 这个 pre-action slot 之后，真正 `recover-intake consumer` 前方的第一片 consumer 边界是什么
- pre-action seam 如何继续收成一个更接近动作候选边、但仍然不产出完整动作候选的窄层
- 这个 `pre-action consumer boundary / action-candidate-facing edge` 怎样单独站住，但仍然不冒充完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第十二刀已经证明“receiving edge 之后、真正动作层之前的 pre-action slot 已存在”；第十三刀最自然就是把 **pre-action slot 之后、真正动作候选边之前的最小 pre-action consumer boundary** 补出来。

如果这一步不先补，后面很容易出现两种混写：

- 第十三刀一上来就把 pre-action slot 直接写成完整 `recover` 动作入口，只因为 slot 之后没有独立站住 consumer boundary
- 第十四刀只能同时补“pre-action consumer boundary”和“第一个动作候选边”，无法继续保持窄层推进

所以，第十三刀最自然不是回头重写第十二刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 **pre-action slot 之后、动作候选边之前的最小 consumer boundary / action-candidate-facing edge** 站住，并优先保持在一个很小的动作候选前置边界这一层。

## 3. 第十三刀依赖哪些上位文档 / 边界文档

第十三刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面六份。

### 3.1 `agent-core-twelfth-implementation-slice-guide-v1.md`

这份文档负责给第十三刀提供**第十二刀的收口位置**。

它支撑第十三刀的方式是：

- 明确第十二刀只做到 `consumer-side receiving edge / minimal intake hook` 之后的最小 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port`
- 明确第十三刀最自然应继续收敛到 pre-action slot 之后、更接近真正 `recover-intake consumer` 的下一窄层
- 防止第十三刀回头重拆 receiving edge 或 pre-action slot，或把 pre-action slot 直接升级成完整动作层

白话讲，没有第十二刀的 pre-action slot，第十三刀就失去了“从哪里进入 consumer boundary”的施工起点。

### 3.2 `agent-core-twelfth-implementation-slice-done-checklist-v1.md`

这份文档负责给第十三刀提供**进入条件与完成前提**。

它支撑第十三刀的方式是：

- 明确第十二刀必须先让 entry、consumer 壳、壳内 seam、intake lane、intake face、receiving edge、pre-action slot 和当前链路最小暴露都真实成立
- 明确第十三刀不是为了替第十二刀补 pre-action slot，而是建立在 pre-action slot 已经站稳的前提上继续往里收
- 防止第十三刀一上来就补 consumer boundary，但第十二刀其实还停留在 receiving edge 或 hook 描述级别

白话讲，它决定第十三刀不是“另起炉灶”，而是接在第十二刀已经站稳的最小 pre-action slot 之后。

### 3.3 `agent-core-eleventh-implementation-slice-guide-v1.md`

这份文档负责给第十三刀提供**更外侧的 receiving edge 坐标**。

它支撑第十三刀的方式是：

- 明确第十二刀的 pre-action slot 是从第十一刀的最小 `consumer-side receiving edge / minimal intake hook` 继续长出来的
- 明确第十三刀不能把 pre-action consumer boundary 反向写成新的 receiving edge，也不能把 receiving edge、pre-action slot、consumer boundary 重新揉成一层
- 防止第十三刀把 “hook 接住了” 误写成 “动作候选已经开始全面生成”

白话讲，没有第十一刀的 receiving edge，第十三刀就会失去“pre-action slot 从哪条 consumer-side 接手边向内长出来”的参考坐标。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第十三刀提供**实现落位感**。

它支撑第十三刀的方式是：

- 明确 `acceptance / ack result` 之后，外面已经有 recovery-side consumer 壳、壳内 seam、lane、face、receiving edge 和 pre-action slot
- 提醒第十三刀现在要从 pre-action slot 再往真正 `recover-intake consumer` 方向收束，但仍然不要扩成完整 consumer 模块树或动作树
- 帮第十三刀把焦点放在动作候选之前的最小 consumer boundary 上，而不是把完整恢复动作层一起带出来

白话讲，这份落位图的作用不是让第十三刀定最终代码树，而是提醒“这一刀已经来到 pre-action slot 之后、动作候选边之前的 consumer boundary 邻接层，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第十三刀提供**链路位置感与越界控制**。

它支撑第十三刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> consumer 壳 -> seam -> lane -> face -> receiving edge -> pre-action slot` 的门口
- 明确 pre-action slot 之后确实还有更靠近 `recover-intake consumer` 的最小边界，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第十三刀把“pre-action slot 已经存在”与“真实 recover 动作候选已经被完整构造”混成一层

白话讲，它帮助第十三刀记住：这一步仍然是恢复链后段的 pre-action consumer 邻接层，不是终局动作层。

### 3.6 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第十三刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第十三刀的方式是：

- 明确 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第十三刀现在仍然只站在 pre-action slot 之后、动作候选边之前的 consumer boundary 上，不应把完整恢复动作层偷进来
- 防止第十三刀虽然口头说“不做完整恢复”，但依然没有一个明确的正式基线来托住这条边界

白话讲，这份正式基线的作用，是让第十三刀知道自己不是在启动完整恢复引擎，而是在恢复引擎前方继续补一片动作候选之前的最小 consumer 边界。

## 4. 当前建议的第十三刀是什么

### 4.1 切片名称

建议把第十三刀收敛成：

**`pre-action intake slot / recover-intake pre-action seam` 之后的最小 `pre-action consumer boundary`**

也可以白话地叫成：

**pre-action slot 之后、真正动作候选边之前的最小 consumer boundary / action-candidate-facing edge**

它不是完整 `recover`，也不是完整 `resume` 或完整 `hydrate`，更不是最终 action candidate，只是比第十二刀那个 pre-action slot 更里一层、但仍然极小的“动作候选前置边界”。

### 4.2 这第十三刀的最小组合

这一刀建议只包含下面三件事：

1. 把第十二刀留下的最小 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port`，继续向内收成一个**更靠近真正 recover-intake consumer、但仍在动作候选生成之前的最小 consumer boundary**
2. 让当前链路结构上能看出：pre-action slot 之后不是直接跳进完整 `recover` 动作，也不是直接产出完整 action candidate，而是先进入一个很窄的 `pre-action consumer boundary / action-candidate-facing edge`
3. 让后续第十四刀可以从这个 consumer boundary 再往里接更接近第一个极窄动作候选边，或第一个 `recover-intake consumer action candidate` 的前置边界，而不是回头重拆第十一刀或第十二刀

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
```

这里的关键不是把第十三刀做成完整消费动作、完整动作候选生成器或完整恢复流程，而是先把：

- 第十二刀已经站住的最小 pre-action slot / pre-action seam / pre-action port
- pre-action slot 之后、更靠近真正 `recover-intake consumer` 的最小 pre-action consumer boundary
- 当前链路对这片 consumer boundary 的最小暴露

这三者真实拆开。

## 5. 这第十三刀包含什么

第十三刀建议只包含下面这些内容。

### 5.1 pre-action slot 之后的一个最小 consumer boundary

它只负责一件事：

- 在最小 `pre-action intake slot / recover-intake pre-action seam` 之后，单独站住一个“真正动作候选边之前先由 consumer 边界接住”的 pre-action consumer boundary

第十三刀里，它应该做到：

- 明确这片 boundary 站在 pre-action slot 与真正 action candidate 之间
- 明确它回答的是“slot 再往里，真正动作候选形成之前最小先进入哪片 consumer 边界”
- 让当前实现结构上能看出：它是 pre-action slot 之后的更内侧窄层，不再只是 slot 的未来说明
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 boundary 成立

第十三刀里，它不需要做到：

- 最终 recover 动作收口
- 最终 resume 接续策略
- 最终 hydrate 灌回逻辑
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名
- 最终 action candidate 对象、字段或动作执行器

### 5.2 pre-action seam 到 action-candidate-facing edge 的最小过渡

它只负责一件事：

- 让第十二刀的最小 pre-action seam 不再停留在“已经有动作前接入槽”，而是最小地向内交出一个动作候选前方可识别的 consumer-facing 边界

第十三刀里，它应该做到：

- 明确 `pre-action intake slot / recover-intake pre-action seam` 与 `pre-action consumer boundary / action-candidate-facing edge` 不等价
- 至少让实现结构上能看出：一旦 pre-action slot 成立，slot 内侧会再留下一个更窄的动作候选前置边界
- 允许当前过渡非常窄，只表达“这个 pre-action slot 现在先交给这个 consumer boundary”，而不表达完整恢复动作
- 让后续第十四刀有自然入口，而不是到时候只能回头改写 pre-action slot、receiving edge 或 intake hook

第十三刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 action candidate 选择 / 排序 / 执行
- 完整 recover 结果收口
- 完整 consumer lifecycle

### 5.3 当前链路对 consumer boundary 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 receiving edge 之后、动作层之前的最小 pre-action slot”前移到“存在 pre-action slot 之后、动作候选边之前的最小 consumer boundary”

第十三刀里，它应该做到：

- 不再只证明 pre-action slot 已经存在
- 改为至少能看出 pre-action slot 之后已经开始出现 consumer-side 的动作候选前置边界
- 继续保持 consumer boundary 角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第十三刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回
- 完整 action candidate runner

## 6. 这第十三刀明确不包含什么

为了保证第十三刀足够小，这一轮应明确排除下面这些内容：

- 完整 `recover` 真正收口
- 完整 `recover` 结果对象
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 完整 downstream consumer 实现
- 完整 recover-intake consumer 实现
- 完整 consumer 选择 / 路由策略
- 完整 consumer action runner
- 完整 action candidate 生成器
- 完整 action candidate 选择 / 排序 / 执行策略
- 完整 downstream consumption protocol
- 完整 pre-action 校验矩阵
- 最终 consumer schema
- 最终 recover intake schema
- 最终 action candidate schema
- 最终 rule table
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第十三刀只做：

- pre-action slot 之后、真正动作候选边之前的最小 pre-action consumer boundary 先站住

不做“完整 recover 动作层已经开始全面展开”的下一层。

## 7. 为什么这一刀适合作为第十三刀

这一刀适合作为第十三刀，核心原因不是“功能更多”，而是“第十二刀的 pre-action slot 之后还有一片必须先独立站住的 consumer 边界”。

### 7.1 它顺着第十二刀的结果继续收

第十二刀已经证明：

- `consumer-side receiving edge / minimal intake hook` 之后确实还有一个动作层之前的最小 pre-action slot
- 这个 slot 已经可以被叫成最小 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port`
- 当前链路已经能暴露 pre-action slot 的存在

第十三刀只需要继续问：

- 这个 pre-action slot 再往里，真正动作候选形成之前，最小先由哪片 consumer boundary 接住

这样做的好处是：

- 不回头重拆第十二刀
- 不直接越到完整恢复动作层
- 不把 pre-action slot 和 pre-action consumer boundary 混成一层

### 7.2 它把 pre-action slot 与真正动作候选边再隔一层很窄的 consumer boundary

第十三刀的价值在于把“已经有 pre-action slot”继续变成“pre-action slot 内侧已经有一个动作候选前方的最小 consumer 边界”。

这样做的好处是：

- 第十四刀可以更自然地接到更接近第一个极窄动作候选边的下一窄层
- 当前实现不会因为 pre-action slot 太粗而直接被迫吞进完整 `recover`
- `receiving edge -> pre-action slot -> pre-action consumer boundary -> action candidate` 的边界会更清楚

### 7.3 它仍然足够小，适合 phase_1 的切片方式

第十三刀如果写得太大，就会立刻变成完整动作候选与完整动作执行问题。

所以它必须维持：

- 只收一个 pre-action consumer boundary
- 只收一个 very narrow action-candidate-facing edge
- 只收 pre-action slot 到动作候选前置边界的最小暴露

这正好符合 phase_1 里“小切片、强边界、非最终定稿”的原则。

## 8. 做完后第十四刀最自然接到哪里

第十三刀完成后，第十四刀最自然接到下面这个方向：

- 更接近第一个极窄动作候选边的下一窄层
- 或第一个 `recover-intake consumer action candidate` 的前置边界
- 或 `pre-action consumer boundary / action-candidate-facing edge` 之后、但仍然不是完整 `recover` 动作层的下一小段

白话讲，第十四刀应该去补：

- 这片 pre-action consumer boundary 之后，第一个极窄 action candidate 边怎样被看见
- 或者 consumer boundary 如何最小地接近第一个 recover-intake consumer action candidate，但仍然不启动完整 `recover / resume / hydrate` 全面展开

它仍然应该是：

- 更靠近 recover-intake consumer 的一小段
- 而不是完整动作层
- 而不是最终 action candidate schema
- 而不是最终 rule table
- 而不是最终 protocol

## 9. 一个很小的主线图

```text
done (第十二刀)
  downstream consumption entry
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
  -> lane 之后更靠近 intake consumer 的最小 consumer-intake-facing seam
  -> 最小 intake face / handoff strip
  -> face 之后 consumer 侧最小接手边
  -> minimal intake hook / consumer-side receiving edge
  -> receiving edge 之后、动作层之前的最小 pre-action intake slot
  -> recover-intake pre-action seam / consumer-side pre-action port

第十三刀
  -> pre-action slot 之后、动作候选边之前的最小 pre-action consumer boundary
  -> action-candidate-facing edge / consumer boundary port

not yet
  第一个完整 action candidate
  完整 recover
  完整 resume
  完整 hydrate
  最终 schema / rule table / protocol
```

## 10. 结论

第十三刀应该被收敛成：

- `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port` 之后、更接近真正 `recover-intake consumer` 的最小 `pre-action consumer boundary / action-candidate-facing edge`

它的任务只有一个：

- 把第十二刀已经站住的 pre-action slot，再往 consumer 侧收成一个动作候选边之前的最小边界

如果还停留在“只有 pre-action slot，没有 consumer boundary”“consumer boundary 只是 pre-action slot 的换名说法”“一做 action-candidate-facing edge 就直接偷跑完整 `recover / resume / hydrate` 或完整 action candidate”，都不应算第十三刀。
