# agentCore 第十四实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第十四实施切片完成判定清单**。

它只回答一个问题：

- 第十四刀“`pre-action consumer boundary / action-candidate-facing edge` 之后、完整 action candidate 之前的最小 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam`”，做到什么程度，才算这一刀已经完成，可以进入第十五刀

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十四实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终目录树设计稿
- 最终 schema、最终 rule table 或最终 protocol 的定稿文
- 完整 `recover`、完整 `resume` 或完整 `hydrate` 动作层的完成声明
- 完整 action candidate 或完整 action candidate runner 的完成声明

因此，这份文档的用途不是扩大第十四刀，而是给第十四刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

白话讲，它只帮团队判断：

- 第十三刀已经站住的最小 `pre-action consumer boundary / action-candidate-facing edge` 之后，是否已经真实长出一片完整 action candidate 之前的最小候选邻接 seam
- 这片 seam 是否已经能单独被当前链路暴露出来
- 它是否仍然保持“小切片、强边界、非最终定稿”，没有偷跑成完整 action candidate、完整 action candidate runner、完整 `recover / resume / hydrate` 或最终协议定稿

## 2. 对应切片

本文对应的第十四实施切片是：

- `pre-action consumer boundary / action-candidate-facing edge` 之后，更接近第一个 `recover-intake consumer action candidate`、但仍位于完整 action candidate 之前的最小 `action-candidate-pre-edge`
- 或等价的最小 `minimal action-candidate sightline / candidate-adjacent seam`

白话讲，这一刀只验收一件事：

- 第十三刀已经站住的最小 pre-action consumer boundary，是否已经继续向内长出一个真实独立的动作候选前置视线层；当前链路是否已经能暴露“action-candidate-pre-edge 已存在”，而不是只停留在“有 pre-action consumer boundary”的更外一层说法

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
  -> receiving edge 之后、动作层之前的最小 pre-action intake slot
  -> pre-action slot 之后、动作候选边之前的最小 pre-action consumer boundary
  -> pre-action consumer boundary 之后、完整 action candidate 之前的最小 action-candidate-pre-edge
```

