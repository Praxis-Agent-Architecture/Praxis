# agentCore 第十七实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第十七实施切片完成判定清单**。

它只回答一个问题：

- 第十七刀“`candidate body seam / candidate detail intake` 之后、完整 runner 之前的最小 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`”，做到什么程度，才算这一刀已经完成，可以进入第十八刀

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第十七实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终目录树设计稿
- 最终 schema、最终 rule table 或最终 protocol 的定稿文
- 完整 action candidate 的完成声明
- 完整 action candidate runner 的完成声明
- 完整 executor、action lifecycle 或结果收口的完成声明
- 完整 `recover`、完整 `resume` 或完整 `hydrate` 动作层的完成声明

因此，这份文档的用途不是扩大第十七刀，而是给第十七刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

白话讲，它只帮团队判断：

- 第十六刀自然固定的最小 `candidate body seam / candidate detail intake / candidate-body-facing edge` 之后，是否已经真实长出一片完整 runner 之前的最小 readiness seam
- 这片 seam 是否已经能单独被当前链路暴露出来
- 它是否仍然保持“小切片、强边界、非最终定稿”，没有偷跑成完整 runner、执行器、action lifecycle、完整 action candidate、完整 `recover / resume / hydrate` 或最终协议定稿

## 2. 对应切片

本文对应的第十七实施切片是：

- `candidate body seam / candidate detail intake` 之后，更接近第一个 runner handoff、但仍位于完整 runner 之前的最小 `pre-runner readiness seam`
- 或等价的最小 `runner-facing pre-edge / candidate execution readiness precheck`

白话讲，这一刀只验收一件事：

- 第十六刀已经站住的 candidate body seam / candidate detail intake 之后，是否已经继续向内长出一个真实独立的 runner 前 readiness seam；当前链路是否已经能暴露“pre-runner readiness seam 已存在”，而不是只停留在“有 candidate body seam / candidate detail intake”的更外一层说法

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
```

这里验收的是“candidate body seam 之后的最小 pre-runner readiness seam 是否真实独立成立”，不是“完整 runner、完整执行器、完整 action lifecycle、完整 action candidate 或完整 `recover / resume / hydrate` 是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `candidate body seam / candidate detail intake / candidate-body-facing edge` 之后是否已经真实站住一个独立的 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck`，而不是继续停留在“已经有 candidate body seam”的描述层
2. `candidate shell / pre-ack / first candidate shell entry`、`candidate body seam / candidate detail intake`、`pre-runner readiness seam / runner-facing pre-edge` 这三者是否已经明确分层，而不是继续混成一层
3. 当前链路是否已经明确暴露“pre-runner readiness seam 已存在”的事实，而不是只暴露“candidate body seam / candidate detail intake 已存在”
4. 是否克制住了越界实现，没有把完整 runner、完整 executor、完整 action lifecycle、完整 action candidate、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

第十七刀的核心不是“能执行”，而是“candidate body seam 之后、完整 runner 之前的最小 readiness seam 已经真实独立成立”。

## 4. 完成判定项

以下各项全部满足，才算第十七刀完成：

- `candidate body seam / candidate detail intake` 之后已经作为独立窄层存在，不再只是 candidate body seam 的一句附带说明
- `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 明确位于 candidate body seam 与第一个完整 runner 之间
- 当前链路已经能最小暴露“pre-runner readiness seam 已存在”，而不是只暴露“candidate body seam 已存在”
- 当前实现至少能从命名和责任上看出：谁负责 candidate shell，谁负责 candidate body seam / candidate detail intake，谁负责 runner 前 readiness seam，谁还没有开始承担完整 runner 或 executor
- 当前 readiness seam 只表达“候选执行前是否已经具备最小交接准备”的前置边，不承担 runner 调度、执行、重试、生命周期推进或结果收口职责
- 当前 `candidate execution readiness precheck` 只能是 runner 前的极窄预检信号，不能扩写成完整 preflight 矩阵、完整 policy evaluator、完整 action candidate validator 或完整 execution planner
- 当前实现没有借“先跑起来”为理由，把第十七刀重新收缩成一个完整 action runner、一个执行器、一个完整 action lifecycle 或一个大恢复协调器
- 当前验证可以很轻，但至少要证明这片 readiness seam 不是纸面概念，而是在最小链路里被接到和被暴露

## 5. 结构判定

以下各项全部满足，才算结构上过线：

