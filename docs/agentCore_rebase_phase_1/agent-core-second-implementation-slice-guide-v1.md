# agentCore 第二实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第二实施切片指南**。

它只回答一类问题：

- 如果第一刀已经完成，第二轮最小实现应先接哪一段
- 这一段的边界应该收多窄，才不会把后面正式结果层和承认层一起提前做掉
- 做完这一刀之后，第三刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第一刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终代码目录树设计稿

因此，后续真实实现仍应以现有正式 baseline 为准；本文只负责把“第一刀做完之后，第二刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第一刀之后

第一刀已经把下面三层壳先拆出来了：

- `material loader shell`
- `journal replay pipeline shell`
- `recovery coordinator shell`

第一刀解决的是“恢复入口三段式骨架先站住”，不是“replay 之后到底交出什么，以及位置推进怎么判断”。

所以第一刀完成后，最自然冒出来的问题就只剩两类：

- replay 不再只是一个占位过程后，它到底要向下游交出什么最小结果壳
- recover 拿到 replay 之后，怎样先做一层很窄的位置推进判断，而不是立刻跳去 `recognition`、`acceptance / ack result`、`hydrate / resume`

白话讲，第一刀已经把“管道”搭起来了；第二刀最自然就是把**replay 出口**和**推进判断入口**接起来。  
如果这一步不先补，后面无论是 `recognition` 还是 `hydrate / resume`，都会缺一个稳定的桥接层。

## 3. 当前建议的第二刀是什么

### 3.1 切片名称

建议把第二刀收敛成：

**`journal replay result` 最小结果桥 + `cursor advancement` 最小判定壳**

### 3.2 这第二刀的最小组合

这一刀建议只包含下面三件事：

1. 给 `journal replay pipeline shell` 接上一个最小 `journal replay result` 结果壳
2. 在 replay result 的下游接一个最小 `cursor advancement` 判定壳
3. 让 `recovery coordinator shell` 消费“replay result + advancement 最小判断信号”，而不是继续直接碰 replay 内部过程

它对应的最小主线可以先压成：

```text
replay pipeline shell
  -> journal replay result 最小结果壳
  -> cursor advancement 最小判定壳
  -> recovery coordinator 消费最小桥接结果
```

这里的关键不是把位置推进协议做完，而是先把：

- replay 过程
- replay 产物
- 推进判定

这三者真实拆开，并用一个最小桥接面连起来。

## 4. 这第二刀包含什么

第二刀建议只包含下面这些内容。

### 4.1 `journal replay result` 最小结果桥

它只负责一件事：

- 把第一刀里的 replay 占位结果，收敛成一个**可交给 recover 继续消费的最小 replay result 壳**

第二刀里，它应该做到：

- 明确 `journal replay result` 是 replay 之后留下的结果壳，不再只是“pipeline 跑过了”这一类占位信号
- 让 `recovery coordinator` 消费 replay result，而不是回头偷看 replay 内部过程
- 保持结果壳足够小，只表达“replay 后留下了哪些最小可消费结果面”

第二刀里，它不需要做到：

- 最终 replay result schema 定稿
- 最终事件枚举、batch 枚举或 serialization 定稿
- 完整 replay rule table

### 4.2 `cursor advancement` 最小判定壳

它只负责一件事：

- 围绕 replay result 的邻域，先形成一个**最小位置推进判定入口**

第二刀里，它应该做到：

- 明确 `cursor advancement` 是 replay 之后的窄层判断，不等于 replay 整体
- 能基于 replay result 和相邻 cursor 材料，产出最小“是否形成推进”的判断信号或等价占位结果
- 让推进判断成为独立壳，而不是被塞回 replay pipeline 或 `recover` 主体

第二刀里，它不需要做到：

- 最终 advancement algorithm 定稿
- 最终推进规则表、幂等/去重/冲突合并细则
- 最终 `cursor advancement result` schema 定稿

### 4.3 `recovery coordinator` 的最小桥接消费

它只负责一件事：

- 在第二刀里，把 `replay result` 与 `cursor advancement` 的最小输出接起来，形成一个仍然很薄的 recover 下游消费面

第二刀里，它应该做到：

- 不再只消费“replay 跑过了”这种纯占位信号
- 改为消费“replay result + advancement 最小判断”
- 继续保持协调角色，不抢 replay result builder 或 advancement evaluator 的职责

第二刀里，它不需要做到：

- 真实 `hydrate`
- 真实 `resume`
- 完整 recover result 收口

## 5. 这第二刀明确不包含什么

为了保证第二刀足够小，这一轮应明确排除下面这些内容：

- `cursor advancement result` 的正式结果层定稿
- `cursor advancement recognition` 的正式承认边界
- `cursor advancement recognition result`
- `acceptance / ack result`
- `hydrate` 真正灌回逻辑
- `resume` 真正续接逻辑
- `reconciliation` 分类表、优先级表、建议动作表
- 最终 replay result schema
- 最终 advancement schema
- 最终 TypeScript 目录树、类名、枚举名、JSON 字段名

一句话说，第二刀只做：

- replay 之后先交出什么
- 这份结果旁边先怎样做最小推进判断

