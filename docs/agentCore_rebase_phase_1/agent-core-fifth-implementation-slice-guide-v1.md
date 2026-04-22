# agentCore 第五实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第五实施切片指南**。

它只回答一类问题：

- 如果第四刀已经完成，第五轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的 `recover`、`hydrate`、`resume` 或更终局的协议层一起提前做掉
- 做完这一刀之后，第六刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第四刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第四刀做完之后，第五刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第四刀之后

第四刀已经把下面这条最小桥接链立住了：

```text
cursor advancement result
  -> cursor advancement recognition 最小正式边界
  -> cursor advancement recognition result 最小结果邻域
  -> 上位协调面消费更窄的 recognition 后结果邻域
```

第四刀解决的是：

- `recognition` 已经不再只是挂点，而是最小正式边界
- `recognition result` 已经不再只是尾态，而是独立最小结果邻域
- 上位协调面已经开始消费更窄的 recognition 后结果邻域

但第四刀还刻意没有回答下面两类问题：

- `recognition result` 之后，宿主真正接受/确认后留下的那份**更具体结果**，最小应该怎样单独站住
- 这份更具体结果一旦站住，最小应该怎样留出一个**下游 handoff / downstream consumption 邻域**

白话讲，第四刀已经把“承认边界”和“承认后结果壳”站住了；第五刀最自然就是把“宿主接受/确认后真正留下什么结果”和“这个结果怎样以极小接口交给下游继续消费”补上。

如果这一步不先补，后面很容易出现两种混写：

- 下游直接拿 `recognition result` 冒充最终可交接结果
- `recover / resume` 为了继续往下走，被迫反向吞掉 `acceptance / ack result` 的边界定义

所以，第五刀最自然不是回头重写第四刀，也不是直接把 `recover`、`hydrate`、`resume` 打通，而是先把 `acceptance / ack result` 与它外侧那一圈极小 handoff 邻域站住。

## 3. 第五刀依赖哪些上位文档 / 边界文档

第五刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-fourth-implementation-slice-guide-v1.md`

这份文档负责给第五刀提供**第四刀的收口位置**。

它支撑第五刀的方式是：

- 明确第四刀只做到 `recognition` 最小正式边界 + `recognition result` 最小结果邻域
- 明确第五刀最自然应继续收敛到 `acceptance / ack result` 最小正式邻域
- 防止第五刀回头重写第四刀，或把第四刀刚拆开的边界重新混回去

白话讲，没有这份指南，第五刀就容易失去“从哪里接上来”的施工起点。

### 3.2 `agent-core-fourth-implementation-slice-done-checklist-v1.md`

这份文档负责给第五刀提供**进入条件与完成前提**。

它支撑第五刀的方式是：

- 明确第四刀必须先让 `recognition` 正式边界、`recognition result` 最小结果邻域与上位桥接消费都真实成立
- 明确第五刀不是为了替第四刀补漏洞，而是建立在第四刀已经 done 的前提上继续往下接
- 防止第五刀一上来就补 acceptance，但第四刀其实还停留在 recognition 挂点级别

白话讲，它决定第五刀不是“另起炉灶”，而是接在第四刀已经站稳的最小桥上。

### 3.3 `agent-core-acceptance-ack-result-formal-baseline-v1.md`

这份文档负责给第五刀提供**核心对象边界来源**。

它支撑第五刀的方式是：

- 明确 `acceptance / ack result` 是承认边界已经成立之后，宿主真正接受/确认后留下的那份更具体结果/产物问题域
- 明确它不等于 `recognition`、`recognition result`、`advancement result`，也不等于完整 `recover`、`resume`
- 允许第五刀只冻结“最小正式邻域 + 最小 handoff 邻域”，而不提前写死最终 acceptance / ack 条件集合、最终 rule table、最终 result schema 或最终消费协议

白话讲，第五刀里“到底要站住什么对象”，主要就靠这份 formal baseline 托住。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第五刀提供**实现落位感**。

它支撑第五刀的方式是：

- 明确 `acceptance / ack result` 更像“下游交接面”，实现上更偏 `accepted-result handoff surface`、`ack result carrier`、`downstream result adapter` 这一类关注面
- 提醒第五刀可以开始留交接壳，但不应把它误写成最终模块树或最终 adapter 定稿
- 帮第五刀把“最小 downstream handoff / downstream consumption 邻域”收在实现关注面，而不是扩成完整运行链

白话讲，这份落位图的作用不是让第五刀定最终代码树，而是提醒“这一刀已经贴近下游交接面了，但还不能把整个下游动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第五刀提供**链路位置感与越界控制**。

它支撑第五刀的方式是：

- 明确当前主链是 `recognition -> recognition result -> acceptance / ack result`
- 明确 `acceptance / ack result` 之后还有下游消费层，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第五刀把“接受/确认后结果”与“下游动作已经完成”混成一层

白话讲，它帮助第五刀记住：这一步仍然在恢复链的中后段桥接层，不是终局动作层。

## 4. 当前建议的第五刀是什么

### 4.1 切片名称

建议把第五刀收敛成：

**`acceptance / ack result` 最小正式邻域 + 最小 downstream handoff / downstream consumption 邻域**

### 4.2 这第五刀的最小组合

这一刀建议只包含下面三件事：

1. 把第四刀留下的 `recognition result` 继续收紧成一个最小 `acceptance / ack result` 正式邻域
2. 在该正式邻域外侧，只接出一个极窄的 `downstream handoff / downstream consumption` 最小邻域
3. 让当前桥接层开始消费“`acceptance / ack result` + 极小 handoff 邻域”，而不是继续直接拿 `recognition result` 当下游交付面

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> 下游动作稍后再接
```

