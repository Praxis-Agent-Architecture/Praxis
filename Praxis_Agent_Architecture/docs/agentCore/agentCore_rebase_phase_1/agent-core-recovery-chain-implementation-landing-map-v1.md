# agentCore 恢复链路实现落位图 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 内部的一份**实现落位图 / 落地导航文档**。

它只回答一类问题：

- 当前已经写好的恢复链路文档，后续真实编码时大致会落到哪些实现关注面
- 阅读文档时，怎样把“文档结构”转换成“代码结构理解”
- 真正开工时，哪些地方已经适合先搭壳，哪些地方还应该等更多规则表或 schema 文档

本文**不是**：

- 新的正式 baseline
- 对已有 baseline 的覆盖版
- 最终 TypeScript 文件树定稿
- 新对象定义文

因此，后续实现应继续以各份正式 baseline 为准；本文只作为“从文档走向实现”的导航图使用。

## 2. 当前恢复链路已经有哪些文档组

当前 `agentCore_rebase_phase_1` 里，恢复链路已经可以稳定分成下面几组：

| 文档组 | 当前文档 | 当前作用 |
| --- | --- | --- |
| phase 导航入口 | `README.md` | 说明这一批文档的 phase 定位与统一读取入口 |
| 动作层 | `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md` | 冻结 `resume / recover / hydrate` 的动作边界 |
| 材料层 | `agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md` | 冻结 `checkpoint / snapshot` 作为恢复材料层的定位 |
| 材料细化层 | `agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md` | 把 `journal / receipt / cursor / reconciliation` 拆成相邻但不混写的问题域 |
| replay 链 | `agent-core-journal-replay-formal-baseline-v1.md`、`agent-core-journal-replay-result-formal-baseline-v1.md` | 冻结 `journal` 如何被消费，以及消费后留下什么结果壳 |
| cursor 链 | `agent-core-cursor-advancement-formal-baseline-v1.md`、`agent-core-cursor-advancement-result-formal-baseline-v1.md` | 冻结位置推进问题域，以及推进之后留下的结果壳 |
| recognition 链 | `agent-core-cursor-advancement-recognition-formal-baseline-v1.md`、`agent-core-cursor-advancement-recognition-result-formal-baseline-v1.md` | 冻结推进结果何时、为何被承认，以及承认后结果壳 |
| acceptance / ack 结果层 | `agent-core-acceptance-ack-result-formal-baseline-v1.md` | 冻结下游接受 / 确认之后继续交付的更窄结果产物 |
| 结构导航页 | `agent-core-recovery-chain-structure-map-v1.md` | 把恢复链路基线重新收拢成结构地图 |

这意味着当前恢复链路的 baseline 已经足够支撑“实现关注面分层”，但还没有推进到“最终字段和最终算法全部定稿”。

## 3. 文档组到实现关注面的落位映射

下面这张表只做“实现关注点 / 可能模块落点”导航，不做最终目录和最终命名硬规范。

| 文档组 | 更偏什么 | 后续实现时优先关注什么 | 可能的模块 / 子系统落点 |
| --- | --- | --- | --- |
| 动作层 | 恢复动作边界 | 谁负责串起 `resume / recover / hydrate`，谁负责把结果交给后续运行态 | `runtime orchestration`、`recovery coordinator`、`runtime recovery facade` |
| 材料层 | 恢复输入材料 | 恢复时需要读取哪些材料、材料怎样抽象成稳定输入面 | `checkpoint store`、`snapshot material interfaces`、`recovery material loader` |
| 材料细化层 | 材料内部邻接问题域 | `journal / receipt / cursor / reconciliation` 分别由谁读、谁比较、谁汇总差异 | `journal reader`、`receipt carrier`、`cursor tracker`、`reconciliation surface` |
| replay 链 | 材料消费过程 | `journal` 怎样进入 replay，replay 怎样生成可继续消费的结构化结果 | `replay interpreter`、`replay pipeline`、`replay result builder` |
| cursor 链 | 位置推进与推进结果 | 如何判断“是否推进”“推进到哪”“推进结果怎样沉淀” | `cursor tracker`、`advancement evaluator`、`advancement result builder` |
| recognition 链 | 推进承认边界 | 哪些推进结果只是线索，哪些已经跨过承认边界 | `recognition boundary evaluator`、`recognition policy surface`、`recognition result builder` |
| acceptance / ack 结果层 | 下游接受 / 确认结果 | 哪些结果已经可以交给后续 runtime 或下游 delivery 消费 | `accepted-result handoff surface`、`ack result carrier`、`downstream result adapter` |
| 结构导航页 | 结构回收与阅读顺序 | 后续编码前先对齐整体层次，不把过程、材料、结果壳写混 | 实现前阅读入口，不直接落成单独 runtime 模块 |

可以把这张表理解成一句话：

- 动作层更像“总调度”
- 材料层更像“输入面”
- replay / cursor / recognition 更像“中间解释与判定链”
- acceptance / ack result 更像“下游交接面”

## 4. 文档层与实现层并排对照图

下面这张图只表达“文档层”和“实现层关注点”的对照关系，不表达最终代码目录结构。

