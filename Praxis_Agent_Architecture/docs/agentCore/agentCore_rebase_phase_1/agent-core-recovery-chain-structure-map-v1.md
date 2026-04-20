# agentCore 恢复链路结构地图 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 内部的**恢复链路结构地图**。

它的职责只有两个：

- 把当前已经拆出的恢复链路文档，按层次重新收拢成一张可导航的结构图
- 给后续实现提供“先看什么、再接什么、哪些对象是上位、哪些对象是下钻”的结构导览

本文**不是**新的总规范，也**不替代**任何已经存在的正式基线文档。

因此，阅读和实现时应把本文当成：

- 导航页
- 结构回收页
- 读取顺序说明

而不应把它当成：

- 新的总 baseline
- 对已有 baseline 的覆盖版
- 一个继续下钻出来的新对象定义文

## 2. 当前恢复链路文档总览

当前 phase 里，与恢复链路直接相关的文档，已经可以分成下面几组。

| 层次 | 对象 | 文档 | 作用 |
| --- | --- | --- | --- |
| phase 导航入口 | phase 目录入口 | `README.md` | 说明这一批文档的 phase 定位与统一读取入口 |
| 动作层 | `resume / recover / hydrate` | `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md` | 冻结恢复链路三大动作的边界与分工 |
| 材料层 | `checkpoint / snapshot` | `agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md` | 冻结恢复材料层，不把材料直接混成恢复动作 |
| 材料细化层 | `journal / receipt / cursor / reconciliation` | `agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md` | 把材料层内部再拆开，明确事件残留、回执残留、位置残留、对齐问题域 |
| replay 链 | `journal replay` | `agent-core-journal-replay-formal-baseline-v1.md` | 冻结“如何消费 journal 材料”的过程问题域 |
| replay 链 | `journal replay result` | `agent-core-journal-replay-result-formal-baseline-v1.md` | 冻结 replay 完成后交给恢复链路的结果壳 |
| cursor 链 | `cursor advancement` | `agent-core-cursor-advancement-formal-baseline-v1.md` | 冻结位置是否推进、推进到哪里、推进怎样被承认的问题域 |
| cursor 链 | `cursor advancement result` | `agent-core-cursor-advancement-result-formal-baseline-v1.md` | 冻结位置推进之后留下的结果壳 |
| recognition 链 | `cursor advancement recognition` | `agent-core-cursor-advancement-recognition-formal-baseline-v1.md` | 冻结推进结果何时、为何被正式承认 |
| recognition 链 | `cursor advancement recognition result` | `agent-core-cursor-advancement-recognition-result-formal-baseline-v1.md` | 冻结承认之后真正留下的更窄结果壳 |
| acceptance / ack 结果层 | `acceptance / ack result` | `agent-core-acceptance-ack-result-formal-baseline-v1.md` | 冻结宿主最终接受/确认之后继续交给下游的更具体结果 |

## 3. 一张总图先看清

如果只想先建立全局感觉，可以先看下面这张主结构图：

```text
phase 入口
  README
    |
    v
动作层
  resume / recover / hydrate
    |
    v
材料层
  checkpoint / snapshot
    |
    v
材料细化层
  journal / receipt / cursor / reconciliation
    |
    +--> replay 链
    |      journal replay
    |        -> journal replay result
    |
    +--> cursor 链
    |      cursor advancement
    |        -> cursor advancement result
    |
    +--> recognition 链
    |      cursor advancement recognition
    |        -> cursor advancement recognition result
    |
    +--> acceptance / ack 结果层
           acceptance / ack result
```

这张图表达的不是唯一算法顺序，而是**文档结构上的继续下钻顺序**：

- 先把恢复动作层和材料层分开
- 再把材料层内部的对象继续拆细
- 然后把 replay、位置推进、推进承认、接受/确认结果依次切出

## 4. 按“对象类型”再看一遍

如果从实现视角看，更有用的是下面这张“对象类型分层图”。

