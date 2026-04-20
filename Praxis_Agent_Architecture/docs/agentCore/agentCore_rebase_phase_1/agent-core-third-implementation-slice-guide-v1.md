# agentCore 第三实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第三实施切片指南**。

它只回答一类问题：

- 如果第二刀已经完成，第三轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的正式承认层和 acceptance 链一起提前做掉
- 做完这一刀之后，第四刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第二刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终代码目录树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第二刀做完之后，第三刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第二刀之后

第二刀已经把下面这条最小桥接链立住了：

```text
replay pipeline shell
  -> journal replay result 最小结果桥
  -> cursor advancement 最小判定壳
  -> recovery coordinator 消费最小桥接结果
```

第二刀解决的是：

- replay 出口不再只是过程占位
- `cursor advancement` 已经从 replay 与 recover 主体里单独立壳
- `recovery coordinator` 开始消费最小推进判断，而不是偷看内部过程

但第二刀还刻意没有回答下面两个问题：

- 推进判断之后，到底留下什么**最小可继续消费的结果层**
- 这份结果层到哪里开始接入 `recognition`，但又不把整层 recognition 提前做深

白话讲，第二刀已经把“有没有推进”的桥接壳立住了；第三刀最自然就是把“推进之后留下什么给下游继续拿”补上，并给 recognition 留一个很窄的挂点。

如果这一步不先补，后面无论是：

- `cursor advancement recognition`
- `cursor advancement recognition result`
- `acceptance / ack result`

都会缺一个稳定的结果层落脚点。

## 3. 当前建议的第三刀是什么

### 3.1 切片名称

建议把第三刀收敛成：

**`cursor advancement result` 最小结果层 + `recognition` 最小挂点**

### 3.2 这第三刀的最小组合

这一刀建议只包含下面三件事：

1. 给第二刀的 `cursor advancement` 最小判定壳接上一个最小 `cursor advancement result` 结果层
2. 在该结果层下游接一个极窄的 `recognition` 入口挂点
3. 让 `recovery coordinator` 或等价上位协调面开始消费“advancement result 邻域”，而不是只停在“是否推进”的判断信号

它对应的最小主线可以先压成：

```text
journal replay result
  -> cursor advancement
  -> cursor advancement result 最小结果层
  -> recognition 最小挂点
  -> recovery coordinator 消费更稳定的结果邻域
```

这里的关键不是把 recognition 做完，而是先把：

- 推进判断
- 推进后留下的结果
- 结果进入 recognition 的入口边界

这三者真实拆开，并用一个最小结果桥接面连起来。

## 4. 这第三刀包含什么

第三刀建议只包含下面这些内容。

### 4.1 `cursor advancement result` 最小结果层

它只负责一件事：

- 把第二刀的“最小推进判断”收敛成一个**可被下游继续消费的最小结果层**

第三刀里，它应该做到：

- 明确 `cursor advancement result` 是 `cursor advancement` 之后留下的结果壳，不再只是布尔判断、状态信号或临时占位
- 让上位协调层消费 result 邻域，而不是继续只消费“是否推进”的单点信号
- 结果层保持足够小，只表达“这次推进判断后留下了哪些最小可继续消费的结果面”

第三刀里，它不需要做到：

- 最终 `cursor advancement result` schema 定稿
- 最终 result 字段全集、枚举全集或 serialization 定稿
- 最终冲突合并、去重、幂等细则定稿

### 4.2 `recognition` 最小挂点

它只负责一件事：

- 在 `cursor advancement result` 下游形成一个**可插入 recognition 的最小入口**

第三刀里，它应该做到：

- 明确 `recognition` 站在 `cursor advancement result` 与下游继续消费动作之间
- 至少让实现结构上能看出：未来 recognition 是消费 advancement result 的独立窄层，而不是被 advancement result 本身吞掉
- 允许当前 recognition 只是极窄 stub、placeholder 或单一路径入口

第三刀里，它不需要做到：

- 完整 recognition rule table
- 完整 acceptance / ack 条件集合
- `cursor advancement recognition result` 正式结果层

### 4.3 上位协调面的最小消费改口径

它只负责一件事：

- 让上位协调面从“消费 advancement 最小判断”前移到“消费 advancement result 邻域”，并保留 recognition 插口

第三刀里，它应该做到：

- 不再只依赖“是否推进”的最小判断信号
- 改为消费“advancement result + recognition 最小挂点”这组更稳定的结果邻域
- 继续保持协调角色，不顺手吞掉 recognition 细则

第三刀里，它不需要做到：

- 正式 recover result 收口
- 真正 `hydrate`
- 真正 `resume`

## 5. 这第三刀明确不包含什么

为了保证第三刀足够小，这一轮应明确排除下面这些内容：

- `cursor advancement recognition` 的完整规则层
- `cursor advancement recognition result`
- `acceptance / ack result`
- `hydrate` 真正灌回逻辑
- `resume` 真正续接逻辑
- replay window / batch / cursor policy 的定稿
- 最终 `cursor advancement result` schema
- 最终 recognition schema
- 最终 TypeScript 目录树、类名、枚举名、JSON 字段名
- 新 runtime 协议定稿

一句话说，第三刀只做：

- 推进之后先留下什么最小结果层
- 这个结果层在哪里接 recognition 入口

不做“结果如何被完整承认并最终交付”的后半段。

