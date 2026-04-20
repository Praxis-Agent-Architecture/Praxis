# agentCore 第八实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第八实施切片完成判定清单**。

它只回答一个问题：

- 第八刀“`recovery-side` 第一个最小 consumer 壳内侧的第一条最小消费接线 / 最小 `recover intake seam`”，做到什么程度，才算这一刀已经完成，可以进入第九刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第八实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终 rule table 或最终 protocol 的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第八刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第八实施切片是：

- `recovery-side` 第一个最小 consumer 壳内侧的第一条最小消费接线
- 或等价的最小 `recover intake seam`

白话讲，这一刀只验收一件事：

- 第七刀已经站住的 `recovery-side` 第一个最小 consumer 壳，是否已经继续向内长出了一条真实独立的最小消费接线；这条接线是否已经能单独暴露“壳内 seam 已存在”，而不是只停留在“有 consumer 壳”这种外层说法

也就是至少能形成下面这条最小桥接链：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
```

这里验收的是“壳内第一条最小 seam 是否真实独立成立”，不是“完整 `recover` 动作层、完整 `resume`、完整 `hydrate` 或最终消费协议是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `recovery-side` 第一个最小 consumer 壳内侧是否已经真实站住一条独立最小消费接线，而不是继续停留在“壳已经有了”的描述层
2. `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam 这三者是否已经明确分层，而不是继续混成一层
3. 当前链路是否已经明确暴露“壳内 seam 已存在”的事实，而不是只暴露“有 consumer 壳”
4. 是否克制住了越界实现，没有把完整 `recover`、完整 `resume`、完整 `hydrate`、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `recovery-side` 第一个最小 consumer 壳内侧已经作为独立窄层存在，不再只是第七刀 consumer 壳的一句附带说明
- `downstream consumption entry`、consumer 壳、壳内最小 seam 已经明确分层，不再把“entry 外侧谁来接”和“壳里面最小从哪里接”混成一层
- 当前链路已经以链路暴露者身份把壳内 seam 这层露出来，而不是重新吞掉 entry 构建、consumer 壳产出或后续动作层职责
- 当前实现至少能从命名和责任上看出：谁负责 entry 外侧第一层壳，谁负责壳内第一条最小接线，谁负责把这条 seam 暴露给当前链路外侧
- 当前实现没有借“先跑起来”为理由，把第八刀重新收缩成一个大 consumer 函数、一个大 `recover` 函数或一个大恢复协调器

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `recovery-side` 第一个最小 consumer 壳内侧，对外暴露的是“壳内最小先从哪里开始消费”的最小接线面，或等价载体，而不是完整 `recover`、完整 `resume` 或完整 `hydrate` 动作出口
- 壳外 `downstream consumption entry` 到壳内 seam 的最小过渡，对外暴露的是“这份 entry 现在先进入这层壳，再由壳内 seam 接手”的最小接入关系，而不是完整 consumer lifecycle、完整路由策略或完整恢复协议表
- 当前链路暴露的是“壳已成立且壳内 seam 已开始出现”的事实，而不是越层直抓 future `recover`、`resume`、`hydrate` 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 consumer schema、最终 recover intake schema、最终 protocol、最终字段全集或最终枚举全集
- 当前接口已经给第九刀留出自然入口：更明确的 recovery-side 最小消费路径，或更内侧但仍非完整动作层的下一小段

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `downstream consumption entry` 出口，会交给第一个最小 consumer 壳继续承接
- 第一个最小 consumer 壳当前即使只支持极窄 happy-path，也已经真实承担“entry 外侧最小先由谁接”的最小职责，而不是纯纸面占位
- 壳一旦成立，已经会继续交给壳内第一条最小消费接线，而不是停留在“壳可被未来下游继续使用”的抽象说法
- 当前链路已经能够暴露上述壳内 seam，而不是只停在“consumer 壳已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`acceptance / ack result` -> handoff 邻域 -> entry -> 第一个 consumer 壳 -> 壳内最小 seam -> 当前链路最小暴露”，不是“宿主已经完成完整 `recover` / `resume` / `hydrate`”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把完整 consumer 选择 / 路由策略一并做进来
- 没有把完整 downstream consumption protocol 一并做进来
- 没有为了“先完整一点”而把最终 consumer schema、最终 recover intake schema、最终 rule table、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第七刀写成“recover 动作层已经完成”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“entry 外侧第一层 consumer 壳里，最小 seam 已经站住”，不是“后半条恢复动作链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `recovery-side` 第一个最小 consumer 壳仍然不存在，或只是 `downstream consumption entry` 的换名说法
- 名义上有 consumer 壳，但实际只是说“未来这里会接 recover”，没有壳内最小接线和最小接手面
- 当前链路仍然只暴露 entry 或外层壳，没有暴露壳内最小 seam 的事实
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table 一起写进来了
- 壳内 seam 接口已经被硬写成“未来最终协议必须如此”的强约束
- 代码虽然能跑，但职责混写到第九刀已无法自然接入