```text
材料 / 残留层
  checkpoint / snapshot
  journal / receipt / cursor

过程 / 问题域层
  recover
  hydrate
  resume
  reconciliation
  journal replay
  cursor advancement
  cursor advancement recognition

结果 / 产物层
  journal replay result
  cursor advancement result
  cursor advancement recognition result
  acceptance / ack result

下游消费层
  recover / resume 的继续消费
  hydrate 对运行对象的灌回
  后续运行态重建与实现落地
```

这里最关键的结构判断是：

- `checkpoint / snapshot / journal / receipt / cursor` 更偏“留下了什么”
- `journal replay / cursor advancement / recognition / reconciliation` 更偏“怎么解释、怎么判断、怎么过边界”
- `... result` 更偏“经过某层判断后，最后留下来给下一层继续消费的东西”
- 最终真正进入实现时，下游消费方仍然是 `recover / resume / hydrate` 以及它们对运行对象的重建动作

## 5. 主链与侧链

当前恢复链路文档，并不是一条完全线性的单链；更准确地说，它是一条主链，加上一条侧向问题域。

### 5.1 主链

主链可以先理解成：

```text
恢复动作边界
  -> 恢复材料层
  -> 材料内部问题域
  -> journal replay
  -> journal replay result
  -> cursor advancement
  -> cursor advancement result
  -> cursor advancement recognition
  -> cursor advancement recognition result
  -> acceptance / ack result
```

这条主链的意义是：

- 先把“恢复靠什么材料”讲清
- 再把“材料怎样被消费”讲清
- 再把“位置推进怎样形成、怎样被承认、怎样沉淀成可继续消费的结果”讲清

### 5.2 侧链

`reconciliation` 当前更适合放在**侧向问题域**来看，而不是硬塞进主链线性顺序里。

原因很简单：

- 它不只是某一份材料
- 它也不只是某一个 replay 结果
- 它更像恢复之后、对齐之前或对齐过程中显影出来的差异问题域

所以当前更稳的结构理解是：

```text
checkpoint / snapshot / journal / receipt / cursor
  -> recover 读取、整理、比较
  -> reconciliation 暴露差异与对齐压力
  -> 再决定哪些结果可以继续交给 hydrate / resume
```

## 6. 推荐阅读顺序

如果后面的人是第一次接这个恢复链路，建议按下面顺序阅读。

### 6.1 建立总边界

先读：

1. `README.md`
2. `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`
3. `agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md`

这一段主要回答：

- 恢复链路在 phase 里处于什么位置
- 三大动作各自做什么
- 材料层为什么不能直接和动作层混写

### 6.2 建立材料内部视图

再读：

4. `agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md`

这一段主要回答：

- 材料层内部到底拆成了哪些子问题域
- 哪些是过程残留，哪些是完成回执，哪些是位置残留，哪些是恢复后的对齐问题

### 6.3 建立 replay 与推进主链

再读：

5. `agent-core-journal-replay-formal-baseline-v1.md`
6. `agent-core-journal-replay-result-formal-baseline-v1.md`
7. `agent-core-cursor-advancement-formal-baseline-v1.md`
8. `agent-core-cursor-advancement-result-formal-baseline-v1.md`

这一段主要回答：

- journal 材料怎样进入 replay
- replay 结束后到底留下什么
- 位置推进问题是怎样从 replay 里被单独切出来的

### 6.4 建立承认与确认层

最后读：

9. `agent-core-cursor-advancement-recognition-formal-baseline-v1.md`
10. `agent-core-cursor-advancement-recognition-result-formal-baseline-v1.md`
11. `agent-core-acceptance-ack-result-formal-baseline-v1.md`

这一段主要回答：

- 哪些推进结果只是线索
- 哪些推进结果已经跨过承认边界
- 哪些承认后结果最终会被宿主接受/确认并交给下游继续消费

## 7. 现在已经拆到什么程度

截至当前这一版，恢复链路已经至少拆到了下面这个粒度：

