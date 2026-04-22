# agentCore 第六实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第六实施切片指南**。

它只回答一类问题：

- 如果第五刀已经完成，第六轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的 `recover`、`resume`、`hydrate` 或更终局的消费协议层一起提前做掉
- 做完这一刀之后，第七刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第五刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第五刀做完之后，第六刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第五刀之后

第五刀已经把下面这条最小桥接链立住了：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> 当前桥接层消费更窄的 acceptance 后结果邻域
```

第五刀解决的是：

- `acceptance / ack result` 已经不再只是 `recognition result` 的换名尾态
- `downstream handoff / downstream consumption` 已经不再只是“未来可继续下交”的一句描述，而是独立最小交接壳
- 当前桥接层已经开始消费 acceptance 后更窄的结果邻域

但第五刀还刻意没有回答下面两类问题：

- 这份 acceptance 后结果一旦已经可以下交，**下游最小到底应从哪里开始接**
- 这个“开始接”的入口，怎样单独站成一个更明确的消费挂点，而不直接偷跑成完整 `recover`、完整 `resume`、完整 `hydrate`

白话讲，第五刀已经把“更具体结果”和“可下交壳”站住了；第六刀最自然就是把“下游最小从哪里接住它”补出来。

如果这一步不先补，后面很容易出现两种混写：

- handoff 邻域长期停留在“可继续下交”的抽象口号，没有更明确的下游接入点
- 第七刀一上来就被迫把 `recover` 或 `resume` 真正动作层一起吞掉，只因为前面没有单独站住最小消费入口

所以，第六刀最自然不是回头重写第五刀，也不是直接把 `recover`、`hydrate`、`resume` 打通，而是先把 `acceptance / ack result` 之后的**更明确 downstream 最小消费挂点**站住。

## 3. 第六刀依赖哪些上位文档 / 边界文档

第六刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-fifth-implementation-slice-guide-v1.md`

这份文档负责给第六刀提供**第五刀的收口位置**。

它支撑第六刀的方式是：

- 明确第五刀只做到 `acceptance / ack result` 最小正式邻域 + 最小 `downstream handoff / downstream consumption` 邻域
- 明确第六刀最自然应继续收敛到更明确的 downstream 最小消费挂点
- 防止第六刀回头重写第五刀，或把 acceptance 后结果层和 handoff 邻域重新混回去

白话讲，没有这份指南，第六刀就容易失去“从哪里接上来”的施工起点。

### 3.2 `agent-core-fifth-implementation-slice-done-checklist-v1.md`

这份文档负责给第六刀提供**进入条件与完成前提**。

它支撑第六刀的方式是：

- 明确第五刀必须先让 `acceptance / ack result`、最小 handoff 邻域与当前桥接消费都真实成立
- 明确第六刀不是为了替第五刀补漏洞，而是建立在第五刀已经 done 的前提上继续往下接
- 防止第六刀一上来就补消费挂点，但第五刀其实还停留在 handoff 抽象口号级别

白话讲，它决定第六刀不是“另起炉灶”，而是接在第五刀已经站稳的最小桥上。

### 3.3 `agent-core-acceptance-ack-result-formal-baseline-v1.md`

这份文档负责给第六刀提供**核心上游对象边界来源**。

它支撑第六刀的方式是：

- 明确 `acceptance / ack result` 是宿主最终接受/确认后留下的更具体结果/产物问题域
- 明确第六刀站在 `acceptance / ack result` 之后，但不等于重新定义 `acceptance / ack result`
- 允许第六刀只冻结“acceptance 后结果从哪里被下游开始接住”，而不提前写死最终 consumer schema、最终 protocol 或最终 adapter 细则

白话讲，第六刀里“到底是谁的后面要再接一层”，主要就靠这份 formal baseline 托住。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第六刀提供**实现落位感**。

它支撑第六刀的方式是：

- 明确 `acceptance / ack result` 更像“下游交接面”
- 提醒第六刀可以继续往“`accepted-result handoff surface` 外侧的第一个最小接入点”收敛
- 帮第六刀把焦点放在 `downstream result adapter` 之前的极小入口层，而不是扩成完整 consumer 模块树

白话讲，这份落位图的作用不是让第六刀定最终代码树，而是提醒“这一刀已经贴着下游 consumer 入口了，但还不能把完整 consumer 动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第六刀提供**链路位置感与越界控制**。

