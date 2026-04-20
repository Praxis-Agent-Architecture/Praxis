# agentCore 第七实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第七实施切片指南**。

它只回答一类问题：

- 如果第六刀已经完成，第七轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的 `recover`、`resume`、`hydrate` 或更终局的消费协议层一起提前做掉
- 做完这一刀之后，第八刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第六刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第六刀做完之后，第七刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第六刀之后

第六刀已经把下面这条最小桥接链立住了：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> 当前链路最小暴露 entry
```

第六刀解决的是：

- `downstream consumption entry` 已经不再只是 handoff 邻域里的一句描述，而是独立最小消费挂点
- handoff 邻域与 entry 已经不再混成一层
- 当前链路已经开始明确暴露“下游最小从哪里开始接”

但第六刀还刻意没有回答下面两类问题：

- 这个已经站住的 `downstream consumption entry`，外侧最小先由谁接住
- 这个“谁来接”的第一层 recovery-side consumer 壳，怎样单独站住，而不直接偷跑成完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第六刀已经把“入口”站住了；第七刀最自然就是把“入口外侧第一个最小 consumer 壳”补出来。

如果这一步不先补，后面很容易出现两种混写：

- `downstream consumption entry` 长期停留在“已经有入口”的抽象口号，没有真正外接到任何最小 consumer 壳
- 第八刀一上来就被迫把 `recover` 内侧消费、结果收口甚至 `resume / hydrate` 一起吞掉，只因为前面没有单独站住 recovery-side 的第一层 consumer 壳

所以，第七刀最自然不是回头重写第六刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 `downstream consumption entry` 外侧的**第一个最小 consumer 壳**站住，并优先保持在 recovery-side consumer surface 这一层。

## 3. 第七刀依赖哪些上位文档 / 边界文档

第七刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-sixth-implementation-slice-guide-v1.md`

这份文档负责给第七刀提供**第六刀的收口位置**。

它支撑第七刀的方式是：

- 明确第六刀只做到 `downstream consumption entry` 最小消费挂点
- 明确第七刀最自然应继续收敛到 `downstream consumption entry` 外侧的第一个最小 consumer 壳
- 防止第七刀回头重写 entry，或把 entry 与 consumer 壳重新混回去

白话讲，没有这份指南，第七刀就容易失去“从哪里接上来”的施工起点。

### 3.2 `agent-core-sixth-implementation-slice-done-checklist-v1.md`

这份文档负责给第七刀提供**进入条件与完成前提**。

它支撑第七刀的方式是：

- 明确第六刀必须先让 handoff 邻域、entry 与当前链路最小暴露都真实成立
- 明确第七刀不是为了替第六刀补入口，而是建立在 entry 已经站稳的前提上继续往外接
- 明确下一刀应收敛到“entry 外侧的第一个最小 consumer 壳”，优先偏 recovery-side consumer surface

白话讲，它决定第七刀不是“另起炉灶”，而是接在第六刀已经站稳的最小入口外侧。

### 3.3 `agent-core-acceptance-ack-result-formal-baseline-v1.md`

这份文档负责给第七刀提供**核心上游对象边界来源**。

它支撑第七刀的方式是：

- 明确 `acceptance / ack result` 是宿主最终接受/确认后留下、可继续交给下游消费的更具体结果/产物问题域
- 明确第七刀站在 `acceptance / ack result` 之后，但不等于重新定义它
- 允许第七刀只冻结“第一个最小 consumer 壳”，而不提前写死最终 consumer schema、最终 recover intake schema、最终 protocol 或最终 adapter 细则

白话讲，第七刀里“到底是谁外侧要再接一层”，主要就靠这份 formal baseline 托住。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第七刀提供**实现落位感**。

它支撑第七刀的方式是：

- 明确 `acceptance / ack result` 更像“下游交接面”
- 提醒第七刀已经来到“下游交接面外侧的第一层 consumer 入口壳”，但还没到 runtime orchestration 或完整 `recover` 动作层
- 帮第七刀把焦点放在 recovery-side minimal consumer shell，而不是扩成完整 consumer 模块树或完整恢复总协调器

白话讲，这份落位图的作用不是让第七刀定最终代码树，而是提醒“这一刀已经贴着 recover 侧第一层 consumer 壳了，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第七刀提供**链路位置感与越界控制**。

