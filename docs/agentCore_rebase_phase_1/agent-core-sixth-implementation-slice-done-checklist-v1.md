# agentCore 第六实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第六实施切片完成判定清单**。

它只回答一个问题：

- 第六刀“更明确的 `downstream consumption entry` 最小消费挂点 + handoff 到 entry 的最小接线 + 当前链路对 entry 的最小暴露”，做到什么程度，才算这一刀已经完成，可以进入第七刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第六实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终 rule table 或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第六刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第六实施切片是：

- 更明确的 `downstream consumption entry` 最小消费挂点
- handoff 到 entry 的最小接线
- 当前链路对这层 entry 的最小暴露

白话讲，这一刀只验收一件事：

- 第五刀留下的最小 `downstream handoff / downstream consumption` 邻域，是否已经继续收紧成一个独立最小的 `downstream consumption entry`；这个 entry 是否已经通过极小接线真实连到 handoff 邻域；并且当前链路是否已经开始明确暴露“下游最小从哪里开始接”，而不是继续只停留在“已经可以下交”的抽象口号

也就是至少能形成下面这条最小桥接链：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> 当前链路最小暴露 entry
```

这里验收的是“更明确的消费入口是否站住”，不是“完整 downstream consumer、完整 `recover` / `resume` / `hydrate` 或最终消费协议是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `downstream consumption entry` 是否已经从第五刀的 handoff 邻域里真实收紧成独立最小消费挂点，而不是继续停留在 handoff 描述层或概念口号层
2. handoff 到 entry 的最小接线是否已经成立，而不是只有“未来可继续下交”的抽象关系
3. 当前链路是否已经明确暴露“下游从哪里开始接”的 entry 面，而不是继续只消费 `acceptance / ack result` 或只证明 handoff 邻域存在
4. 是否克制住了越界实现，没有把完整 consumer、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 rule table、最终 schema 或最终目录树一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `downstream consumption entry` 已经作为独立最小消费挂点存在，不再只是第五刀 handoff 邻域里的一句附带描述
- handoff 邻域与 `downstream consumption entry` 已经明确分层，不再把“可下交”与“从哪里开始接”混成一层
- 当前链路已经以链路暴露者身份把 entry 这层挂点露出来，而不是重新吞掉 handoff 邻域构建或 entry 产出的职责
- 当前实现至少能从命名和责任上看出：谁负责最小 handoff 邻域，谁负责收紧出 `downstream consumption entry`，谁负责把这层 entry 暴露给当前链路外侧
- 当前实现没有借“先跑起来”为理由，把第六刀重新收缩成一个大 handoff 函数、一个大 entry 函数或一个大 consumer coordinator 函数

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `downstream consumption entry` 对外暴露的是“下游最小从哪里开始接”的最小入口面，或等价载体，而不是完整 downstream consumer、完整 adapter 或完整动作出口
- handoff 到 entry 的最小接线，对外暴露的是“acceptance 后结果现在可以挂到这个 entry 上”的最小接入关系，而不是完整 consumer lifecycle、完整路由策略或完整协议表
- 当前链路暴露的是“entry 已成立且可被下游接住”的最小入口事实，而不是越层直抓 future consumer 内部细节、`recover` 内部细节或 `resume` / `hydrate` 内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 entry schema、最终 adapter schema、最终 protocol、最终字段全集或最终枚举全集
- 当前接口已经给第七刀“entry 外侧第一个最小 consumer 壳”留出自然挂点

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `acceptance / ack result` 出口，会交给最小 `downstream handoff / downstream consumption` 邻域继续承接
- 最小 handoff 邻域当前即使只支持极窄 happy-path，也已经真实承担“这份 acceptance 后结果现在可继续下交”的最小职责，而不是纯纸面占位
- handoff 邻域一旦成立，已经会继续收紧出一个最小 `downstream consumption entry` 或等价入口壳
- 当前链路已经能够暴露上述 entry，而不是只停在“handoff 已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`acceptance / ack result` -> handoff 邻域 -> entry -> 当前链路最小暴露”，不是“宿主已经完成完整 consumer / `recover` / `resume` / `hydrate`”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 downstream consumer 一起做进来
- 没有把完整 downstream consumer 选择 / 路由策略一并做进来
- 没有把完整 downstream consumption protocol 一并做进来
- 没有把完整 `recover` 真正收口逻辑一起做进来
- 没有把完整 `resume` 真正续接逻辑一起做进来
- 没有把完整 `hydrate` 真正灌回逻辑一起做进来
- 没有为了“先完整一点”而把最终 entry schema、最终 adapter schema、最终 rule table、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第六刀写成“下游动作层已经完成”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“更明确的最小消费入口到位”，不是“后半条消费动作链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `downstream consumption entry` 仍然只是 handoff 邻域里的换名描述，本质上没有独立入口层
- 名义上有 entry，但实际只是说“未来这里可以接 consumer”，没有最小接线和最小入口面
- 当前链路仍然只停在 `acceptance / ack result` 或 handoff 邻域，没有暴露“下游从哪里开始接”的更明确入口
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 consumer、完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table 一起写进来了
- entry 接口已经被硬写成“未来最终协议必须如此”的强约束
- 代码虽然能跑，但职责混写到第七刀已无法自然接入

这类情况的共同特征是：

- 要么 entry 没立住
- 要么 handoff 到 entry 的最小接线没立住
- 要么当前链路对 entry 的最小暴露没立住
- 要么已经把第七刀甚至更后面的对象提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第七刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `downstream consumption entry` 已真实存在，哪怕目前只支持极窄 happy-path、单一路径入口或 placeholder 式入口成立
- handoff 到 entry 的最小接线已真实存在，哪怕目前字段很少，只够表达“这份 acceptance 后结果现在从这里开始接”
- 当前链路目前只负责把 entry 暴露出来和返回最小状态，还没有承担正式 downstream consumer 动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 entry 挂接闭环验证
- 当前 handoff 邻域和 entry 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 consumer 动作层
- 当前实现已经能证明“acceptance 后结果”“最小 handoff 邻域”“更明确的 downstream consumption entry”是三层，而不是同一层换名字

换句话说，只要“entry 拆出来了、最小接线接上了、当前链路暴露 entry 了、越界忍住了”，即使还不精细，也足够进入第七刀。

## 7. 第六刀完成后的第七刀进入条件

第六刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第七刀：

- 第六刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `acceptance / ack result`、最小 handoff 邻域、`downstream consumption entry`、当前链路最小暴露四者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到“`downstream consumption entry` 外侧的第一个最小 consumer 壳”，而不是回头重写第五刀或第六刀，或直接跳去完整 `recover` / `resume` / `hydrate`

满足这些条件后，第七刀才适合进入例如：

- `downstream consumption entry` 外侧的第一个最小 consumer 壳
- `recover` 侧的第一个最小消费壳，或等价的 recovery-side consumer surface

这里的关键不是“第七刀一次做多大”，而是：

- 第六刀已经证明更明确的最小消费入口、最小接线和当前链路最小暴露之间的关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  acceptance / ack result 外侧已站住最小 downstream handoff / consumption 邻域
  handoff 邻域已继续收紧出 downstream consumption entry 最小消费挂点
  当前链路已明确暴露“下游从哪里开始接”的 entry 面
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳，不是最终 schema / 最终 protocol / 最终 rule table 定稿
  完整 consumer / recover / resume / hydrate 尚未越界写入

not-done
  entry 仍不存在，或只是 handoff 的换名说法
  handoff 到 entry 仍没有最小接线
  当前链路仍只证明“可下交”，不暴露明确入口
  只有命名，没有最小挂接
  为了“完整”提前把完整 consumer 或后续恢复动作层一起写死
```

## 9. 最终判定口径

第六刀是否完成，可以收敛成下面这句验收口径：

- 当 `downstream consumption entry` 已经作为 `acceptance / ack result` 与第五刀 handoff 邻域之后的独立最小消费挂点成立，handoff 到 entry 的最小接线已经成立，且当前链路已经能够明确暴露“下游从哪里开始接”的入口面，同时实现没有越界吞掉完整 consumer、`recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“handoff 只是可继续下交的口号”“没有独立 entry”“当前链路仍不暴露明确入口”“一做 entry 就直接偷跑完整 consumer / `recover` / `resume` / `hydrate`”，都不应算完成。