## 6. 为什么这个切片适合作为第三刀

这个切片适合作为第三刀，主要有六个原因。

### 6.1 它正好补上第二刀之后最明显的缺口

第二刀已经证明：

- replay result 可以进入 advancement
- advancement 可以给 recover 一个最小判断

但“推进判断之后留下什么结果”还没单独立层。  
第三刀正好补这个缺口，不需要回头重写第二刀。

### 6.2 它先把“判断”和“结果”分开，避免继续混写

如果第三刀不先做 result 层，后面很容易继续出现：

- advancement 自己既做判断又冒充最终结果
- recognition 直接盯着 advancement 过程，不经过结果层
- recover 继续只吃判断信号，导致下游边界一直站不稳

第三刀先立 result 层，能最快把这几层分开。

### 6.3 它比直接进入 recognition 全层更稳

`recognition` 本身已经是一层更窄、也更容易过早写死规则的边界。  
如果第三刀直接把 recognition 做深，很容易连：

- recognition rule table
- acceptance / ack 条件
- recognition result

一起拉进来。先做 result 层，再留 recognition 最小挂点，更符合“小切片继续推进”的节奏。

### 6.4 它仍然停在 replay 邻域与恢复桥接层之间，没有跳太远

这一步仍然围绕：

- `journal replay result`
- `cursor advancement`
- `cursor advancement result`
- `recognition` 入口

还没有跳去：

- `recognition result`
- `acceptance / ack result`
- `hydrate / resume`

所以边界可控，且更容易验收。

### 6.5 它不要求提前定义最终协议

这一刀只需要最小结果层和 recognition 挂点，不需要提前定：

- 最终 result schema
- 最终 recognition rule table
- 最终 acceptance / ack contract
- 最终 runtime 协议

这很符合当前 phase 1 “先固化对象边界，再逐层收紧细则”的状态。

### 6.6 它做完后，第四刀会自动收敛

只要第三刀成立，第四刀就不会再停留在“要不要有 result 层”这种问题上，而会自然收敛到：

- `recognition` 如何从挂点进入最小正式承认边界
- `recognition result` 如何作为更窄结果层落位

也就是第四刀的挂点会非常清楚。

## 7. 这第三刀依赖哪些上位文档

这份第三实施切片指南，建议直接依赖下面这些文档：

- `README.md`
- `agent-core-second-implementation-slice-guide-v1.md`
- `agent-core-second-implementation-slice-done-checklist-v1.md`
- `agent-core-journal-replay-result-formal-baseline-v1.md`
- `agent-core-cursor-advancement-formal-baseline-v1.md`
- `agent-core-cursor-advancement-result-formal-baseline-v1.md`
- `agent-core-cursor-advancement-recognition-formal-baseline-v1.md`
- `agent-core-recovery-chain-structure-map-v1.md`
- `agent-core-recovery-chain-implementation-landing-map-v1.md`

这些文档分别提供：

- phase 入口
- 第二刀的收口位置
- 第二刀 done 之后的进入条件
- replay 结果层边界
- advancement 问题域边界
- advancement result 结果层边界
- recognition 问题域边界
- 恢复链路结构总图
- 当前实现落位导航

## 8. 这刀做完后，第四刀自然接到哪里

第三刀做完后，第四刀最自然的延伸不是直接去做 `hydrate / resume`，也不是一下子把 acceptance 全铺开。

更自然的第四刀是先接：

**`cursor advancement recognition` 最小正式承认边界，再收紧到 `cursor advancement recognition result` 邻域**

原因很简单：

- 第三刀已经回答了“推进后留下什么结果”
- 也已经回答了“recognition 应该从哪里接入”
- 下一步最自然的问题就是“这份结果何时算被宿主正式承认，以及承认后留下什么更窄结果”

所以更自然的第四刀主线是：

```text
cursor advancement result
  -> recognition 最小正式边界
  -> cursor advancement recognition result
```

如果仍然坚持切得非常小，那么第四刀甚至可以先只收紧：

- `recognition` 最小正式边界

把 `recognition result` 留到再下一轮。

## 9. 一个很小的切片结构图

下面这张图只表达第三刀的边界，不表达最终目录树。

```text
[第二刀已完成]

journal replay result
  -> cursor advancement 最小判定壳
       -> recovery coordinator 消费最小判断

[第三刀包含]

journal replay result
  -> cursor advancement
       -> cursor advancement result 最小结果层
            -> recognition 最小挂点
                 -> recovery coordinator 消费更稳定的结果邻域

[第三刀不包含]

  X recognition 完整规则层
  X recognition result
  X acceptance / ack result
  X hydrate 真正灌回
  X resume 真正续接
  X 最终 schema / 最终 runtime 协议 / 最终目录树
```

如果再压缩成一句实施口令，可以记成：

```text
先把 advancement 后的结果层立住，
再给 recognition 留一个最小入口，
先不要把 recognition result 和 acceptance 链一起拉进来。
```

## 10. 结论

当前恢复链路在第二刀之后，最适合作为第三实施切片的，是：

**`cursor advancement result` 最小结果层 + `recognition` 最小挂点**

它足够小，足够贴着第二刀留下的自然空位，也足够能为第四刀的正式承认层留下清晰挂点。

它的目标不是“把推进后半段全部做完”，而是先把：

- 推进判断
- 推进结果
- recognition 入口

这三者真实拆开。