```text
文档层                                   实现层关注点
---------------------------------------------------------------------------
README                                  phase 入口 / recovery 阅读入口

resume / recover / hydrate              runtime orchestration
                                        recovery coordinator
                                        hydrate / resume handoff

checkpoint / snapshot                   checkpoint store
                                        snapshot material interfaces
                                        recovery material loader

journal / receipt / cursor /            journal reader
reconciliation                          receipt carrier
                                        cursor tracker
                                        reconciliation surface

journal replay                          replay interpreter
                                        replay pipeline

journal replay result                   replay result builder
                                        replay result contract

cursor advancement                      advancement evaluator
                                        advancement decision surface

cursor advancement result               advancement result builder
                                        cursor advancement carrier

cursor advancement recognition          recognition boundary evaluator
                                        recognition policy surface

cursor advancement recognition result   recognition result builder
                                        recognized-result carrier

acceptance / ack result                 accepted-result handoff surface
                                        downstream result adapter
                                        ack result carrier
```

这里最重要的实现理解是：

- 文档里写“材料”，实现里就优先想到“读取面 / 输入接口”
- 文档里写“过程问题域”，实现里就优先想到“解释器 / 判定器 / 协调器”
- 文档里写“result”，实现里就优先想到“结果壳 / handoff contract / builder”

不要把它们提前硬写成最终文件树，否则很容易把当前导航文档误用成目录设计定稿。

## 5. 当前适合先开始编码的部分

下面这些位置，已经比较适合开始做第一轮真实编码或最小壳实现。

### 5.1 适合先开的壳

- `recovery coordinator` 壳
  - 用来串联 `recover -> hydrate -> resume` 的大动作边界
- `checkpoint / snapshot` 读取接口壳
  - 用来稳定“材料输入面”，先把读取和解释分开
- `replay pipeline` 壳
  - 用来把 `journal` 消费过程与 `journal replay result` 产物层分开
- `cursor advancement` 判定壳
  - 用来先隔离“是否推进 / 推进到哪”这类问题
- `recognition boundary` 判定壳
  - 用来先隔离“推进结果何时算被承认”
- `accepted-result handoff` 交接壳
  - 用来先留住“被接受 / 确认之后交给谁继续消费”

### 5.2 为什么这些已经适合动手

原因不是“细节全定了”，而是：

- 边界已经在 baseline 里拆开了
- 过程层与结果层已经分开了
- 材料层与动作层已经分开了
- 承认边界与最终接受边界已经分开了

这足够支持先搭分层骨架，避免后面把所有恢复逻辑糊在一个函数或一个 runtime 对象里。

## 6. 当前还不适合硬写死的部分

下面这些位置，最好等更多规则表、schema 文档或补充基线后，再继续细化。

### 6.1 还需要更多规则文档的部分

- `journal replay` 的完整解释规则表
- `cursor advancement` 的精确推进判定规则
- `recognition` 的正式承认边界规则表
- `acceptance / ack result` 的正式最小 schema
- `reconciliation` 的差异分类、优先级和建议动作表

### 6.2 当前不建议提前钉死的内容

- 最终 TypeScript 文件树
- 最终类名 / 枚举名 / JSON 字段名
- 最终持久化 schema
- 最终跨子系统公共 contract 的字段全集

白话说，当前已经到了“可以把楼层和房间先隔开”的阶段，但还没到“每个抽屉尺寸和每张表字段都钉死”的阶段。

## 7. 后续真正开工时的推荐顺序

下面这个顺序是实现建议顺序，不是唯一顺序，也不是强制里程碑。

### 7.1 第一步：先实现总壳

先做：

1. `recovery coordinator`
2. `checkpoint / snapshot` 材料读取接口
3. `replay pipeline` 空壳和结果壳接口

这一层的目标是先把“大动作”“材料输入”“replay 处理”三个面拆开。

### 7.2 第二步：再实现桥

再做：

4. `cursor advancement evaluator`
5. `recognition boundary evaluator`
6. `accepted-result handoff surface`

这一层的目标是把“replay 之后的推进判断”“推进之后的承认”“承认之后的下游交接”连成一条实现桥。

### 7.3 第三步：最后补细规则

最后再补：

7. replay 规则表
8. advancement 规则表
9. recognition 规则表
10. acceptance / ack result schema
11. reconciliation 分类与动作建议表

这一层才适合开始把细规则和 schema 收紧。

## 8. 一条最小实现导航主线

如果后续编码的人只想先记一条最小主线，可以先按下面这条理解：

```text
材料读取
  -> replay 消费
  -> 位置推进判定
  -> 推进承认边界
  -> acceptance / ack handoff
  -> hydrate / resume 继续消费
```

这条主线的作用只有一个：

- 帮助实现时不把材料、过程、结果壳、下游交接混成同一层

## 9. 结论

当前恢复链路文档，已经足够支撑第一轮实现落位：

- 动作层可以开始做总协调壳
- 材料层可以开始做输入接口壳
- replay / cursor / recognition 可以开始做分层解释与判定壳
- acceptance / ack result 可以开始做下游交接面

但本文仍然只是**实现落位建议图**，不是最终目录结构定稿，也不替代任何现有 baseline。

真正写代码时，应继续把各份 baseline 当作正式边界来源，把本文当作“落地导航页”使用。