- 动作层已经与材料层分开
- 材料层已经与材料内部问题域分开
- `journal replay` 已经与 `journal` 本体分开
- `journal replay result` 已经与 `journal replay` 过程分开
- `cursor advancement` 已经与 `cursor` 本体分开
- `cursor advancement result` 已经与 `cursor advancement` 问题域分开
- `cursor advancement recognition` 已经从推进问题域中单独切出
- `cursor advancement recognition result` 已经从 recognition 问题域中单独切出
- `acceptance / ack result` 已经从 recognition result 之下继续切出

也就是说，这条链路当前已经不是“恢复”一个笼统大词，而是至少被拆成了：

- 材料是什么
- 材料如何被消费
- 位置推进如何成立
- 推进结果如何被承认
- 承认之后什么结果最终会被接受/确认

这对后续实现的价值很直接：

- 做材料建模时，不容易把材料层和动作层写混
- 做 replay / cursor 逻辑时，不容易把过程与结果壳写混
- 做恢复判定时，不容易把“看见推进”直接偷换成“已经被宿主承认”
- 做最终落地时，不容易把 recognition result 与 acceptance / ack result 混成一个层

## 8. 哪些边界已冻结，哪些细则还没冻结

这一批文档的共同特点很明确：**对象边界已经大量冻结，但算法、规则表、schema 还没有全部冻结。**

可以按组理解：

### 8.1 已冻结的，主要是结构边界

当前已经相对稳定的是：

- `resume / recover / hydrate` 的动作分工
- `checkpoint / snapshot` 作为恢复材料层的定位
- `journal / receipt / cursor / reconciliation` 作为不同问题域的分层
- `journal replay` 与 `journal replay result` 的过程/产物分层
- `cursor advancement`、`recognition`、`acceptance / ack` 这一串对象的层次分工

### 8.2 还没冻结的，主要是实现细则

当前仍明确未冻结的内容，按主题可压缩为：

- 恢复算法本身：完整 `recover` 算法、`hydrate` 对象图细节、`resume` 调度策略、重启顺序
- 材料表达细则：最终 `checkpoint / snapshot` schema、最终序列化格式、最终枚举、JSON 字段名
- replay 细则：最终 replay 算法、事件顺序规则、window / batch policy、去重/幂等/合并细则
- 推进与承认细则：最终 advancement algorithm、recognition rule table、acceptance / ack 条件集合
- 结果壳细则：各类 `... result` 的最终 schema、最终 result 枚举、最终 serialization / DSL

因此，当前文档系统给实现提供的不是“直接照着写字段表”，而是：

- 先知道每一层对象应该放在哪
- 再知道后续算法、规则表、schema 应该挂在哪一层继续细化

## 9. 对后续实现的直接用法

如果后面要开始真正落代码，这份结构地图最适合拿来做三件事：

- 先定位当前要实现的是材料层、过程层，还是结果层
- 先判断自己处理的是主链对象，还是 `reconciliation` 这类侧向问题域
- 先决定需要引用哪一层 baseline，而不是把整串恢复链路一起揉进一个实现对象里

可以把它理解成一张“实现前分拣图”：

```text
我要写的是材料读写？
  -> 先看 checkpoint / snapshot、journal / receipt / cursor

我要写的是 replay 或 cursor 推进？
  -> 先看 journal replay、journal replay result、cursor advancement、cursor advancement result

我要写的是承认 / 接受 / 确认边界？
  -> 先看 recognition、recognition result、acceptance / ack result

我要写的是完整恢复入口？
  -> 先回到 resume / recover / hydrate，再把下游对象按层拼起来
```

## 10. 结论

这份文档的作用，到这里可以压缩成一句话：

`agent-core-recovery-chain-structure-map-v1.md` 是当前 `agentCore_rebase_phase_1` 恢复链路的一张**导航图和结构图**，帮助后续实现快速识别上位文档、下钻文档、主链对象、侧链问题域，以及“边界已冻结”和“细则未冻结”的分界线。

它负责导览，不负责替代已有正式 baseline。
