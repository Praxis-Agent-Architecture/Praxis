# agentCore 第十一实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第十一实施切片完成判定清单**。

它只回答一个问题：

- 第十一刀“`intake face / handoff strip` 之后、更靠近真正 `intake consumer` 的最小 `consumer-side receiving edge / minimal intake hook`”，做到什么程度，才算这一刀已经完成，可以进入第十二刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第十一实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终 rule table 或最终 protocol 的定稿文
- 完整 `recover`、完整 `resume` 或完整 `hydrate` 动作层的完成声明

因此，这份文档的用途不是扩大第十一刀，而是给第十一刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

白话讲，它只帮团队判断：

- 第十刀已经站住的 `intake face / handoff strip` 之后，是否已经真实长出一条 consumer 侧最小接手边
- 这条接手边是否已经能单独被当前链路暴露出来
- 它是否仍然保持“小切片、强边界、非最终定稿”，没有偷跑成完整恢复动作层

## 2. 对应切片

本文对应的第十一实施切片是：

- `intake face / handoff strip` 之后更靠近真正 `intake consumer` 的最小 `consumer-side receiving edge`
- 或等价的最小 `minimal intake hook`

白话讲，这一刀只验收一件事：

- 第十刀已经站住的最小 `intake face / handoff strip`，是否已经继续向内长出一条真实独立的 consumer-side 接手边；当前链路是否已经能暴露“receiving edge / hook 已存在”，而不是只停留在“有 face”的更外一层说法

也就是至少能形成下面这条最小桥接链：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> downstream consumption entry 最小消费挂点
  -> recovery-side 第一个最小 consumer 壳
  -> 壳内侧第一条最小消费接线 / 最小 recover intake seam
  -> 壳内 seam 之后的更明确最小消费路径 / 最小 intake lane
  -> lane 之后更靠近 intake consumer 的最小 consumer-intake-facing seam
  -> 最小 intake face / handoff strip
  -> face 之后 consumer 侧最小接手边 / minimal intake hook