它支撑第六刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> 下游消费层` 的门口
- 明确 `acceptance / ack result` 之后还有下游消费层，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第六刀把“最小消费入口已经存在”与“下游动作已经完成”混成一层

白话讲，它帮助第六刀记住：这一步仍然是恢复链中后段的接入口层，不是终局动作层。

## 4. 当前建议的第六刀是什么

### 4.1 切片名称

建议把第六刀收敛成：

**更明确的 `downstream consumption entry` 最小消费挂点**

这里的 `downstream consumption entry`，白话讲就是：

- `acceptance / ack result` 之后，下游最小应该从哪里开始接
- 这份 acceptance 后结果，被继续消费时先挂到哪一个最小入口上

它不是完整 consumer，也不是最终 adapter，只是一个比第五刀 handoff 邻域更明确、但仍然极小的消费入口层。

### 4.2 这第六刀的最小组合

这一刀建议只包含下面三件事：

1. 把第五刀留下的 `downstream handoff / downstream consumption` 最小邻域，继续收紧成一个**更明确的 `downstream consumption entry` 最小消费挂点**
2. 让当前链路结构上能看出：`acceptance / ack result` 之后不是直接掉进完整下游动作，而是先进入一个极窄的消费入口层
3. 让后续第七刀可以从这个入口层外侧去接第一个最小 consumer 壳，而不是回头重拆第五刀或第六刀

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> 第七刀再接第一个最小 consumer 壳
```

这里的关键不是把第六刀做成完整消费协议或完整恢复出口，而是先把：

- `acceptance / ack result` 外侧的 handoff 邻域
- handoff 邻域之外更明确的 `downstream consumption entry`
- 当前链路对这个入口层的最小暴露

这三者真实拆开。

## 5. 这第六刀包含什么

第六刀建议只包含下面这些内容。

### 5.1 `downstream consumption entry` 最小消费挂点

它只负责一件事：

- 在 `acceptance / ack result` 与第五刀 handoff 邻域之后，单独站住一个“下游从哪里开始接”的最小入口层

第六刀里，它应该做到：

- 明确 `downstream consumption entry` 站在 `acceptance / ack result` 与真正下游 consumer 动作之间
- 明确它回答的是“这份 acceptance 后结果，最小先从哪里被继续消费”
- 让当前实现结构上能看出：它是独立窄层，不再只是 handoff 邻域里的一句附带描述
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径入口

第六刀里，它不需要做到：

- 最终 consumer 选择策略
- 最终 consumer 路由表
- 最终 entry schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 handoff 到 entry 的最小接线

它只负责一件事：

- 让第五刀的 handoff 邻域不再停留在“可继续下交”，而是最小地交出一个明确可挂接的 entry

第六刀里，它应该做到：

- 明确 handoff 邻域与 `downstream consumption entry` 不等价
- 至少让实现结构上能看出：一旦 `acceptance / ack result` 成立，外面会先留下一个 handoff 邻域，再从中收紧出一个 entry
- 允许当前接线非常窄，只表达“这里就是下游开始接入的入口”，而不表达完整消费动作
- 让后续第七刀有自然入口，而不是到时候只能回头改写 handoff 邻域

第六刀里，它不需要做到：

- 最终 downstream adapter 定稿
- 完整 consumer 生命周期
- 完整动作调度顺序

### 5.3 当前链路对 entry 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 handoff 邻域”前移到“存在更明确的 consumption entry”

第六刀里，它应该做到：

- 不再只证明 acceptance 后结果可以下交
- 改为至少能看出下游最小从哪个入口开始接
- 继续保持入口层角色，不顺手吞掉真正 consumer 的内部动作层

第六刀里，它不需要做到：

- `recover / resume` 的正式消费实现
- `hydrate` 的灌回实现
- 完整下游状态重建

## 6. 这第六刀明确不包含什么

为了保证第六刀足够小，这一轮应明确排除下面这些内容：

- 完整 downstream consumer 实现
- 完整 downstream consumer 选择 / 路由策略
- 完整 downstream consumption protocol
- 完整 `recover` 真正收口
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回逻辑
- 最终 entry schema
- 最终 adapter schema
- 最终 rule table
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第六刀只做：

- acceptance 后结果外侧更明确的最小消费入口先站住

不做“下游 consumer 已经完整跑通”的下一层。

## 7. 为什么这个切片适合作为第六刀

这个切片适合作为第六刀，主要有六个原因。

### 7.1 它正好补上第五刀之后最明显的缺口

第五刀已经证明：