- `candidate shell / pre-ack / first candidate shell entry`、`candidate body seam / candidate detail intake / candidate-body-facing edge`、`pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 已经明确分层
- `pre-runner readiness seam` 不能反向退化成 candidate body seam 的别名，也不能正向冒充完整 runner 的别名
- `runner-facing pre-edge` 只负责让“runner 前已经有一片可被交接的 readiness 边”成立，不负责让 runner、executor、action lifecycle、执行策略或结果协议定型
- `candidate execution readiness precheck` 不能吞掉 candidate body seam 的内容接线职责，也不能吞掉 runner 的执行职责
- 当前结构允许 stub、placeholder、极窄 happy-path 或单一路径成立，但必须能看出“candidate body seam -> pre-runner readiness seam”是一条更内侧的最小过渡
- 当前结构没有把 `candidate shell -> candidate body seam -> pre-runner readiness seam -> runner handoff` 这条自然递进压扁成一层
- 当前结构不要求第十八刀必须沿用某个最终类名、最终目录树、最终状态枚举、最终 rule table 或最终 runner 协议，只要求第十八刀能从 readiness seam 继续往 runner handoff token 收

## 6. 接口边界判定

以下各项全部满足，才算接口边界上过线：

- 对外暴露的是“candidate body seam 之后、完整 runner 之前最小先落到哪片 readiness seam”的窄边界，而不是完整 runner 出口
- `candidate body seam -> pre-runner readiness seam` 的最小过渡，只表达“这片 candidate body / detail intake 现在先交给这个 runner 前 readiness seam”，不表达完整执行协议
- 当前链路暴露的是“candidate body seam 已成立且其后已经开始出现最小 pre-runner readiness seam”的事实，而不是越层直抓 future runner、executor、action lifecycle、`recover`、`resume`、`hydrate` 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 candidate schema、最终 runner schema、最终 action lifecycle protocol、最终字段全集或最终枚举全集
- 当前接口已经给第十八刀留出自然入口：第一个极窄 runner handoff token、runner intake stub 或 execution handoff pre-entry
- 当前接口没有要求第十八刀必须实现完整 runner、完整 executor、完整 action lifecycle、完整结果对象或完整恢复动作收口

## 7. 最小桥接链判定

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `action-candidate-pre-edge / minimal action-candidate sightline`，会交给第一个极窄 candidate shell / pre-ack / first candidate shell entry
- 第一个极窄 candidate shell 已经真实承担“pre-edge 之后最小先立哪个候选壳”的职责，而不是纯纸面占位
- candidate shell 一旦成立，已经会继续交给 shell 之后的最小 `candidate body seam / candidate detail intake`
- candidate body seam 一旦成立，已经会继续交给 body seam 之后、完整 runner 之前的最小 `pre-runner readiness seam / runner-facing pre-edge`
- 当前链路已经能够暴露 pre-runner readiness seam，而不是只停在“candidate shell 已存在”或“candidate body seam 已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`candidate shell` -> `candidate body seam / candidate detail intake` -> `pre-runner readiness seam` -> 当前链路最小暴露”，不是“宿主已经完成完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`”
- 如果当前链路只能证明 candidate body seam 已存在，却不能证明其后已经出现 runner-facing pre-edge，则不应判定第十七刀 done

## 8. 越界控制

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 action candidate runner 一起做进来
- 没有把完整 executor 或执行调度器一起做进来
- 没有把完整 action lifecycle 一起做进来
- 没有把完整 action candidate 一并做成最终版本
- 没有把完整 action candidate body、candidate detail 或 candidate schema 一并做成最终版本
- 没有把完整 runner handoff、runner intake 或 execution handoff 一并做成最终版本
- 没有把完整 candidate 选择 / 排序 / 执行策略一并做进来
- 没有把完整 preflight / readiness / policy 校验矩阵一并做进来
- 没有把完整结果对象、结果收口、错误恢复或重试协议一并做进来
- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把最终 schema、最终 rule table、最终 protocol、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第十七刀写成“完整 runner 或完整执行链已经成立”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“candidate body seam 之后、完整 runner 之前的最小 pre-runner readiness seam 已经站住”，不是“候选执行层或 runner 顺手做完”。

## 9. 哪些情况算还没做完

出现下面任一情况，都应判定为 **not-done**：

- `candidate body seam / candidate detail intake` 之后仍然没有独立的最小 pre-runner readiness seam，或只是 candidate body seam 的换名说法
- 名义上有 runner-facing pre-edge，但实际只是说“未来这里会接 runner”，没有更明确的 runner 前 readiness seam 和最小挂接关系
- 当前链路仍然只暴露 candidate body seam，没有暴露 body seam 之后的更明确最小 `pre-runner readiness seam / runner-facing pre-edge`
- pre-runner readiness seam 与 candidate shell、candidate body seam、candidate detail intake、runner handoff 之间的职责边界仍然混在一起
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 runner、完整 executor、完整 action lifecycle、完整 action candidate、完整 `recover`、完整 `resume`、完整 `hydrate` 或最终 schema / rule table / protocol 一起写进来了
- pre-runner readiness seam 接口已经被硬写成“未来最终 runner 协议必须如此”的强约束
- candidate execution readiness precheck 已经承担 runner 调度、执行、重试、生命周期推进或结果收口职责
- 代码虽然能跑，但职责混写到第十八刀已无法自然接入第一个极窄 runner handoff token、runner intake stub 或 execution handoff pre-entry

这类情况的共同特征是：

