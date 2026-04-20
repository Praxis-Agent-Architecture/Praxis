# agentCore 第一实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第一实施切片指南**。

它只回答一类问题：

- 如果现在真的开始写代码，第一轮最小实现切片应该先切哪一刀
- 这一刀的边界应该压到多小，才既能开工，又不会把后续正式边界提前写死
- 做完这一刀之后，下一刀自然应该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 最终实施计划总表
- 最终 roadmap
- 最终代码目录树设计稿

因此，后续真实实现仍应以现有正式 baseline 为准；本文只负责把当前恢复链路文档收敛成一个可执行的“第一刀建议”。

## 2. 为什么现在要先选一个最小切片，而不是一下子全做

当前 `agentCore_rebase_phase_1` 对恢复链路已经做了足够多的对象分层：

- `checkpoint / snapshot` 已经被稳定成材料层
- `journal replay` 已经被稳定成材料消费过程问题域
- `recover / hydrate / resume` 已经被稳定成动作层
- `cursor advancement`、`recognition`、`acceptance / ack result` 也已经继续往后拆开

但这些文档目前冻结的重点，仍然是**对象边界与关系**，不是最终算法、最终字段表或最终 schema。

这意味着如果一上来就想把整条恢复链路全部做完，很容易出现三类问题：

- 把材料层、过程层、动作层重新糊回一个大函数
- 为了让代码先跑起来，提前钉死还没正式冻结的字段和协议
- 还没验证“边界是否真的可编码”，就先把后半段复杂判断也一起拉进来

所以第一轮实现更适合先做一段**足够小、但能跑通最小调用骨架**的切片。它的价值不是“功能完成”，而是先验证当前文档边界能不能落成实现骨架。

## 3. 建议的第一实施切片

### 3.1 切片名称

建议把第一刀收敛成：

**恢复入口最小串接壳**

### 3.2 这第一刀的最小组合

这一刀建议只包含下面三个壳：

1. `checkpoint / snapshot material loader shell`
2. `journal replay pipeline shell`
3. `recovery coordinator shell`

白话讲，就是先把下面这条最小主线搭起来：

```text
recover 入口
  -> 读取恢复材料
  -> 把 journal 邻近材料交给 replay
  -> 把 replay 的占位结果交回 recover 总协调
```

这里的关键不是把 replay 算法做完，而是先让“材料入口”“replay 入口”“recover 总调度”三层真的分开存在。

### 3.3 为什么不是把 `hydrate / resume` 一起纳入第一刀

因为当前最需要先验证的，不是整条恢复链路的后半程，而是：

- 材料读取面能不能先独立出来
- replay 能不能作为独立过程壳存在，而不是藏进 recover 体内
- recover 能不能只做协调，而不是自己兼任材料解释器和 replay 执行器

如果这三层第一刀都没分开，后面再加 `hydrate / resume`，只会把混写进一步放大。

## 4. 这第一刀包含什么

第一刀建议只包含下面这些内容。

### 4.1 `material loader shell`

它只负责一件事：

- 形成恢复材料读取入口，把 `checkpoint / snapshot` 以及与其相邻的 `journal / cursor` 邻近材料整理成**可交给 recover / replay 继续消费的读取结果壳**

第一刀里，它应该做到：

- 明确这是材料入口层，不是恢复动作本身
- 允许先用占位读取结果或最小 mock 结果贯通
- 保留 `checkpoint / snapshot` 与 `journal / cursor` 的邻接关系，但不强行统一成最终 schema

第一刀里，它不需要做到：

- 最终持久化格式定稿
- 最终字段全集定稿
- 所有材料类型都能被完整读取

### 4.2 `journal replay pipeline shell`

它只负责一件事：

- 承接来自材料入口的 `journal` 邻近材料，形成一个独立的 replay 过程壳，并产出最小 replay 占位结果

第一刀里，它应该做到：

- 明确 replay 是单独的问题域，不直接藏在 recover 里
- 允许 replay 先只有空实现、占位实现或极窄 happy-path 实现
- 给后续 `journal replay result` 与 `cursor advancement` 留出插口

第一刀里，它不需要做到：

- 完整事件顺序规则
- 去重、幂等、窗口、批次等完整 replay 算法
- 正式 result schema 定稿

### 4.3 `recovery coordinator shell`

它只负责一件事：

- 站在 `recover` 动作层，串起“材料读取 -> replay 调用 -> 返回最小恢复基础占位结果”这条调用骨架

第一刀里，它应该做到：

- 明确 `recover` 是总协调层，而不是材料层或 replay 层
- 把 replay 与材料读取通过明确壳边界串起来
- 给后续 `hydrate` 或更完整 `recover result` 留出上位接入点

第一刀里，它不需要做到：

- 最终恢复算法
- 完整 reconciliation 判定
- 直接把结果灌回运行对象
- 继续推进 `resume`

## 5. 这第一刀明确不包含什么

为了保证切片足够小，第一刀应明确排除下面这些内容：

