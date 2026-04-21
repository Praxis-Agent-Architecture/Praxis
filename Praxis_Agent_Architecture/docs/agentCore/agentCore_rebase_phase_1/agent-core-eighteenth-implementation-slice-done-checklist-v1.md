# agentCore 第十八实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第十八实施切片完成判定清单**。

它只回答一个问题：

- 第十八刀“`pre-runner readiness seam / runner-facing pre-edge` 之后、完整 runner / intake 执行之前的第一个极窄 `runner handoff token / runner intake stub / execution handoff pre-entry`”，做到什么程度，才算这一刀已经完成，可以进入第十九刀

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 全面 QA 计划
- 完整 runner 设计稿
- 完整 runner intake 设计稿
- 完整 executor 设计稿
- 完整 action lifecycle 设计稿
- 完整 execution result 或 recover / resume / hydrate 设计稿
- 最终 schema、最终 rule table、最终 protocol 或最终字段全集的定稿文
- 第十七刀 `pre-runner readiness seam / runner-facing pre-edge` 的完成声明
- 第十九刀 `runner intake lane / runner intake receiving strip / execution-intake-facing seam` 的提前完成声明

因此，这份文档的用途不是扩大第十八刀，而是给第十八刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

白话讲，它只帮团队判断：

- 第十七刀已经站住的最小 `pre-runner readiness seam / runner-facing pre-edge` 之后，是否已经真实长出第一个能交给 runner 侧的极窄 handoff token
- 这枚 token 是否已经让一个最小 runner intake stub 能被当前链路看见
- 它是否仍然保持“小切片、强边界、非最终定稿”，没有偷跑成完整 runner、完整 intake 执行、完整 executor、完整 action lifecycle、完整 execution result、完整 `recover / resume / hydrate` 或最终协议定稿

## 2. 对应切片

本文对应的第十八实施切片是：

- `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 之后，更接近 runner 入口、但仍位于完整 runner / intake 执行之前的第一个极窄 `runner handoff token`
- 或等价的最小 `runner intake stub / execution handoff pre-entry`

白话讲，这一刀只验收一件事：

- 第十七刀已经站住的 runner 前 readiness seam 之后，是否已经继续向内长出一个真实独立的 runner handoff token；当前链路是否已经能暴露“runner handoff token 已存在”，而不是只停留在“有 pre-runner readiness seam”的更外一层说法

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
  -> action-candidate-pre-edge 之后、第一个完整 action candidate 之前的最小 candidate shell / pre-ack / first candidate shell entry
  -> candidate shell 之后、完整 action candidate body 之前的最小 candidate body seam / candidate detail intake / candidate-body-facing edge
  -> candidate body seam 之后、完整 runner 之前的最小 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
  -> pre-runner readiness seam 之后、完整 runner / intake 执行之前的第一个极窄 runner handoff token / runner intake stub / execution handoff pre-entry
```

这里验收的是“pre-runner readiness seam 之后的最小 runner handoff token 是否真实独立成立”，不是“完整 runner、完整 intake、完整执行器、完整 action lifecycle、完整 execution result 或完整 `recover / resume / hydrate` 是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面五件事：

1. `pre-runner readiness seam / runner-facing pre-edge` 之后是否已经真实站住一个独立的 `runner handoff token / runner intake stub / execution handoff pre-entry`，而不是继续停留在“已经有 pre-runner readiness seam”的描述层
2. `candidate body seam / candidate detail intake`、`pre-runner readiness seam / runner-facing pre-edge`、`runner handoff token / runner intake stub` 这三者是否已经明确分层，而不是继续混成一层
3. 当前链路是否已经明确暴露“runner handoff token 已存在”的事实，而不是只暴露“pre-runner readiness seam 已存在”
4. 第十八刀是否只做到 runner 接手前的第一枚 token / 第一段 stub，不把完整 runner intake、完整执行入口、完整 runner 调度或完整 executor 一起吞掉
5. 是否克制住了越界实现，没有把完整 runner、完整 executor、完整 action lifecycle、完整 execution / result / recover / resume / hydrate、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这五件事里有一件明显没站住，就不应判定为 done。

