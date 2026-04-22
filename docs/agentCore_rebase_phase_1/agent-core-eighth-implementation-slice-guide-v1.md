# agentCore 第八实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第八实施切片指南**。

它只回答一类问题：

- 如果第七刀已经完成，第八轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第九刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第七刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第七刀做完之后，第八刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第七刀之后

第七刀已经把下面这条最小桥接链立住了：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
```

第七刀解决的是：

- `downstream consumption entry` 外侧已经不再只是“未来会有 consumer”的描述
- entry 外面已经单独站住了 recovery-side 的第一个最小 consumer 壳
- 当前链路已经开始明确暴露“entry 现在先由哪一层壳接住”

但第七刀还刻意没有回答下面两类问题：

- 这个已经站住的 consumer 壳，**壳内侧最小到底从哪里真正开始消费**
- 这个“开始消费”的第一条接线，怎样单独站成一个更明确的 intake seam，而不直接偷跑成完整 `recover`、完整 `resume` 或完整 `hydrate`

白话讲，第七刀已经把“壳”站住了；第八刀最自然就是把“壳里面第一条最小接线”补出来。

如果这一步不先补，后面很容易出现两种混写：

- recovery-side consumer 壳长期停留在“已经有壳了”的抽象口号，没有壳内侧真正可落地的最小 intake seam
- 第九刀一上来就被迫把完整 `recover` 动作层一起吞掉，只因为前面没有单独站住壳内侧的第一条最小消费接线

所以，第八刀最自然不是回头重写第七刀，也不是直接把完整 `recover`、完整 `resume`、完整 `hydrate` 打通，而是先把 **consumer 壳内侧的第一条最小消费接线** 站住，并优先保持在 recover intake seam 这一层。

## 3. 第八刀依赖哪些上位文档 / 边界文档

第八刀不是凭空起一层，它依赖的上位文档 / 边界文档至少有下面五份。

### 3.1 `agent-core-seventh-implementation-slice-guide-v1.md`

这份文档负责给第八刀提供**第七刀的收口位置**。

它支撑第八刀的方式是：

- 明确第七刀只做到 `downstream consumption entry` 外侧的第一个最小 consumer 壳
- 明确第八刀最自然应继续收敛到这个 consumer 壳内侧的第一条最小消费接线
- 防止第八刀回头重写第七刀，或把壳外层与壳内层重新混回去

白话讲，没有这份指南，第八刀就容易失去“从哪里接上来”的施工起点。

### 3.2 `agent-core-seventh-implementation-slice-done-checklist-v1.md`

这份文档负责给第八刀提供**进入条件与完成前提**。

它支撑第八刀的方式是：

- 明确第七刀必须先让 consumer 壳、entry -> consumer 壳 的最小接线与当前链路最小暴露都真实成立
- 明确第八刀不是为了替第七刀补壳，而是建立在壳已经站稳的前提上继续往里接
- 防止第八刀一上来就补 intake seam，但第七刀其实还停留在 consumer 壳描述级别

白话讲，它决定第八刀不是“另起炉灶”，而是接在第七刀已经站稳的最小壳里面。

### 3.3 `agent-core-acceptance-ack-result-formal-baseline-v1.md`

这份文档负责给第八刀提供**核心上游对象边界来源**。

它支撑第八刀的方式是：

- 明确 `acceptance / ack result` 是宿主最终接受/确认后留下、可继续向下交给消费链路的更具体结果/产物问题域
- 明确第八刀站在 `acceptance / ack result` 之后，但不等于重新定义它
- 允许第八刀只冻结“consumer 壳内侧第一条最小 intake seam”，而不提前写死最终 recover schema、最终 protocol 或最终 adapter 细则

白话讲，第八刀里“壳里面最小从哪里开始接”，主要就靠这份 formal baseline 托住。

### 3.4 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第八刀提供**实现落位感**。

它支撑第八刀的方式是：

- 明确 `acceptance / ack result` 之后，外面已经有 recovery-side consumer 壳
- 提醒第八刀现在要往壳内侧收敛，而不是继续扩成完整 consumer 模块树
- 帮第八刀把焦点放在 `recover intake seam` 这一层极小入口面，而不是把完整恢复动作层一起带出来

白话讲，这份落位图的作用不是让第八刀定最终代码树，而是提醒“这一刀已经贴着 consumer 壳里面了，但还不能把完整恢复动作层一起带出来”。

### 3.5 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第八刀提供**链路位置感与越界控制**。

它支撑第八刀的方式是：

- 明确当前主链已经来到 `recognition result -> acceptance / ack result -> handoff -> entry -> consumer 壳` 的门口
- 明确 entry 之后确实还有壳内侧消费层，但当前不应直接偷换成完整 `recover / hydrate / resume`
- 防止第八刀把“consumer 壳已经存在”与“壳内侧最小消费接线已经完成”混成一层

白话讲，它帮助第八刀记住：这一步仍然是恢复链后段的 intake seam 层，不是终局动作层。

## 4. 当前建议的第八刀是什么

### 4.1 切片名称

建议把第八刀收敛成：

**`recovery-side 第一个最小 consumer 壳` 内侧的第一条最小消费接线**

也可以白话地叫成：

**最小 `recover intake seam`**

它不是完整 `recover`，也不是完整 `resume` 或完整 `hydrate`，只是比第七刀那个 consumer 壳更里一层、但仍然极小的“第一条真正接入线”。

### 4.2 这第八刀的最小组合

这一刀建议只包含下面三件事：

1. 把第七刀留下的 recovery-side 第一个最小 consumer 壳，继续向内接成一条**第一条最小消费接线**
2. 让当前链路结构上能看出：entry 外侧不是只站着一个壳，壳里面已经开始出现最小 intake seam，但还没有展开成完整 `recover`
3. 让后续第九刀可以从这个 intake seam 再往里接更明确的 recovery-side 最小消费路径，而不是回头重拆第七刀或第八刀

它对应的最小主线可以先压成：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
```