这类情况的共同特征是：

- 要么壳内第一条最小 seam 没立住
- 要么 `entry -> consumer 壳 -> 壳内 seam` 的最小接线没立住
- 要么当前链路对壳内 seam 的最小暴露没立住
- 要么已经把第九刀甚至更后面的对象提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第九刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `recovery-side` 第一个最小 consumer 壳已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式壳成立
- 壳内第一条最小消费接线已真实存在，哪怕目前字段很少，只够表达“这份 entry 现在先进入这层壳，再由壳内 seam 接手”
- 当前链路目前只负责把壳内 seam 暴露出来和返回最小状态，还没有承担正式完整恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小壳内 seam 挂接闭环验证
- 当前 entry、consumer 壳、壳内 seam 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 `recover` / `resume` / `hydrate` 动作层
- 当前实现已经能证明“handoff 邻域”“entry”“entry 外侧第一层壳”“壳内最小 seam”是四层，而不是同一层换名字

换句话说，只要“壳拆出来了、壳内最小 seam 接上了、当前链路暴露壳内 seam 了、越界忍住了”，即使还不精细，也足够进入第九刀。

## 7. 第八刀完成后的第九刀进入条件

第八刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第九刀：

- 第八刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到更明确的 recovery-side 最小消费路径，或更内侧但仍非完整动作层的下一小段，而不是回头重写第七刀或第八刀，或直接跳去完整 `recover` / `resume` / `hydrate`

满足这些条件后，第九刀才适合进入例如：

- 更明确的 recovery-side 最小消费路径
- 更内侧但仍然极小的下一段 intake seam

这里的关键不是“第九刀一次做多大”，而是：

- 第八刀已经证明 entry、第一层 consumer 壳和壳内最小 seam 之间的关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  downstream consumption entry 外侧已站住 recovery-side 第一个最小 consumer 壳
  壳内第一条最小消费接线 / 最小 recover intake seam 已成立
  当前链路已明确暴露“壳内 seam 已存在”的事实
  整条最小桥接链可在窄场景下走通
  接口仍是最小 seam，不是最终 schema / 最终 protocol / 最终 rule table 定稿
  完整 consumer / recover / resume / hydrate 尚未越界写入

not-done
  consumer 壳仍不存在，或只是 entry 的换名说法
  壳内最小 seam 仍没有最小接线
  当前链路仍只暴露 entry 或外层壳，不暴露壳内 seam
  只有命名，没有最小挂接
  为了“完整”提前把完整 consumer 或后续恢复动作层一起写死
```

## 9. 最终判定口径

第八刀是否完成，可以收敛成下面这句验收口径：

- 当 `downstream consumption entry` 外侧的 `recovery-side` 第一个最小 consumer 壳已经作为独立窄层成立，壳内第一条最小消费接线 / 最小 `recover intake seam` 已经成立，且当前链路已经能够明确暴露“壳内 seam 已存在”的事实，同时实现没有越界吞掉完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 entry，没有壳内 seam”“consumer 壳只是 future `recover` 的换名说法”“一做壳内 seam 就直接偷跑完整 `recover` / `resume` / `hydrate`”，都不应算完成。