这里验收的是“pre-action consumer boundary 之后的最小 action-candidate-pre-edge 是否真实独立成立”，不是“完整 action candidate、完整 action candidate runner、完整 `recover / resume / hydrate` 或最终消费协议是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `pre-action consumer boundary / action-candidate-facing edge` 之后是否已经真实站住一个独立的 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam`，而不是继续停留在“已经有 pre-action consumer boundary”的描述层
2. `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook`、最小 `pre-action intake slot / recover-intake pre-action seam`、最小 `pre-action consumer boundary / action-candidate-facing edge`、最小 `action-candidate-pre-edge / minimal action-candidate sightline` 这九者是否已经明确分层，而不是继续混成一层
3. 当前链路是否已经明确暴露“action-candidate-pre-edge 已存在”的事实，而不是只暴露“pre-action consumer boundary 已存在”
4. 是否克制住了越界实现，没有把完整 action candidate、完整 action candidate runner、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

第十四刀的核心不是“更完整”，而是“第十三刀 pre-action consumer boundary 之后、真正 action candidate 之前的最小候选邻接 seam 已经真实独立成立”。

## 4. 完成判定项

以下各项全部满足，才算第十四刀完成：

- `pre-action consumer boundary / action-candidate-facing edge` 之后已经作为独立窄层存在，不再只是 pre-action consumer boundary 的一句附带说明
- `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam` 明确位于 pre-action consumer boundary 与第一个完整 action candidate 之间
- 当前链路已经能最小暴露“action-candidate-pre-edge 已存在”，而不是只暴露“pre-action consumer boundary 已存在”
- 当前实现至少能从命名和责任上看出：谁负责 pre-action consumer boundary，谁负责 boundary 之后的候选邻接 seam，谁还没有开始承担完整 action candidate 或 runner
- 当前 pre-edge 只表达“第一个动作候选可以被看见之前的最小邻接边”，不能承担 action candidate 的完整构造、选择、排序、执行或结果收口职责
- 当前实现没有借“先跑起来”为理由，把第十四刀重新收缩成一个大 `recover` 函数、一个完整候选生成器、一个完整 action runner 或一个大恢复协调器
- 当前验证可以很轻，但至少要证明这片 pre-edge 不是纸面概念，而是在最小链路里被接到和被暴露

## 5. 结构判定项

以下各项全部满足，才算结构上过线：

- `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook`、最小 `pre-action intake slot / recover-intake pre-action seam`、最小 `pre-action consumer boundary / action-candidate-facing edge`、最小 `action-candidate-pre-edge / minimal action-candidate sightline` 已经明确分层
- `action-candidate-pre-edge` 不能反向退化成 pre-action consumer boundary 的别名，也不能正向冒充完整 action candidate 的别名
- `minimal action-candidate sightline` 只负责让“候选即将被看见”这件事成立，不负责让候选内容、候选字段、候选策略或候选执行器定型
- `candidate-adjacent seam` 不能吞掉更外侧的 entry、consumer 壳、壳内 seam、lane、face、receiving edge、pre-action slot 或 pre-action consumer boundary 职责
- 当前结构允许 stub、placeholder、极窄 happy-path 或单一路径成立，但必须能看出“pre-action consumer boundary -> action-candidate-pre-edge”是一条更内侧的最小过渡
- 当前结构没有把 `pre-action slot -> pre-action consumer boundary -> action-candidate-pre-edge -> first action candidate shell` 这条自然递进压扁成一层

## 6. 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- 对外暴露的是“pre-action consumer boundary 之后、完整 action candidate 之前最小先落到哪片 candidate-adjacent seam”的窄边界，而不是完整 action candidate 出口
- `pre-action consumer boundary -> action-candidate-pre-edge` 的最小过渡，只表达“这片 boundary 现在先交给这个候选邻接 seam”，而不表达完整候选生成协议
- 当前链路暴露的是“boundary 已成立且其后已经开始出现最小 action-candidate-pre-edge”的事实，而不是越层直抓 future action candidate、runner、`recover`、`resume`、`hydrate` 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 consumer schema、最终 recover intake schema、最终 action candidate schema、最终 protocol、最终字段全集或最终枚举全集
- 当前接口已经给第十五刀留出自然入口：第一个极窄 action candidate 候选壳，或第一个 `recover-intake consumer action candidate` 的前置承认点
- 当前接口没有要求第十五刀必须沿用某个最终类名、最终目录树、最终状态机、最终 rule table 或最终 action candidate 结构，只要求能从 action-candidate-pre-edge 继续往内收

## 7. 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `downstream consumption entry` 出口，会交给第一个最小 consumer 壳继续承接
- 第一个最小 consumer 壳已经真实承担“entry 外侧最小先由谁接”的最小职责，而不是纯纸面占位
- 壳一旦成立，已经会继续交给壳内第一条最小消费接线
- 壳内第一条最小消费接线一旦成立，已经会继续交给 seam 之后的最小 `intake lane`
- 最小 `intake lane` 一旦成立，已经会继续交给 lane 之后更靠近 `intake consumer` 的最小 `intake face / handoff strip`
- 最小 `intake face / handoff strip` 一旦成立，已经会继续交给 face 之后 consumer 侧的最小 receiving edge / hook
- 最小 `consumer-side receiving edge / minimal intake hook` 一旦成立，已经会继续交给 receiving edge 之后、动作层之前的最小 pre-action intake slot
- 最小 `pre-action intake slot / recover-intake pre-action seam` 一旦成立，已经会继续交给 slot 之后、动作候选边之前的最小 pre-action consumer boundary
- 最小 `pre-action consumer boundary / action-candidate-facing edge` 一旦成立，已经会继续交给 boundary 之后、完整 action candidate 之前的最小 action-candidate-pre-edge，而不是停留在“未来这里会生成 action candidate”的抽象说法
- 当前链路已经能够暴露 action-candidate-pre-edge / minimal action-candidate sightline，而不是只停在“pre-action consumer boundary 已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`acceptance / ack result` -> handoff 邻域 -> entry -> 第一个 consumer 壳 -> 壳内最小 seam -> 最小 intake lane -> 最小 intake face -> 最小 receiving edge -> 最小 pre-action slot -> 最小 pre-action consumer boundary -> 最小 action-candidate-pre-edge -> 当前链路最小暴露”，不是“宿主已经完成完整 action candidate、完整 action runner 或完整 `recover / resume / hydrate`”

## 8. 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把完整 `recover-intake consumer` 一并做成最终版本
- 没有把完整 action candidate 一并做进来
- 没有把完整 action candidate schema 一并做进来
- 没有把完整 action candidate 选择 / 排序 / 执行策略一并做进来
- 没有把完整 action candidate runner 一并做进来
- 没有把完整 consumer action runner、完整 action lifecycle 或完整结果收口一并做进来
- 没有把完整 consumer 选择 / 路由策略一并做进来
- 没有把完整 downstream consumption protocol 一并做进来
- 没有把完整 pre-action 校验矩阵一并做进来
- 没有为了“先完整一点”而把最终 consumer schema、最终 recover intake schema、最终 action candidate schema、最终 rule table、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第十四刀写成“完整 action candidate、完整 action runner 或完整 recover 动作层已经成立”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“pre-action consumer boundary 之后、完整 action candidate 之前的最小 action-candidate-pre-edge 已经站住”，不是“后半条候选生成链或动作执行层顺手做完”。

## 9. 哪些情况算还没做完

出现下面任一情况，都应判定为 **not-done**：

- `pre-action consumer boundary / action-candidate-facing edge` 之后仍然没有独立的最小 action-candidate-pre-edge，或只是 pre-action consumer boundary 的换名说法
- 名义上有 minimal action-candidate sightline，但实际只是说“未来这里会生成 action candidate”，没有更明确的候选邻接 seam 和最小挂接关系
- 当前链路仍然只暴露 pre-action consumer boundary，没有暴露 boundary 之后的更明确最小 `action-candidate-pre-edge / minimal action-candidate sightline`
- action-candidate-pre-edge 与 `downstream consumption entry`、第一个 consumer 壳、壳内 seam、intake lane、intake face、receiving edge、pre-action slot、pre-action consumer boundary 之间的职责边界仍然混在一起
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 action candidate、完整 action candidate runner、完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table / protocol 一起写进来了
- action-candidate-pre-edge 接口已经被硬写成“未来最终协议必须如此”的强约束
- action-candidate-pre-edge 已经承担 action candidate 的构造、选择、排序、执行或结果收口职责
- 代码虽然能跑，但职责混写到第十五刀已无法自然接入第一个极窄 action candidate 候选壳或前置承认点

这类情况的共同特征是：

- 要么 pre-action consumer boundary 之后的最小 action-candidate-pre-edge 没立住
- 要么 `entry -> consumer 壳 -> 壳内 seam -> lane -> face -> receiving edge -> pre-action slot -> pre-action consumer boundary -> action-candidate-pre-edge` 的最小接线没立住
- 要么当前链路对 action-candidate-pre-edge 的最小暴露没立住
- 要么已经把第十五刀甚至更后面的对象提前绑死

## 10. 哪些情况虽然粗糙但已经 done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `pre-action consumer boundary / action-candidate-facing edge` 之后的最小 action-candidate-pre-edge 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式 seam 成立
- boundary 之后的最小 `minimal action-candidate sightline` 已真实存在，哪怕目前字段很少，只够表达“这片 pre-action consumer boundary 先交给这片候选邻接 seam”
- 当前链路目前只负责把 action-candidate-pre-edge 暴露出来和返回最小状态，还没有承担正式完整 action candidate 构造、runner 执行或恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 pre-edge 挂接闭环验证
- 当前 entry、consumer 壳、壳内 seam、lane、face、receiving edge、pre-action slot、pre-action consumer boundary、action-candidate-pre-edge 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 action candidate、完整 action runner 或完整 `recover / resume / hydrate`
- 当前实现已经能证明“handoff 邻域”“entry”“entry 外侧第一层壳”“壳内最小 seam”“最小 lane”“最小 face”“最小 receiving edge”“最小 pre-action slot”“最小 pre-action consumer boundary”“最小 action-candidate-pre-edge”是十层，而不是同一层换名字
- 当前 action-candidate-pre-edge 只是为第十五刀留下第一个极窄 action candidate 候选壳或前置承认点的下一窄入口，而不是提前决定第十五刀的完整动作候选结构

换句话说，只要“action-candidate-pre-edge 站出来了、pre-edge 和 pre-action consumer boundary 分开了、当前链路暴露 pre-edge 了、越界忍住了”，即使还不精细，也足够进入第十五刀。

## 11. 第十四刀完成后的第十五刀进入条件

第十四刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第十五刀：

- 第十四刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `downstream consumption entry`、第一个最小 consumer 壳、壳内最小 seam、最小 `intake lane`、最小 `intake face / handoff strip`、最小 `consumer-side receiving edge / minimal intake hook`、最小 `pre-action intake slot / recover-intake pre-action seam`、最小 `pre-action consumer boundary / action-candidate-facing edge`、最小 `action-candidate-pre-edge / minimal action-candidate sightline` 九者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到第一个极窄 action candidate 候选壳、或第一个 `recover-intake consumer action candidate` 的前置承认点，而不是回头重写第十二刀、第十三刀或第十四刀，或直接跳去完整 action candidate runner / 完整 `recover / resume / hydrate`

满足这些条件后，第十五刀才适合进入例如：

- 第一个极窄 action candidate 的候选壳
- 第一个 `recover-intake consumer action candidate` 的前置承认点
- `action-candidate-pre-edge / minimal action-candidate sightline` 之后、但仍然不是完整 action candidate runner 的下一小段

这里的关键不是“第十五刀一次做多大”，而是：

- 第十四刀已经证明 pre-action consumer boundary 之后、完整 action candidate 之前的最小候选邻接 seam 是成立的
- 第十五刀可以从 action-candidate-pre-edge 再往内收，而不是回头补 pre-action consumer boundary，也不是直接宣布完整 action candidate、完整 runner 或完整恢复动作层完成

## 12. 一个很小的 done / not-done 边界图

```text
done
  downstream consumption entry 外侧已站住 recovery-side 第一个最小 consumer 壳
  壳内第一条最小消费接线 / 最小 recover intake seam 已成立
  壳内 seam 之后的更明确最小消费路径 / 最小 intake lane 已成立
  lane 之后更靠近 intake consumer 的最小 intake face / handoff strip 已成立
  face 之后 consumer 侧最小接手边 / minimal intake hook 已成立
  receiving edge 之后、动作层之前的最小 pre-action intake slot 已成立
  pre-action slot 之后、动作候选边之前的最小 pre-action consumer boundary 已成立
  pre-action consumer boundary 之后、完整 action candidate 之前的最小 action-candidate-pre-edge 已成立
  当前链路已明确暴露“action-candidate-pre-edge 已存在”的事实
  整条最小桥接链可在窄场景下走通
  接口仍是最小 candidate-adjacent seam，不是最终 action candidate / action runner / schema / protocol / rule table 定稿
  完整 consumer / action candidate / action runner / recover / resume / hydrate 尚未越界写入