- `hydrate` 的真实灌回逻辑
- `resume` 的真实续接逻辑
- `cursor advancement` 的正式判定规则
- `cursor advancement recognition` 的正式承认边界
- `acceptance / ack result` 的正式交付壳
- `reconciliation` 的分类表、优先级与建议动作表
- 完整 `journal replay result` schema
- 最终 checkpoint / snapshot 持久化 schema
- 最终 TypeScript 目录树、类名、枚举名、JSON 字段名

一句话说，第一刀只做**恢复入口三段式骨架**，不做恢复链路后半段的正式判定与交付。

## 6. 为什么这个切片适合作为第一刀

这个切片适合作为第一刀，主要有五个原因。

### 6.1 它正好跨过了三层，但又没有跨得太远

它刚好覆盖：

- 材料层入口
- replay 过程入口
- recover 动作协调入口

这足够验证当前文档里最核心的三层边界能否真正在代码里分开，但还没有深入到后半段复杂判断。

### 6.2 它能最快暴露“有没有重新混写”

如果第一刀做完以后，代码里仍然出现：

- recover 自己去读材料
- recover 自己顺手做 replay
- replay 顺手直接做 hydrate

那就说明当前边界还没有真正落地，问题会在最早阶段暴露出来，而不是拖到后面才发现。

### 6.3 它不要求提前定义未来协议

这三层壳可以先靠最小输入输出占位串起来，不需要提前写死：

- 最终恢复结果字段表
- 最终 replay result schema
- 最终 reconciliation 规则表

这非常符合当前 phase 1 文档“先冻结边界，不冻结细则”的状态。

### 6.4 它做完以后，后续切片有自然挂点

只要这条最小调用骨架存在，后面再补：

- `journal replay result`
- `cursor advancement`
- `cursor advancement result`
- `hydrate` 邻接 handoff

都会有清晰插口，不需要再回头拆第一层骨架。

### 6.5 它的实现风险最可控

这第一刀哪怕只落成空壳、接口壳、最小 happy-path，也已经有价值，因为它验证的是**结构正确性**，不是业务完整度。

## 7. 这个切片依赖哪些上位文档

这份第一实施切片指南，建议直接依赖下面这些文档：

- `README.md`
- `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`
- `agent-core-checkpoint-snapshot-material-layer-formal-baseline-v1.md`
- `agent-core-journal-receipt-cursor-reconciliation-formal-baseline-v1.md`
- `agent-core-journal-replay-formal-baseline-v1.md`
- `agent-core-recovery-chain-structure-map-v1.md`
- `agent-core-recovery-chain-implementation-landing-map-v1.md`

这些文档分别提供：

- phase 入口
- 动作层边界
- 材料层边界
- 材料细化层边界
- replay 问题域边界
- 当前恢复链路的结构总图
- 文档到实现关注面的导航

## 8. 这个切片完成后，下一刀自然接到哪里

这一刀完成后，下一刀最自然的延伸不是直接去做完整 `hydrate / resume`，而是先补上：

**`journal replay result` 邻域 + `cursor advancement` 邻域**

原因很简单：

- 第一刀已经有了 replay 入口壳
- 下一步最自然的问题就是“replay 之后留下什么”
- 紧接着就是“位置是否推进、推进到哪里、推进结果怎样继续交给 recover 下游”

所以更自然的第二刀是：

```text
replay pipeline shell
  -> replay result 最小结果壳
  -> cursor advancement 最小判定壳
```

等这一段稳定后，再继续接 `recognition`、`acceptance / ack result`，最后再把 `hydrate / resume` 的真实接入做深。

## 9. 切片结构图

下面这张图只表达第一刀的边界，不表达最终代码目录树。

```text
[第一刀包含]

recover 入口
  -> recovery coordinator shell
       -> material loader shell
            -> checkpoint / snapshot 邻近材料读取
            -> journal / cursor 邻近材料读取
       -> replay pipeline shell
            -> replay 占位过程
            -> replay 占位结果
       -> 返回最小 recover 基础占位结果

[第一刀不包含]

  X hydrate 真正灌回
  X resume 真正续接
  X cursor advancement 正式规则
  X recognition / acceptance 正式结果层
  X reconciliation 规则表
  X 最终 schema / 最终目录树
```

如果再压缩成一句实施口令，可以记成：

```text
先把 recover、material loader、replay 三层壳分开，
先串通最小调用骨架，
先不要碰后半段正式判定与灌回。
```

## 10. 结论

当前恢复链路的第一实施切片，最适合选择：

**`material loader shell + replay pipeline shell + recovery coordinator shell`**

它足够小，足够贴近当前文档边界，也足够像真正开工时的第一刀。

它的目标不是“恢复链路已经做完”，而是先把：

- 材料入口
- replay 入口
- recover 总协调入口

这三层真实拆开，为后续 `journal replay result`、`cursor advancement`、`recognition`、`hydrate / resume` 留出稳定挂点。