这里的关键不是把第五刀做成完整 acceptance 协议或完整恢复出口，而是先把：

- `acceptance / ack result` 作为独立更具体结果问题域的最小正式边界
- 该结果外侧最小可交接的 handoff / consumption 邻域
- 当前桥接层对这组更窄结果邻域的最小消费改口径

这三者真实拆开。

## 5. 这第五刀包含什么

第五刀建议只包含下面这些内容。

### 5.1 `acceptance / ack result` 最小正式邻域

它只负责一件事：

- 把第四刀留下的 `recognition result` 继续收紧成“宿主接受/确认后留下的更具体结果”的最小正式层

第五刀里，它应该做到：

- 明确 `acceptance / ack result` 站在 `recognition result` 与下游消费动作之间
- 明确它回答的是“承认后结果里，哪份最小结果已经被宿主接受/确认并可继续下交”
- 让当前实现结构上能看出：`acceptance / ack result` 是独立窄层，不再只是 `recognition result` 的换名尾态
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径接受/确认

第五刀里，它不需要做到：

- 最终 acceptance / ack 条件全集
- 最终 acceptance / ack rule table
- 最终 acceptance / ack result schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 最小 downstream handoff / downstream consumption 邻域

它只负责一件事：

- 在 `acceptance / ack result` 外侧，形成一个**可被后续下游继续接住，但仍然极窄的 handoff / consumption 邻域**

第五刀里，它应该做到：

- 明确 handoff / consumption 邻域不等于 `acceptance / ack result` 本体，而是它外侧最小交接面
- 至少让实现结构上能看出：一旦 `acceptance / ack result` 成立，外面会留下一个可继续被下游接住的最小交接壳
- 允许当前 handoff 邻域非常窄，只表达“这份结果现在可继续下交”，而不表达完整下游动作
- 让后续第六刀有自然入口，而不是到时候只能回头重拆第五刀

第五刀里，它不需要做到：

- 最终 downstream adapter 定稿
- 完整下游消费流
- 完整 `recover` 收口
- 完整 `resume` 续接
- `hydrate` 真正灌回

### 5.3 当前桥接层的最小消费改口径

它只负责一件事：

- 让当前桥接层从“直接消费 `recognition result`”前移到“消费 `acceptance / ack result` + 极小 handoff 邻域”

第五刀里，它应该做到：

- 不再只证明 recognition 后已经有结果壳
- 改为消费 acceptance / ack 之后留下的更具体结果与其外侧极小交接面
- 继续保持桥接角色，不顺手吞掉真正下游动作层

第五刀里，它不需要做到：

- `recover / resume` 的正式动作实现
- 完整下游状态重建
- 最终恢复链收口

## 6. 这第五刀明确不包含什么

为了保证第五刀足够小，这一轮应明确排除下面这些内容：

- 完整 acceptance / ack 条件集合
- 完整 acceptance / ack rule table
- 最终 acceptance / ack result schema
- 最终 downstream handoff protocol
- 完整 downstream consumption 流程
- `recover` 真正收口
- `resume` 真正续接
- `hydrate` 真正灌回逻辑
- 完整 recover 结果或完整 resume 结果
- replay window / batch / cursor policy 定稿
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第五刀只做：

- acceptance / ack 这份更具体结果先正式站住
- 这份结果外面最小可交接的壳先站住