- `acceptance / ack result` 可以独立存在
- 最小 handoff 邻域可以独立存在

但“下游最小从哪里接住它”还没站住。  
第六刀正好补这个缺口，不需要回头改写第五刀。

### 7.2 它先把 handoff 邻域与真正消费入口分开

如果第六刀不先补这一步，后面很容易继续出现：

- handoff 邻域长期冒充消费入口
- 第七刀被迫一边补入口，一边补 consumer 壳
- 第五刀辛苦压住的边界又重新糊回去

第六刀先把这两层分开，能最快止住这类混写。

### 7.3 它先把“消费入口”与“消费动作”分开

如果 `downstream consumption entry` 一成立，就直接把：

- 入口层
- consumer 壳
- `recover / resume / hydrate` 动作

混成一层，后面很容易出现：

- 入口本体不存在，只剩完整动作出口
- 第七刀没有自然切入点
- phase_1 小切片被提前拖进完整恢复动作层

第六刀先把入口层单独站住，后续 consumer 层才有稳定入口。

### 7.4 它比直接进入 `recover / resume` 更稳

`recover / resume` 已经是更下游的动作层。  
如果第六刀直接跳过去，很容易把：

- 完整恢复结果
- 完整续接结果
- 甚至 `hydrate` 灌回

一起带进来。先把更明确的消费入口站住，更符合“小切片继续推进”的节奏。

### 7.5 它与当前落位图完全一致

实现落位图已经把这一层提示成：

- `accepted-result handoff surface`
- `ack result carrier`
- `downstream result adapter`

这说明第六刀最适合做“从 handoff 继续收紧到更明确 entry”，而不是做“完整下游动作实现完成”。

### 7.6 它会让第七刀拥有非常自然的落点

一旦第六刀完成，后面就不必再争论：

- 下游最小到底从哪里接
- 这个入口是否独立存在

第七刀就可以更自然地只补“第一个最小 consumer 壳怎样挂上去”，而不是回头重新拆第五刀或第六刀。

## 8. 做完第六刀后，第七刀最自然接到哪里

如果第六刀完成，下一刀最自然的方向不是回头重写第五刀，也不是直接把完整 `resume` 或完整 `hydrate` 打通，而是继续顺着这条链往下接：

- `acceptance / ack result`
- 最小 `downstream handoff / downstream consumption` 邻域
- 更明确的 `downstream consumption entry`
- 第一个最小 downstream consumer 壳

白话讲，第七刀最自然要回答的问题会变成：

- 这个已经站住的 `downstream consumption entry`，最小先由谁来接
- 这个“谁来接”的第一层 consumer 壳怎样站住，而不把完整 `recover / resume / hydrate` 一起实现

按当前链条，更自然的第七刀落点会更接近：

- `recover` 侧的第一个最小消费壳
- 或等价的 recovery-side consumer surface

但第七刀此时仍然不必做成：

- 完整 `recover` 结果
- 完整 `resume` 结果
- 完整 `hydrate` 灌回
- 最终下游 adapter / protocol 定稿

也就是说，第六刀做完之后，第七刀最自然是接到**`downstream consumption entry` 外侧的第一个最小 consumer 壳**，而不是把后半条恢复链一口气写完。

## 9. 一个很小的第六刀边界图

```text
第五刀终点
  acceptance / ack result 已是独立最小正式邻域
  downstream handoff / downstream consumption 已是最小交接邻域
  当前桥接层已消费 acceptance 后更窄邻域

第六刀要补
  downstream consumption entry 最小消费挂点成立
  handoff 邻域到 entry 的最小接线成立
  当前链路已能明确暴露“下游从哪里开始接”

第六刀不补
  完整 downstream consumer
  完整 recover / resume / hydrate
  最终 schema / 最终 protocol / 最终目录树
```

## 10. 最终收敛口径

第六刀可以收敛成下面这句施工口径：

- 当 `downstream consumption entry` 已经作为 `acceptance / ack result` 与第五刀 handoff 邻域之后的独立最小消费挂点成立，当前链路已经能够明确暴露“下游从哪里开始接”，且实现没有越界吞掉完整 `recover`、`resume`、`hydrate`、最终 consumer schema 与最终协议定稿问题域时，这一刀就是合格的第六实施切片

如果还停留在“handoff 只是可继续下交的口号”“没有独立 entry”“一做 entry 就直接偷跑完整 recover / resume / hydrate”，都不应算第六刀。