不做“推进结果如何正式承认并继续交付”的后半段。

## 6. 为什么这个切片适合作为第二刀

这个切片适合作为第二刀，主要有六个原因。

### 6.1 它正好承接第一刀留下的空位

第一刀已经有 replay 入口壳，但 replay 出口还只是占位。  
第二刀正好把“入口壳已经有了，出口壳该是什么”补上，不需要回头重写第一刀。

### 6.2 它仍然停在 replay 邻域，没有跳太远

这一步仍然围绕：

- replay process
- replay result
- cursor advancement

还没有跳去：

- recognition
- acceptance
- hydrate
- resume

所以它比直接做后半段更稳，也更符合“小切片继续推进”的节奏。

### 6.3 它能最快验证“过程层”和“结果层”是否真的分开

如果第二刀做完后仍然出现下面这些情况：

- `replay pipeline` 自己直接包办推进判定
- `recover` 自己去翻 replay 过程细节
- replay result 只是换了个文件名，本质还是过程内部态

那就说明对象边界还没有真正落地。第二刀很适合尽早暴露这类混写。

### 6.4 它能先把位置推进问题从 replay 总体里切出来

`cursor advancement` 是第一刀之后最自然、也最容易被顺手糊回 replay 里的部分。  
第二刀先把它单独立壳，后面做结果层和承认层时才不会继续缠在 replay 里。

### 6.5 它不要求提前定义最终协议

这一刀只需要最小桥接面，不需要提前定：

- 最终 replay result schema
- 最终 advancement result schema
- recognition rule table
- acceptance / ack contract

这很符合当前 phase 1 “先固化边界，再逐层收紧细则”的状态。

### 6.6 它做完后，第三刀挂点会非常清楚

只要第二刀成立，下一步自然就不再是“要不要 replay result”，而会变成：

- advancement 之后留下什么结果
- 这些结果何时跨过 recognition 边界

也就是第三刀的挂点会自动收敛。

## 7. 这第二刀依赖哪些上位文档

这份第二实施切片指南，建议直接依赖下面这些文档：

- `README.md`
- `agent-core-first-implementation-slice-guide-v1.md`
- `agent-core-first-implementation-slice-done-checklist-v1.md`
- `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`
- `agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md`
- `agent-core-journal-replay-formal-baseline-v1.md`
- `agent-core-journal-replay-result-formal-baseline-v1.md`
- `agent-core-cursor-advancement-formal-baseline-v1.md`
- `agent-core-recovery-chain-structure-map-v1.md`
- `agent-core-recovery-chain-implementation-landing-map-v1.md`

这些文档分别提供：

- phase 入口
- 第一刀的收口位置
- 第一刀 done 之后的进入条件
- recover 动作层边界
- journal / cursor 邻近材料边界
- replay 过程边界
- replay 结果边界
- 位置推进问题域边界
- 恢复链路结构总图
- 当前实现落位导航

## 8. 这刀做完后，第三刀自然接到哪里

第二刀做完后，第三刀最自然的延伸不是直接去做 `hydrate / resume`，也不是一下子把所有后半段结果层全铺开。

更自然的第三刀是先接：

**`cursor advancement result` 邻域，再进入 `recognition` 邻域**

原因很简单：

- 第二刀已经回答了“replay 之后交出什么”和“是否形成推进”
- 下一步最自然的问题就是“推进之后留下什么可继续消费的结果”
- 再下一步才是“这些推进结果何时算被正式承认”

所以更自然的第三刀主线是：

```text
journal replay result
  -> cursor advancement
  -> cursor advancement result
  -> recognition 入口
```

如果仍然坚持切得非常小，那么第三刀甚至可以先只收紧：

- `cursor advancement result`

把 `recognition` 留到下一轮再做深。

## 9. 一个很小的切片结构图

下面这张图只表达第二刀的边界，不表达最终目录树。

```text
[第一刀已完成]

recover 入口
  -> recovery coordinator shell
       -> material loader shell
       -> replay pipeline shell

[第二刀包含]

replay pipeline shell
  -> journal replay result 最小结果桥
       -> cursor advancement 最小判定壳
            -> recovery coordinator 消费最小桥接信号

[第二刀不包含]

  X cursor advancement result 正式结果层
  X recognition / recognition result
  X acceptance / ack result
  X hydrate 真正灌回
  X resume 真正续接
  X reconciliation 规则表
  X 最终 schema / 最终目录树
```

如果再压缩成一句实施口令，可以记成：

```text
先把 replay 出口做成最小结果壳，
再把 cursor advancement 接成独立窄桥，
先不要把 recognition 和 hydrate / resume 一起拉进来。
```

## 10. 结论

当前恢复链路在第一刀之后，最适合作为第二实施切片的，是：

**`journal replay result` 最小结果桥 + `cursor advancement` 最小判定壳**

它足够小，足够贴着第一刀留下的自然空位，也足够能为第三刀的结果层与承认层留下清晰挂点。

它的目标不是“把 replay 后半段全部做完”，而是先把：

- replay 产物
- 位置推进判断
- recover 最小桥接消费

这三者真实拆开。