- 要么 candidate body seam 之后的最小 pre-runner readiness seam 没立住
- 要么 `candidate shell -> candidate body seam -> pre-runner readiness seam` 的最小接线没立住
- 要么当前链路对 pre-runner readiness seam 的最小暴露没立住
- 要么已经把第十八刀甚至更后面的 runner / executor / action lifecycle 对象提前绑死

## 10. 哪些情况虽然粗糙但已经 done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `candidate body seam / candidate detail intake` 之后的最小 pre-runner readiness seam 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式 seam 成立
- body seam 之后的最小 `runner-facing pre-edge` 已真实存在，哪怕目前字段很少，只够表达“这片 candidate body seam 先交给这片 runner 前 readiness seam”
- 当前链路目前只负责把 pre-runner readiness seam 暴露出来和返回最小状态，还没有承担正式 runner 构造、执行调度、生命周期推进或恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 readiness seam 挂接闭环验证
- 当前 candidate shell、candidate body seam、candidate detail intake、pre-runner readiness seam 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 action candidate、完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`
- 当前实现已经能证明“candidate shell”“candidate body seam / detail intake”“pre-runner readiness seam”是三层，而不是同一层换名字
- 当前 pre-runner readiness seam 只是为第十八刀留下第一个极窄 runner handoff token、runner intake stub 或 execution handoff pre-entry 的下一窄入口，而不是提前决定第十八刀的完整 runner 结构

换句话说，只要“pre-runner readiness seam 站出来了、readiness seam 和 candidate body seam 分开了、当前链路暴露 readiness seam 了、越界忍住了”，即使还不精细，也足够进入第十八刀。

## 11. 第十七刀完成后的第十八刀进入条件

第十七刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第十八刀：

- 第十七刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `candidate shell / pre-ack / first candidate shell entry`、`candidate body seam / candidate detail intake / candidate-body-facing edge`、`pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到第一个极窄 runner handoff token、runner intake stub 或 execution handoff pre-entry，而不是回头重写第十五刀、第十六刀或第十七刀，或直接跳去完整 action candidate runner / 完整 executor / 完整 action lifecycle / 完整 `recover / resume / hydrate`

满足这些条件后，第十八刀才适合进入例如：

- 第一个极窄 runner handoff token
- 第一个 runner intake stub
- execution handoff pre-entry
- `pre-runner readiness seam / runner-facing pre-edge` 之后、但仍然不是完整 runner 的下一小段

这里的关键不是“第十八刀一次做多大”，而是：

- 第十七刀已经证明 candidate body seam 之后、完整 runner 之前的最小 readiness seam 是成立的
- 第十八刀可以从 pre-runner readiness seam 再往内收，而不是回头补 candidate body seam，也不是直接宣布完整 runner、完整 executor、完整 action lifecycle 或完整恢复动作层完成

## 12. 一个很小的 done / not-done 边界图

```text
done
  action-candidate-pre-edge 之后已站住 candidate shell / pre-ack / first candidate shell entry
  candidate shell 之后已站住 candidate body seam / candidate detail intake / candidate-body-facing edge
  candidate body seam 之后已站住 pre-runner readiness seam / runner-facing pre-edge
  当前链路已明确暴露“pre-runner readiness seam 已存在”的事实
  pre-runner readiness seam 与 candidate body seam 已拆开，不互相冒充
  整条最小桥接链可在窄场景下走通
  接口仍是最小 runner 前 readiness seam，不是最终 runner / executor / action lifecycle / schema / protocol / rule table 定稿
  完整 action candidate / runner / executor / recover / resume / hydrate 尚未越界写入
  第十八刀入口被留下为 runner handoff token / runner intake stub / execution handoff pre-entry

not-done
  candidate body seam 之后的最小 pre-runner readiness seam 仍不存在，或只是 body seam 的换名说法
  当前链路仍只暴露 candidate body seam，不暴露 pre-runner readiness seam
  pre-runner readiness seam 仍然没有最小挂接关系
  只有命名，没有 runner 前 readiness seam
  为了“完整”提前把完整 runner、executor、action lifecycle、完整 action candidate 或后续恢复动作层一起写死
  借 readiness precheck 冻结最终 schema、rule table、protocol 或字段全集
```

## 13. 最终判定口径

第十七刀是否完成，可以收敛成下面这句验收口径：

- 当 `action-candidate-pre-edge / minimal action-candidate sightline` 之后的第一个极窄 `candidate shell / pre-ack / first candidate shell entry` 已经成立，candidate shell 之后的最小 `candidate body seam / candidate detail intake / candidate-body-facing edge` 已经成立，且 candidate body seam 之后、完整 runner 之前的最小 `pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck` 也已经成立，当前链路能够明确暴露“pre-runner readiness seam 已存在”的事实，同时实现没有越界吞掉完整 action candidate、完整 runner、完整 executor、完整 action lifecycle、完整 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 candidate body seam，没有 pre-runner readiness seam”“pre-runner readiness seam 只是 candidate body seam 的换名说法”“一做 readiness precheck 就直接偷跑完整 runner、完整 executor、完整 action lifecycle 或完整 `recover / resume / hydrate`”，都不应算完成。