第十八刀的核心不是“能执行”，而是“pre-runner readiness seam 之后、完整 runner / intake 执行之前的第一枚 runner handoff token 已经真实独立成立”。

## 4. 完成判定项

以下各项全部满足，才算第十八刀完成：

- `runner handoff token / runner intake stub / execution handoff pre-entry` 已经作为独立窄层存在，不再只是 pre-runner readiness seam 的一句附带说明
- 该 token 明确位于 `pre-runner readiness seam / runner-facing pre-edge` 与第一个完整 runner / runner intake 执行之间
- 当前链路已经能最小暴露“runner handoff token 已存在”，而不是只暴露“pre-runner readiness seam 已存在”
- 当前实现至少能从命名和责任上看出：谁负责 pre-runner readiness seam，谁负责 runner handoff token / intake stub，谁还没有开始承担完整 runner、executor 或 action lifecycle
- 当前 runner handoff token 只表达“runner 侧可以接到一枚最小交接凭证或入口占位”的事实，不承担 runner 调度、执行、重试、生命周期推进、结果收口或恢复动作职责
- 当前 runner intake stub 只能是 runner intake 之前的极窄接手壳，不能扩写成完整 intake lane、完整 receiving strip、完整 execution planner 或完整 action runner
- 当前 `execution handoff pre-entry` 只能表达“execution handoff 的前置入口已经出现”，不能表达完整 execution protocol、完整 result protocol 或完整 recover / resume / hydrate 协议
- 当前验证可以很轻，但至少要证明这枚 token 不是纸面概念，而是在最小链路里被创建、传递或暴露
- 当前实现没有借“先跑起来”为理由，把第十八刀重新收缩成一个完整 runner、一个执行器、一个完整 action lifecycle 或一个大恢复协调器

## 5. 结构判定

以下各项全部满足，才算结构上过线：

- `candidate body seam / candidate detail intake / candidate-body-facing edge`、`pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`、`runner handoff token / runner intake stub / execution handoff pre-entry` 已经明确分层
- `runner handoff token` 不能反向退化成 pre-runner readiness seam 的别名，也不能正向冒充完整 runner intake 的别名
- `runner intake stub` 只负责让“runner 侧第一段可接手的 stub”成立，不负责让 runner、executor、action lifecycle、执行策略、结果协议或恢复协议定型
- `execution handoff pre-entry` 不能吞掉 pre-runner readiness seam 的准备判定职责，也不能吞掉 runner 的 intake / execution 职责
- 当前结构允许 stub、placeholder、极窄 happy-path 或单一路径成立，但必须能看出“pre-runner readiness seam -> runner handoff token”是一条更内侧的最小过渡
- 当前结构没有把 `candidate body seam -> pre-runner readiness seam -> runner handoff token -> runner intake lane` 这条自然递进压扁成一层
- 当前结构不要求第十九刀必须沿用某个最终类名、最终目录树、最终状态枚举、最终 rule table 或最终 runner 协议，只要求第十九刀能从 runner handoff token 继续往 runner intake receiving strip 收

## 6. 接口边界判定

以下各项全部满足，才算接口边界上过线：

- 对外暴露的是“pre-runner readiness seam 之后、完整 runner / intake 执行之前最小先落到哪枚 handoff token”的窄边界，而不是完整 runner 出口
- `pre-runner readiness seam -> runner handoff token` 的最小过渡，只表达“这片 readiness seam 现在先交给这枚 runner 侧 token / stub”，不表达完整执行协议
- 当前链路暴露的是“pre-runner readiness seam 已成立且其后已经开始出现最小 runner handoff token”的事实，而不是越层直抓 future runner、executor、action lifecycle、execution result、`recover`、`resume`、`hydrate` 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 candidate schema、最终 runner schema、最终 intake schema、最终 action lifecycle protocol、最终字段全集或最终枚举全集
- 当前接口已经给第十九刀留出自然入口：最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`
- 当前接口没有要求第十九刀必须实现完整 runner、完整 executor、完整 action lifecycle、完整结果对象或完整恢复动作收口

## 7. 最小桥接链判定

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `candidate body seam / candidate detail intake / candidate-body-facing edge`，会交给最小 `pre-runner readiness seam / runner-facing pre-edge`
- pre-runner readiness seam 已经真实承担“runner 前是否有最小准备边”的职责，而不是纯纸面占位
- pre-runner readiness seam 一旦成立，已经会继续交给 seam 之后的第一枚极窄 `runner handoff token`
- runner handoff token 一旦成立，当前链路已经能暴露“runner handoff token 已存在”，而不是只停在“pre-runner readiness seam 已存在”
- runner intake stub 可以很薄，但必须能看出 token 将被第十九刀的 `runner intake lane / runner intake receiving strip` 接住
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`candidate body seam` -> `pre-runner readiness seam` -> `runner handoff token / runner intake stub` -> 当前链路最小暴露”，不是“宿主已经完成完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`”
- 如果当前链路只能证明 pre-runner readiness seam 已存在，却不能证明其后已经出现 runner handoff token，则不应判定第十八刀 done