这里的关键不是把第八刀做成完整恢复动作或完整接入协议，而是先把：

- 第七刀已经站住的 consumer 壳
- consumer 壳内侧第一条最小消费接线
- 当前链路对这个 intake seam 的最小暴露

这三者真实拆开。

## 5. 这第八刀包含什么

第八刀建议只包含下面这些内容。

### 5.1 consumer 壳内侧第一条最小消费接线

它只负责一件事：

- 在 recovery-side 第一个最小 consumer 壳的内侧，单独站住一条“最小先从哪里真正开始消费”的 intake seam

第八刀里，它应该做到：

- 明确这个 seam 站在 consumer 壳与真正 `recover` 动作之间
- 明确它回答的是“这层壳里面，最小先从哪里被继续消费”
- 让当前实现结构上能看出：它是壳内窄层，不再只是壳外层的一个未来说明
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 intake seam 成立

第八刀里，它不需要做到：

- 最终 recover 动作收口
- 最终 resume 接续策略
- 最终 hydrate 灌回逻辑
- 最终 recover intake schema、serialization、DSL、JSON 字段名或枚举名

### 5.2 壳外 entry 到壳内 seam 的最小过渡

它只负责一件事：

- 让第七刀的 consumer 壳不再停留在“外侧已接住 entry”，而是最小地向内交出一条明确可挂接的 intake seam

第八刀里，它应该做到：

- 明确 `downstream consumption entry`、consumer 壳和壳内 intake seam 不等价
- 至少让实现结构上能看出：一旦 entry 被壳接住，壳里面会先留下一个最小 intake seam
- 允许当前过渡非常窄，只表达“这份 entry 现在先进入这层壳，再由壳内最小 seam 接手”
- 让后续第九刀有自然入口，而不是到时候只能回头改写第七刀或第八刀

第八刀里，它不需要做到：

- 完整 recover coordinator
- 完整 consumer 动作调度顺序
- 完整 recover 结果收口

### 5.3 当前链路对 intake seam 的最小暴露

它只负责一件事：

- 让当前桥接链从“存在 recovery-side consumer 壳”前移到“存在 consumer 壳内侧的第一条最小消费接线”

第八刀里，它应该做到：

- 不再只证明 entry 外侧已经有壳
- 改为至少能看出壳内侧已经开始出现最小 intake seam
- 继续保持 intake seam 角色，不顺手吞掉 `recover`、`resume`、`hydrate` 的内部动作层

第八刀里，它不需要做到：

- 完整 `recover` 真正消费实现
- 完整 `resume` 真正续接
- 完整 `hydrate` 真正灌回

## 6. 这第八刀明确不包含什么

为了保证第八刀足够小，这一轮应明确排除下面这些内容：

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

一句话说，第八刀只做：