not-done
  pre-action consumer boundary 之后的最小 action-candidate-pre-edge 仍不存在，或只是 boundary 的换名说法
  action-candidate-pre-edge 仍然没有最小挂接关系
  当前链路仍只暴露 pre-action consumer boundary，不暴露 action-candidate-pre-edge
  只有命名，没有候选邻接 seam
  为了“完整”提前把完整 action candidate、完整 action runner、完整 consumer 或后续恢复动作层一起写死
```

## 13. 最终判定口径

第十四刀是否完成，可以收敛成下面这句验收口径：

- 当 `downstream consumption entry` 外侧的 `recovery-side` 第一个最小 consumer 壳已经作为独立窄层成立，壳内第一条最小消费接线 / 最小 `recover intake seam` 已经成立，壳内 seam 之后的更明确最小消费路径 / 最小 `intake lane` 已经成立，lane 之后更靠近 `intake consumer` 的最小 `intake face / handoff strip` 已经成立，face 之后 consumer 侧的最小 `consumer-side receiving edge / minimal intake hook` 已经成立，receiving edge 之后、真正动作层之前的最小 `pre-action intake slot / recover-intake pre-action seam / consumer-side pre-action port` 已经成立，pre-action slot 之后、真正 action candidate 之前的最小 `pre-action consumer boundary / action-candidate-facing edge` 已经成立，且 pre-action consumer boundary 之后、完整 action candidate 之前的最小 `action-candidate-pre-edge / minimal action-candidate sightline / candidate-adjacent seam` 也已经成立，当前链路能够明确暴露“action-candidate-pre-edge 已存在”的事实，同时实现没有越界吞掉完整 action candidate、完整 action candidate runner、完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 pre-action consumer boundary，没有 action-candidate-pre-edge”“action-candidate-pre-edge 只是 pre-action consumer boundary 的换名说法”“一做 minimal action-candidate sightline 就直接偷跑完整 action candidate、完整 action runner 或完整 `recover / resume / hydrate`”，都不应算完成。
