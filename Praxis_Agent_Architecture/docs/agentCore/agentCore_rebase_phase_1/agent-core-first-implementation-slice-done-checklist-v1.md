# agentCore 第一实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第一实施切片完成判定清单**。

它只回答一个问题：

- 我们刚刚定义的第一刀，做到什么程度，才算这一刀已经完成，可以进入下一刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终算法或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第一刀提供一个偏实施、偏验收的“done / not-done”判定口径。

## 2. 对应切片

本文对应的第一实施切片是：

- `material loader shell`
- `replay pipeline shell`
- `recovery coordinator shell`

白话讲，这一刀只验收一件事：

- 恢复入口最小三段式骨架，是否已经真正落成可调用的实现壳

也就是至少能形成下面这条最小调用链：

```text
recover 入口
  -> material loader shell
  -> replay pipeline shell
  -> recovery coordinator shell 汇总最小占位结果
```

这里验收的是“骨架是否站住”，不是“恢复链路是否完整做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面三件事：

1. 三个壳是否已经分层存在，而不是继续糊在一起
2. 三者之间是否已经有最小可走通的调用链
3. 是否克制住了越界实现，没有把下一刀甚至更后面的正式问题域提前写死

只要这三件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `material loader shell` 已经作为独立实现壳存在，不再内嵌在 `recover` 主体里
- `replay pipeline shell` 已经作为独立实现壳存在，不再只是 `recover` 内部的一段私有流程
- `recovery coordinator shell` 已经作为总协调壳存在，职责是串接，不是吞掉材料读取与 replay 过程
- 三个壳之间的边界命名是清楚的，至少能看出谁读材料、谁跑 replay、谁做协调
- 当前实现没有借“先跑起来”为理由，把三层重新收缩成一个大函数或一个混合对象

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `material loader shell` 对外暴露的是“恢复材料读取结果壳”或等价的最小载体，而不是直接替 `recover` 做后续判断
- `replay pipeline shell` 接收的是来自材料层的最小输入面，并返回 replay 的最小占位结果或等价结果壳
- `recovery coordinator shell` 消费的是前两者的结果，不直接越过壳边界去读底层材料或偷做 replay 细节
- 接口允许占位、允许窄 happy-path，但没有提前钉死最终 schema、最终字段全集、最终错误分类全集
- 当前接口已经能表达“先串起来”，但仍然给 `journal replay result`、`cursor advancement`、`hydrate` 留有后续接入空间

### 4.3 最小调用链判定项

以下各项全部满足，才算最小调用链上过线：

- 存在一个明确的 `recover` 入口，能够触发这一刀的最小链路
- 调用会先进入 `material loader shell`
- `material loader shell` 的结果会被交给 `replay pipeline shell`
- `replay pipeline shell` 的结果会回到 `recovery coordinator shell`
- `recovery coordinator shell` 能产出一个最小恢复占位结果、状态或等价完成信号
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是纸面接口完全未接线

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把 `hydrate` 真实灌回逻辑一起做进来
- 没有把 `resume` 真实续接逻辑一起做进来
- 没有把 `cursor advancement` 正式判定规则一起做进来
- 没有把 `recognition`、`acceptance / ack result` 一起拉进来
- 没有为了“先完整一点”而把 `reconciliation` 分类表、优先级表、动作建议表一并定稿
- 没有顺手定义最终 TypeScript 目录树、最终类层级或最终 JSON schema

一句话说，这一刀要的是“骨架到位”，不是“后半条链路顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- 三个壳里只落了一个或两个，剩下的仍停留在口头约定
- 名义上拆成了三个壳，但实际调用时仍由 `recover` 自己读材料、自己做 replay
- `replay pipeline shell` 只有文件名或空导出，没有被最小调用链真正接上
- 当前实现只能看见结构壳，完全没有一条最小可运行链路
- 为了让链路看起来完整，提前把 `hydrate / resume / cursor advancement / recognition` 一起写进来了
- 读取结果、replay 结果或协调结果已经被直接写成“最终 schema 必须如此”的硬约束
- 代码虽然能跑，但职责混乱到后续无法自然插入下一刀

这类情况的共同特征是：

- 要么骨架没立住
- 要么边界没守住
- 要么已经把后续问题域提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入下一刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- 三个壳都已经真实存在，哪怕内部还是 stub 或 placeholder
- `material loader shell` 目前只支持极少材料形态，但读取入口和输出壳已经成立
- `replay pipeline shell` 目前只支持空 replay、单条 happy-path replay 或最小占位 replay
- `recovery coordinator shell` 目前只负责串接和返回最小结果，还没有承担正式恢复策略
- 当前结果壳字段很少，只够支撑调用链闭环，但没有冒充最终协议
- 目前只有最小验证方式，例如 smoke 级调用验证、最小 stub 驱动验证或窄路径跑通验证

换句话说，只要“结构拆开了、链路接上了、越界忍住了”，即使还不精细，也足够进入下一刀。

## 7. 第一刀完成后的下一刀进入条件

第一刀完成后，不是立刻随便扩写，而是满足下面条件后，才适合进入下一刀：

- 第一刀的 done 判定项已经全部满足
- 当前最小调用链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对这三个壳的职责边界没有明显歧义
- 下一刀要补的对象已经明确是“骨架后的桥接层或结果层”，而不是回头重写第一刀
- 没有发现必须先回炉修正的结构性混写问题

满足这些条件后，下一刀才适合进入例如：

- `journal replay result` 的进一步收紧
- `cursor advancement` 的独立接入
- 或恢复链路后续桥接面的继续展开

这里的关键不是“下一刀具体选哪份文档先落”，而是：

- 第一刀已经证明三段式骨架是能站住的

## 8. 一个很小的 done / not-done 边界图

```text
done
  material loader shell 已独立
  replay pipeline shell 已独立
  recovery coordinator shell 已独立
  recover -> loader -> replay -> coordinator 最小链路可走通
  接口是占位壳，不是最终 schema 定稿
  hydrate / resume / cursor advancement 等后续问题域尚未越界写入

not-done
  仍是一个大 recover 函数包办全部
  replay 仍藏在 recover 体内
  只有空文件或命名，没有最小接线
  为了“完整”提前把后续正式规则一起写死
```

## 9. 最终判定口径

第一刀是否完成，可以收敛成下面这句验收口径：

- 当 `material loader shell + replay pipeline shell + recovery coordinator shell` 已经作为三个独立壳存在，并且能支撑一条不越界的最小恢复调用链时，这一刀就算完成

如果还停留在“概念拆开了，但实现没有最小闭环”，或者“闭环有了，但靠越界混写硬撑”，都不应算完成。