它支撑第七刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> 下游消费层` 的门口
- 明确 entry 之后确实还有下游消费层，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第七刀把“第一个 consumer 壳已经存在”与“下游恢复动作已经完成”混成一层

白话讲，它帮助第七刀记住：这一步仍然是恢复链中后段的 consumer 壳层，不是终局动作层。

## 4. 当前建议的第七刀是什么

### 4.1 切片名称

建议把第七刀收敛成：

**`downstream consumption entry` 外侧的第一个最小 consumer 壳**

按当前链条，这个 consumer 壳应优先偏向：

- recovery-side consumer surface
- 或等价的 recover-side minimal consumer shell

它不是完整 consumer，也不是完整 `recover`，只是比第六刀 entry 更外一层、但仍然极小的“第一接手壳”。

### 4.2 这第七刀的最小组合

这一刀建议只包含下面三件事：

1. 把第六刀留下的 `downstream consumption entry`，继续外接成一个**第一个最小 consumer 壳**
2. 让当前链路结构上能看出：entry 之后不是直接掉进完整 `recover` 动作，而是先进入 recovery-side 的第一层最小 consumer surface
3. 让后续第八刀可以从这个 consumer 壳内侧继续接“更具体的最小消费接线 / 最小 recover intake 接缝”，而不是回头重拆第六刀或第七刀

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 第八刀再接壳内侧更具体的最小消费接线
```

这里的关键不是把第七刀做成完整消费协议或完整恢复出口，而是先把：

- `downstream consumption entry`
- entry 外侧第一个最小 consumer 壳
- 当前链路对这个 consumer 壳的最小暴露

这三者真实拆开。

## 5. 这第七刀包含什么

第七刀建议只包含下面这些内容。

### 5.1 recovery-side 第一个最小 consumer 壳

它只负责一件事：

- 在 `downstream consumption entry` 外侧，单独站住一个“最小先由谁接”的 recovery-side consumer 壳

第七刀里，它应该做到：

- 明确这个 consumer 壳站在 entry 与真正 `recover` 动作之间
- 明确它回答的是“entry 现在最小先由 recovery-side 哪一层壳接住”
- 让当前实现结构上能看出：它是独立窄层，不再只是“未来这里会有 consumer”的一句附带描述
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 consumer 壳成立

第七刀里，它不需要做到：

- 最终 consumer 选择策略
- 最终 consumer 路由表
- 完整 consumer 生命周期
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 entry 到 consumer 壳的最小接线

它只负责一件事：

- 让第六刀的 entry 不再停留在“可被下游接住”，而是最小地交给一个明确可挂接的 recovery-side consumer 壳

第七刀里，它应该做到：

- 明确 `downstream consumption entry` 与第一个 consumer 壳不等价
- 至少让实现结构上能看出：一旦 entry 成立，外面会先留下一个 recovery-side 的最小接壳
- 允许当前接线非常窄，只表达“这份 entry 现在由这层壳先接住”，而不表达完整恢复动作
- 让后续第八刀有自然入口，而不是到时候只能回头改写 entry 或 consumer 壳

第七刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 recover 结果收口

### 5.3 当前链路对 consumer 壳的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 entry”前移到“存在 entry 外侧的第一个最小 consumer 壳”

第七刀里，它应该做到：

- 不再只证明下游最小从哪个 entry 开始接
- 改为至少能看出 entry 外侧已经有一层 recovery-side consumer 壳
- 继续保持 consumer 壳角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第七刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回

## 6. 这第七刀明确不包含什么

为了保证第七刀足够小，这一轮应明确排除下面这些内容：

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

一句话说，第七刀只做：

- `downstream consumption entry` 外侧第一个最小 consumer 壳先站住

不做“recover 这半条后链已经完整跑通”的下一层。

## 7. 为什么这个切片适合作为第七刀

这个切片适合作为第七刀，主要有六个原因。

### 7.1 它正好补上第六刀之后最明显的缺口

第六刀已经证明：

- `downstream consumption entry` 可以独立存在
- 当前链路可以明确暴露“下游从哪里开始接”

但“entry 外侧第一个最小 consumer 壳”还没站住。  
第七刀正好补这个缺口，不需要回头改写第六刀。

### 7.2 它先把 entry 与 consumer 壳分开