```

这里验收的是“face 之后的最小 receiving edge 是否真实独立成立”，不是“完整 `recover` 动作层、完整 `resume`、完整 `hydrate` 或最终消费协议是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `intake face / handoff strip` 之后是否已经真实站住一条独立的 consumer-side receiving edge，而不是继续停留在“已经有 face”的描述层
2. `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook` 这六者是否已经明确分层，而不是继续混成一层
3. 当前链路是否已经明确暴露“receiving edge / hook 已存在”的事实，而不是只暴露“face 已存在”
4. 是否克制住了越界实现，没有把完整 `recover`、完整 `resume`、完整 `hydrate`、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

第十一刀的核心不是“更完整”，而是“第十刀 face 之后的最小接手边已经真实独立成立”。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `intake face / handoff strip` 之后已经作为独立窄层存在，不再只是 face 的一句附带说明
- `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook` 已经明确分层，不再把“entry 由谁接”“壳内 seam 从哪里走”“lane 怎么收成 face”“face 之后谁最小接住”混成一层
- 当前链路已经以链路暴露者身份把 `consumer-side receiving edge / minimal intake hook` 这一层露出来，而不是重新吞掉 entry 构建、consumer 壳产出、壳内 seam 暴露、lane 暴露或 face 暴露职责
- 当前实现至少能从命名和责任上看出：谁负责 entry 外侧第一层壳，谁负责壳内第一条最小接线，谁负责 lane，谁负责 lane 之后的最小 intake face，谁负责 face 之后的最小 receiving edge
- 当前 receiving edge 位于 face 与真正 `recover-intake consumer` 之间，不能反向退化成 face 的别名，也不能正向冒充完整 `recover` 动作入口
- 当前实现没有借“先跑起来”为理由，把第十一刀重新收缩成一个大 consumer 函数、一个大 `recover` 函数或一个大恢复协调器

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `intake face / handoff strip` 之后，对外暴露的是“consumer 侧最小先由哪条边接住”的 receiving edge 或等价 hook，而不是完整 `recover`、完整 `resume` 或完整 `hydrate` 动作出口
- `face -> receiving edge` 的最小过渡，对外暴露的是“这片 face 现在先交给这个 hook 接住”的最小接入关系，而不是完整 consumer lifecycle、完整路由策略或完整恢复协议表
- 当前链路暴露的是“face 已成立且其后已经开始出现最小 receiving edge”的事实，而不是越层直抓 future `recover`、`resume`、`hydrate` 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 consumer schema、最终 recover intake schema、最终 protocol、最终字段全集或最终枚举全集
- 当前接口已经给第十二刀留出自然入口：更接近真正 `recover-intake consumer` 的下一窄层，或 receiving edge 之后更内侧但仍非完整动作层的下一小段
- 当前接口没有要求第十二刀必须沿用某个最终类名、最终目录树、最终状态机或最终 rule table，只要求能从 receiving edge 继续往内收

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `downstream consumption entry` 出口，会交给第一个最小 consumer 壳继续承接
- 第一个最小 consumer 壳当前即使只支持极窄 happy-path，也已经真实承担“entry 外侧最小先由谁接”的最小职责，而不是纯纸面占位
- 壳一旦成立，已经会继续交给壳内第一条最小消费接线，而不是停留在“壳可被未来下游继续使用”的抽象说法
- 壳内第一条最小消费接线一旦成立，已经会继续交给 seam 之后的最小 `intake lane`，而不是停留在“未来这里会有更具体路径”的抽象说法
- 最小 `intake lane` 一旦成立，已经会继续交给 lane 之后更靠近 `intake consumer` 的最小 `intake face / handoff strip`
- 最小 `intake face / handoff strip` 一旦成立，已经会继续交给 face 之后 consumer 侧的最小 receiving edge / hook，而不是停留在“未来这里会接 recover”的抽象说法
- 当前链路已经能够暴露 receiving edge / hook，而不是只停在“consumer 壳 / 壳内 seam / lane / face 已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`acceptance / ack result` -> handoff 邻域 -> entry -> 第一个 consumer 壳 -> 壳内最小 seam -> 最小 intake lane -> 最小 intake face -> 最小 receiving edge -> 当前链路最小暴露”，不是“宿主已经完成完整 `recover` / `resume` / `hydrate`”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把完整 `recover-intake consumer` 一并做成最终版本
- 没有把完整 consumer 选择 / 路由策略一并做进来
- 没有把完整 downstream consumption protocol 一并做进来
- 没有把完整 consumer action runner、完整 action lifecycle 或完整结果收口一并做进来
- 没有为了“先完整一点”而把最终 consumer schema、最终 recover intake schema、最终 rule table、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第十一刀写成“完整 recover 动作层已经成立”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“face 之后的最小 receiving edge 已经站住”，不是“后半条恢复动作链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `intake face / handoff strip` 之后仍然没有独立的最小 consumer-side receiving edge，或只是 face 的换名说法
- 名义上有 hook，但实际只是说“未来这里会接 recover”，没有更明确的最小接手边和最小挂接关系
- 当前链路仍然只暴露 face，没有暴露 face 之后的更明确最小 `consumer-side receiving edge / minimal intake hook`
- receiving edge 与 `downstream consumption entry`、第一个 consumer 壳、壳内 seam、intake lane、intake face 之间的职责边界仍然混在一起
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table 一起写进来了
- hook 接口已经被硬写成“未来最终协议必须如此”的强约束
- 代码虽然能跑，但职责混写到第十二刀已无法自然接入

这类情况的共同特征是：

- 要么 face 之后的最小 receiving edge 没立住
- 要么 `entry -> consumer 壳 -> 壳内 seam -> lane -> face -> receiving edge` 的最小接线没立住
- 要么当前链路对 receiving edge 的最小暴露没立住
- 要么已经把第十二刀甚至更后面的对象提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第十二刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `intake face / handoff strip` 之后的最小 consumer-side receiving edge 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式 hook 成立
- face 之后的最小 hook 已真实存在，哪怕目前字段很少，只够表达“这片 face 先由这条 consumer-side 接手边接住”
- 当前链路目前只负责把 receiving edge 暴露出来和返回最小状态，还没有承担正式完整恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 hook 挂接闭环验证
- 当前 entry、consumer 壳、壳内 seam、lane、face、receiving edge 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 `recover` / `resume` / `hydrate` 动作层
- 当前实现已经能证明“handoff 邻域”“entry”“entry 外侧第一层壳”“壳内最小 seam”“最小 lane”“最小 face”“最小 receiving edge”是七层，而不是同一层换名字
- 当前 receiving edge 只是为第十二刀留下更靠近真正 `recover-intake consumer` 的下一窄入口，而不是提前决定第十二刀的完整动作结构

换句话说，只要“hook 站出来了、hook 和 face 分开了、当前链路暴露 hook 了、越界忍住了”，即使还不精细，也足够进入第十二刀。

## 7. 第十一刀完成后的第十二刀进入条件

第十一刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第十二刀：

- 第十一刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook` 六者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到更接近真正 `recover-intake consumer` 的下一窄层，或 receiving edge 之后更内侧但仍非完整动作层的下一小段，而不是回头重写第九刀、第十刀或第十一刀，或直接跳去完整 `recover` / `resume` / `hydrate`