## 8. 越界控制

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 action candidate runner 一起做进来
- 没有把完整 runner intake lane 或完整 runner intake receiving strip 一起做进来
- 没有把完整 executor 或执行调度器一起做进来
- 没有把完整 action lifecycle 一起做进来
- 没有把完整 action candidate 一并做成最终版本
- 没有把完整 action candidate body、candidate detail 或 candidate schema 一并做成最终版本
- 没有把完整 runner handoff、runner intake 或 execution handoff 一并做成最终版本
- 没有把完整 candidate 选择 / 排序 / 执行策略一并做进来
- 没有把完整 preflight / readiness / policy 校验矩阵一并做进来
- 没有把完整 execution、完整 result object、结果收口、错误恢复或重试协议一并做进来
- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把最终 schema、最终 rule table、最终 protocol、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第十八刀写成“完整 runner 或完整执行链已经成立”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“pre-runner readiness seam 之后、完整 runner / intake 执行之前的第一枚 runner handoff token 已经站住”，不是“runner、执行器或 action lifecycle 顺手做完”。

## 9. 哪些情况算还没做完

出现下面任一情况，都应判定为 **not-done**：

- `pre-runner readiness seam / runner-facing pre-edge` 之后仍然没有独立的最小 runner handoff token，或只是 pre-runner readiness seam 的换名说法
- 名义上有 runner handoff token，但实际只是说“未来这里会接 runner”，没有更明确的 runner intake stub 和最小挂接关系
- 当前链路仍然只暴露 pre-runner readiness seam，没有暴露 seam 之后的更明确最小 `runner handoff token / runner intake stub`
- runner handoff token 与 candidate body seam、pre-runner readiness seam、runner intake lane、完整 runner 之间的职责边界仍然混在一起
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 runner、完整 executor、完整 action lifecycle、完整 action candidate、完整 execution result、完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table / protocol 一起写进来了
- runner handoff token 接口已经被硬写成“未来最终 runner 协议必须如此”的强约束
- runner intake stub 已经承担 runner 调度、执行、重试、生命周期推进或结果收口职责
- 代码虽然能跑，但职责混写到第十九刀已无法自然接入最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`

这类情况的共同特征是：

- 要么 pre-runner readiness seam 之后的最小 runner handoff token 没立住
- 要么 `pre-runner readiness seam -> runner handoff token / runner intake stub` 的最小接线没立住
- 要么当前链路对 runner handoff token 的最小暴露没立住
- 要么已经把第十九刀甚至更后面的 runner / executor / action lifecycle / execution result / recover / resume / hydrate 对象提前绑死

## 10. 哪些情况虽然粗糙但已经 done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `pre-runner readiness seam / runner-facing pre-edge` 之后的最小 runner handoff token 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式 token 成立
- seam 之后的最小 `runner intake stub / execution handoff pre-entry` 已真实存在，哪怕目前字段很少，只够表达“这片 readiness seam 先交给这枚 runner handoff token”
- 当前链路目前只负责把 runner handoff token 暴露出来和返回最小状态，还没有承担正式 runner 构造、runner intake lane、执行调度、生命周期推进或恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 token 挂接闭环验证
- 当前 candidate body seam、pre-runner readiness seam、runner handoff token、runner intake stub 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 action candidate、完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`
- 当前实现已经能证明“pre-runner readiness seam”“runner handoff token”“runner intake stub”是相邻但不同的窄层，而不是同一层换名字
- 当前 runner handoff token 只是为第十九刀留下最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam` 的下一窄入口，而不是提前决定第十九刀的完整 runner intake 结构

换句话说，只要“runner handoff token 站出来了、token 和 pre-runner readiness seam 分开了、当前链路暴露 runner handoff token 了、越界忍住了”，即使还不精细，也足够进入第十九刀。

## 11. 第十八刀完成后的第十九刀进入条件

第十八刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第十九刀：

- 第十八刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `candidate body seam / candidate detail intake`、`pre-runner readiness seam / runner-facing pre-edge`、`runner handoff token / runner intake stub / execution handoff pre-entry` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到最小 `runner intake lane / runner intake receiving strip / execution-intake-facing seam`，而不是回头重写第十六刀、第十七刀或第十八刀，或直接跳去完整 action candidate runner / 完整 executor / 完整 action lifecycle / 完整 `recover / resume / hydrate`

满足这些条件后，第十九刀才适合进入例如：

- 最小 runner intake lane
- 最小 runner intake receiving strip
- execution-intake-facing seam
- `runner handoff token / runner intake stub` 之后、但仍然不是完整 runner / executor / action lifecycle 的下一小段

这里的关键不是“第十九刀一次做多大”，而是：

- 第十八刀已经证明 pre-runner readiness seam 之后、完整 runner / intake 执行之前的第一枚 runner handoff token 是成立的
- 第十九刀可以从 runner handoff token 再往内收，而不是回头补 pre-runner readiness seam，也不是直接宣布完整 runner、完整 executor、完整 action lifecycle 或完整恢复动作层完成

## 12. 一个很小的 done / not-done 边界图

```text
done
  candidate body seam 之后已站住 pre-runner readiness seam / runner-facing pre-edge
  pre-runner readiness seam 之后已站住 runner handoff token / runner intake stub / execution handoff pre-entry
  当前链路已明确暴露“runner handoff token 已存在”的事实
  runner handoff token 与 pre-runner readiness seam 已拆开，不互相冒充
  runner intake stub 只是最小接手壳，不是完整 runner intake lane
  整条最小桥接链可在窄场景下走通
  接口仍是最小 runner handoff pre-entry，不是最终 runner / executor / action lifecycle / schema / protocol / rule table 定稿
  完整 action candidate / runner / executor / execution / result / recover / resume / hydrate 尚未越界写入
  第十九刀入口被留下为 runner intake lane / runner intake receiving strip / execution-intake-facing seam