不做“下游动作已经完整跑通”的下一层。

## 7. 为什么这个切片适合作为第五刀

这个切片适合作为第五刀，主要有六个原因。

### 7.1 它正好补上第四刀之后最明显的缺口

第四刀已经证明：

- `recognition` 作为正式边界可以独立存在
- `recognition result` 作为最小结果邻域可以独立存在

但“宿主最终接受/确认后留下什么更具体结果”“这个结果怎样最小交给下游”还没站住。  
第五刀正好补这个缺口，不需要回头改写第四刀。

### 7.2 它先把 `recognition result` 与 `acceptance / ack result` 分开

如果第五刀不先补这一步，后面很容易继续出现：

- `recognition result` 直接冒充最终可交接结果
- `acceptance / ack result` 没有独立落脚点
- 第六刀只能回头重新拆层

第五刀先把这两层分开，能最快止住这类混写。

### 7.3 它先把“更具体结果”与“下游动作”分开

如果 `acceptance / ack result` 一成立，就直接把：

- 结果本体
- handoff 邻域
- `recover / resume` 动作

混成一层，后面很容易出现：

- 结果壳不存在，只剩动作出口
- 第六刀没有自然切入点
- `hydrate`、`resume` 被提前拉进 phase_1 小切片

第五刀先把结果层与极小交接层分开，后续动作层才有稳定入口。

### 7.4 它比直接进入 `recover / resume` 更稳

`recover / resume` 已经是更下游的动作层。  
如果第五刀直接跳过去，很容易把：

- 完整恢复结果
- 完整续接结果
- 甚至 `hydrate` 灌回

一起带进来。先把 acceptance 后结果与最小 handoff 邻域站住，更符合“小切片继续推进”的节奏。

### 7.5 它与当前落位图完全一致

实现落位图已经把这一层提示成：

- `accepted-result handoff surface`
- `ack result carrier`
- `downstream result adapter`

这说明第五刀最适合做“交接壳站住”，而不是做“完整动作实现完成”。

### 7.6 它会让第六刀拥有非常自然的落点

一旦第五刀完成，后面就不必再争论：

- `acceptance / ack result` 到底是不是独立层
- 下游最小交接面到底有没有成立

第六刀就可以更自然地只补“谁先接这份结果、以什么最小消费邻域接住”，而不是回头重新拆第五刀。

## 8. 做完第五刀后，第六刀最自然接到哪里

如果第五刀完成，下一刀最自然的方向不是回头重写第四刀，也不是直接把 `hydrate` 或完整 `resume` 打通，而是继续顺着这条链往下接：

- `acceptance / ack result`
- 极小 downstream handoff / consumption 邻域
- 更明确的下游最小消费挂点

白话讲，第六刀最自然要回答的问题会变成：

- 这份已经被接受/确认的更具体结果，最小应先由谁接住
- 这个“谁来接”的消费挂点怎样站住，而不把完整 `recover / resume` 一起实现

但第六刀此时仍然不必做成：

- 完整 `recover` 结果
- 完整 `resume` 结果
- 完整 `hydrate` 灌回
- 最终下游 adapter / protocol 定稿

也就是说，第五刀做完之后，第六刀最自然是接到**`acceptance / ack result` 之后更明确的下游最小消费挂点**，而不是把后半条恢复链一口气写完。

## 9. 一个很小的第五刀边界图

```text
第四刀终点
  recognition 已是最小正式边界
  recognition result 已是最小结果邻域

第五刀要补
  acceptance / ack result 最小正式邻域成立
  最小 downstream handoff / consumption 邻域成立
  当前桥接层开始消费这组更窄邻域

第五刀不补
  完整 acceptance / ack 条件与 rule table
  完整 recover / resume / hydrate
  最终 schema / 最终 protocol / 最终目录树
```

## 10. 最终收敛口径

第五刀可以收敛成下面这句施工口径：

- 当 `acceptance / ack result` 已经作为 `recognition result` 之后的独立最小正式邻域成立，这个结果外侧的最小 downstream handoff / downstream consumption 邻域也已经成立，且当前桥接层已经消费这组更窄邻域而没有越界吞掉 `recover`、`hydrate`、`resume` 与最终协议定稿问题域时，这一刀就是合格的第五实施切片

如果还停留在“`recognition result` 直接冒充下游交付面”“acceptance 之后没有独立结果层”“一做 handoff 就直接偷跑完整 recover / resume”，都不应算第五刀。