满足这些条件后，第十二刀才适合进入例如：

- 更接近真正 `recover-intake consumer` 的下一窄层
- receiving edge 之后、真正动作层之前的最小 pre-action 接口或接入槽
- 仍然非最终 schema、非最终 rule table、非最终 protocol 的下一小段

这里的关键不是“第十二刀一次做多大”，而是：

- 第十一刀已经证明 entry、第一层 consumer 壳、壳内最小 seam、最小 lane、最小 face 和最小 receiving edge 之间的关系是成立的
- 第十二刀可以从 receiving edge 再往内收，而不是回头补 face，也不是直接宣布完整恢复动作层完成

## 8. 一个很小的 done / not-done 边界图

```text
done
  downstream consumption entry 外侧已站住 recovery-side 第一个最小 consumer 壳
  壳内第一条最小消费接线 / 最小 recover intake seam 已成立
  壳内 seam 之后的更明确最小消费路径 / 最小 intake lane 已成立
  lane 之后更靠近 intake consumer 的最小 intake face / handoff strip 已成立
  face 之后 consumer 侧最小接手边 / minimal intake hook 已成立
  当前链路已明确暴露“receiving edge / hook 已存在”的事实
  整条最小桥接链可在窄场景下走通
  接口仍是最小 hook，不是最终 schema / 最终 protocol / 最终 rule table 定稿
  完整 consumer / recover / resume / hydrate 尚未越界写入

not-done
  face 之后的最小 receiving edge 仍不存在，或只是 face 的换名说法
  receiving edge 仍然没有最小挂接关系
  当前链路仍只暴露 face，不暴露 receiving edge / hook
  只有命名，没有最小接手边
  为了“完整”提前把完整 consumer 或后续恢复动作层一起写死
```

## 9. 最终判定口径

第十一刀是否完成，可以收敛成下面这句验收口径：

- 当 `downstream consumption entry` 外侧的 `recovery-side` 第一个最小 consumer 壳已经作为独立窄层成立，壳内第一条最小消费接线 / 最小 `recover intake seam` 已经成立，壳内 seam 之后的更明确最小消费路径 / 最小 `intake lane` 已经成立，lane 之后更靠近 `intake consumer` 的最小 `intake face / handoff strip` 已经成立，且 face 之后 consumer 侧的最小 `consumer-side receiving edge / minimal intake hook` 也已经成立，当前链路能够明确暴露“receiving edge / hook 已存在”的事实，同时实现没有越界吞掉完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 face，没有 receiving edge”“receiving edge 只是 face 的换名说法”“一做 hook 就直接偷跑完整 `recover` / `resume` / `hydrate`”，都不应算完成。