not-done
  pre-runner readiness seam 之后的最小 runner handoff token 仍不存在，或只是 readiness seam 的换名说法
  当前链路仍只暴露 pre-runner readiness seam，不暴露 runner handoff token
  runner handoff token 仍然没有最小挂接关系
  只有命名，没有 runner intake stub 或 execution handoff pre-entry
  为了“完整”提前把完整 runner、executor、action lifecycle、完整 action candidate、execution result 或后续恢复动作层一起写死
  借 runner handoff token 冻结最终 schema、rule table、protocol 或字段全集
```

## 13. 最终判定口径

第十八刀是否完成，可以收敛成下面这句验收口径：

- 当 `candidate body seam / candidate detail intake / candidate-body-facing edge` 之后的最小 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 已经成立，且 pre-runner readiness seam 之后、完整 runner / intake 执行之前的第一枚极窄 `runner handoff token / runner intake stub / execution handoff pre-entry` 也已经成立，当前链路能够明确暴露“runner handoff token 已存在”的事实，同时实现没有越界吞掉完整 action candidate、完整 runner、完整 executor、完整 action lifecycle、完整 execution / result、完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 pre-runner readiness seam，没有 runner handoff token”“runner handoff token 只是 pre-runner readiness seam 的换名说法”“一做 runner intake stub 就直接偷跑完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`”，都不应算完成。