- consumer 壳内侧第一条最小消费接线先站住

不做“完整 recover 动作已经展开”的下一层。

## 7. 为什么这个切片适合作为第八刀

这个切片适合作为第八刀，主要有六个原因。

### 7.1 它正好补上第七刀之后最明显的缺口

第七刀已经证明：

- `downstream consumption entry` 外侧可以独立站住 consumer 壳
- entry 和 consumer 壳可以分层

但“这个壳里面最小到底从哪里开始接”还没站住。  
第八刀正好补这个缺口，不需要回头改写第七刀。

### 7.2 它先把 consumer 壳与壳内 intake seam 分开

如果第八刀不先补这一步，后面很容易继续出现：

- consumer 壳长期冒充真正 intake seam
- 壳内侧没有单独的最小接线面
- 第九刀只能回头重新拆层

第八刀先把这两层分开，能最快止住这类混写。

### 7.3 它把“壳已经存在”与“壳内已经能消费”分成两步

第七刀证明的是：

- 壳外层已经接住 `downstream consumption entry`

第八刀要证明的是：

- 壳内层已经出现最小消费接线

这两个目标相邻，但不是同一件事。  
把它们拆开，后面的恢复动作就更容易逐层落地。

### 7.4 它够小，但又足够向里推进

如果第八刀直接跳到完整 recover，就会把 phase_1 小切片边界冲破。  
如果第八刀只重复第七刀，就会失去向里收敛的意义。

把第八刀定成“壳内第一条最小消费接线”，刚好卡在中间。

### 7.5 它能为第九刀留出更清晰的起点

第九刀最自然要接的，不应该还是 consumer 壳本身，而应是：

- 更明确的 recovery-side 最小消费路径
- 或更接近 recover 动作但仍未完整展开的一小层

先站住壳内第一条 seam，第九刀才知道从哪里继续往里推。

### 7.6 它仍然不会越界成完整恢复动作

第八刀只是在壳里面先留一个极窄 seam。  
它并不回答：

- 怎么完整恢复
- 怎么完整续接
- 怎么完整灌回
- 最终 schema 怎么定
- 最终 protocol 怎么定

所以它仍然是一个小切片，不会变成最终方案。

## 8. 第八刀完成后的第九刀最自然接到哪里

第八刀完成后，第九刀最自然不要回头补壳，而应继续往里接到下面这一类对象：

- 更明确的 recovery-side 最小消费路径
- 或更具体的 `recover` 前导 intake 面
- 或壳内 seam 之后的下一小层 recovery 入口

白话讲，第九刀应该接在“壳内第一条最小消费接线已经站住”这个事实之后，继续向真正 recover 动作靠近，但仍然不要直接跳到完整 recover / resume / hydrate。

如果第九刀再往里一步，也应该只再多压一小层，而不是一次把完整动作层和最终协议一起端出来。

## 9. 一个很小的 done / not-done 边界图

```text
done
  downstream consumption entry 外侧已站住 recovery-side 第一个最小 consumer 壳
  consumer 壳内侧已站住第一条最小消费接线 / 最小 recover intake seam
  当前链路已明确暴露“壳里面最小从哪里开始接”的 seam 面
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳与最小 seam，不是最终 schema / 最终 protocol / 最终 rule table 定稿
  完整 recover / resume / hydrate 尚未越界写入

not-done
  consumer 壳内侧的最小 seam 仍不存在，或只是壳外层的换名说法
  壳外 entry 到壳内 seam 仍没有最小接线
  当前链路仍只暴露 consumer 壳，不暴露壳内第一条接线
  只有命名，没有最小挂接
  为了“完整”提前把完整 recover 或后续恢复动作层一起写死
```

## 10. 最终判定口径

第八刀是否完成，可以收敛成下面这句验收口径：

- 当 `downstream consumption entry` 外侧的 recovery-side 第一个最小 consumer 壳已经成立，且该 consumer 壳内侧的第一条最小消费接线 / 最小 recover intake seam 已经成立，同时当前链路已经能够明确暴露“壳里面最小从哪里开始接”的 seam 面，而实现没有越界吞掉完整 consumer、完整 `recover`、完整 `resume`、完整 `hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 consumer 壳，没有壳内 seam”“consumer 壳内 seam 只是 future `recover` 的换名说法”“一做壳内 seam 就直接偷跑完整 `recover` / `resume` / `hydrate`”，都不应算完成。