如果第七刀不先补这一步，后面很容易继续出现：

- entry 长期冒充 consumer 壳
- consumer 壳没有独立落脚点
- 第八刀只能回头重新拆第六刀

第七刀先把这两层分开，能最快止住这类混写。

### 7.3 它先把“第一层接手壳”与“真正 recover 动作”分开

如果第七刀一上来就把：

- consumer 壳
- `recover` 动作
- `resume / hydrate` 后续动作

混成一层，后面很容易出现：

- 壳本体不存在，只剩动作出口
- 第八刀没有自然切入点
- phase_1 小切片被提前拖进完整恢复动作层

第七刀先把 consumer 壳单独站住，后续内侧消费接线才有稳定入口。

### 7.4 它比直接进入完整 `recover` 更稳

`recover` 已经是更下游的动作层。  
如果第七刀直接跳过去，很容易把：

- 完整恢复结果
- 完整续接结果
- 甚至 `hydrate` 灌回

一起带进来。先把 recovery-side 第一层 consumer 壳站住，更符合“小切片继续推进”的节奏。

### 7.5 它与当前链条位置完全一致

结构图和落位图都已经说明：

- `acceptance / ack result` 更像下游交接面
- entry 之后会进入下游消费层
- 但当前还不该直接等于 runtime orchestration 或完整 `recover`

这说明第七刀最适合做“第一层 consumer 壳站住”，而不是做“完整恢复动作实现完成”。

### 7.6 它会让第八刀拥有非常自然的落点

一旦第七刀完成，后面就不必再争论：

- entry 外侧到底有没有独立 consumer 壳
- recovery-side 第一接手层到底是否存在

第八刀就可以更自然地只补“这个 consumer 壳内侧怎样继续形成更具体的最小消费接线”，而不是回头重拆第六刀或第七刀。

## 8. 做完第七刀后，第八刀最自然接到哪里

如果第七刀完成，下一刀最自然的方向不是回头重写第六刀，也不是直接把完整 `resume` 或完整 `hydrate` 打通，而是继续顺着这条链往下接：

- `acceptance / ack result`
- 最小 `downstream handoff / downstream consumption` 邻域
- `downstream consumption entry`
- recovery-side 第一个最小 consumer 壳
- 壳内侧更具体的最小消费接线 / 最小 recover intake 接缝

白话讲，第八刀最自然要回答的问题会变成：

- 这个已经站住的 consumer 壳，内侧最小怎样继续把 entry 交进 `recover` 侧更窄的问题域
- 这个“继续交进去”的最小接线怎样成立，而不把完整 `recover / resume / hydrate` 一起实现

按当前链条，更自然的第八刀落点会更接近：

- recovery-side consumer shell 内侧的第一条最小消费接线
- 或等价的最小 recover intake seam

但第八刀此时仍然不必做成：

- 完整 `recover` 结果
- 完整 `resume` 结果
- 完整 `hydrate` 灌回
- 最终 downstream adapter / protocol 定稿

也就是说，第七刀做完之后，第八刀最自然是接到**consumer 壳内侧的第一条最小消费接线**，而不是把后半条恢复链一口气写完。

## 9. 一个很小的第七刀边界图

```text
第六刀终点
  downstream consumption entry 已是独立最小消费挂点
  当前链路已明确暴露“下游从哪里开始接”

第七刀要补
  entry 外侧第一个 recovery-side consumer 壳成立
  entry 到 consumer 壳的最小接线成立
  当前链路已能明确暴露“最小先由谁接”

第七刀不补
  完整 recover / resume / hydrate
  完整 downstream consumer
  最终 schema / 最终 protocol / 最终目录树
```

## 10. 最终收敛口径

第七刀可以收敛成下面这句施工口径：

- 当 `downstream consumption entry` 外侧的第一个最小 consumer 壳已经成立，entry 到这层壳的最小接线已经成立，且当前链路已经能够明确暴露“最小先由谁接”这一事实，同时实现没有越界吞掉完整 `recover`、`resume`、`hydrate`、最终 consumer schema 与最终协议定稿问题域时，这一刀就是合格的第七实施切片

如果还停留在“只有 entry，没有独立 consumer 壳”“consumer 壳只是 future recover 的换名说法”“一做 consumer 壳就直接偷跑完整 recover / resume / hydrate”，都不应算第七刀。
