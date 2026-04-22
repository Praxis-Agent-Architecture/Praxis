# agentCore 第二十三实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第二十三实施切片完成判定清单**。

它只回答一个问题：

- 第二十三刀“`execution attempt shell / executor invocation shell / runner call boundary` 之后、真正执行体之前的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`”，做到什么程度，才算这一刀已经完成，可以进入第二十四刀

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第二十三实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终目录树设计稿
- 最终 schema、最终 rule table 或最终 protocol 的定稿文
- 完整 executor 的完成声明
- 完整 execution scheduler 的完成声明
- 完整 execution attempt body、result、recover、resume 或 hydrate 的完成声明
- 完整 action lifecycle 的完成声明
- 完整执行体已经可生产运行的声明

因此，这份文档的用途不是扩大第二十三刀，而是给第二十三刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

白话讲，它只帮团队判断：

- 第二十二刀自然固定的最小 `execution attempt shell / executor invocation shell / runner call boundary` 之后，是否已经真实长出一个执行尝试接收边
- 这个 `execution attempt intake / invocation receiving edge / executor-entry receiving seam` 是否已经能独立站住，并且和 attempt shell / invocation shell 分开
- 当前链路是否已经能暴露“execution attempt intake 已存在”，而不是只停留在“attempt shell / invocation shell 已存在”
- 它是否仍然保持“小切片、强边界、非最终定稿”，没有偷跑成完整 executor、execution scheduler、action lifecycle、execution attempt body、result、recover、resume、hydrate 或最终协议定稿

## 2. 对应切片

本文对应的第二十三实施切片是：

- `execution attempt shell / executor invocation shell / runner call boundary` 之后，更靠近真正执行体、但仍位于完整 executor 运行体和完整 execution attempt body 之前的最小 `execution attempt intake`
- 或等价的最小 `invocation receiving edge / executor-entry receiving seam`

白话讲，这一刀只验收一件事：

- 第二十二刀已经站住的 execution attempt shell / executor invocation shell / runner call boundary 之后，是否已经继续向内长出一个真实独立的 receiving edge；当前链路是否已经能暴露“execution attempt intake 已存在”，而不是只停留在“有 execution attempt shell / executor invocation shell / runner call boundary”的更外一层说法

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
  -> readiness seam 之后、完整 runner intake 之前的最小 runner handoff token / runner intake stub / execution handoff pre-entry
  -> handoff token / intake stub 之后、完整 runner 执行之前的最小 runner intake lane / runner intake receiving strip / execution-intake-facing seam
  -> runner intake lane 之后、真正执行分发之前的最小 pre-execution latch / execution readiness latch / runner pre-execution gate
  -> pre-execution latch 之后、真正 executor 调用之前的最小 execution dispatch pre-edge / runner dispatch token / executor-call stub
  -> dispatch pre-edge 之后、真正执行体之前的最小 execution attempt shell / executor invocation shell / runner call boundary
  -> attempt shell 之后、真正执行体之前的最小 execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

这里验收的是“attempt shell 之后的最小 execution attempt intake 是否真实独立成立”，不是“完整 executor、完整 execution scheduler、完整 action lifecycle、execution attempt body、result、recover、resume、hydrate 或最终 schema 是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `execution attempt shell / executor invocation shell / runner call boundary` 之后是否已经真实站住一个独立的 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`，而不是继续停留在“已经有 execution attempt shell / executor invocation shell / runner call boundary”的描述层
2. `execution dispatch pre-edge / executor-call stub`、`execution attempt shell / executor invocation shell / runner call boundary`、`execution attempt intake / invocation receiving edge / executor-entry receiving seam` 这三者是否已经明确分层，而不是把“准备调用”“调用壳”“接收边”混成一层
3. 当前链路是否已经明确暴露“execution attempt intake 已存在”的事实，而不是只暴露“execution attempt shell / executor invocation shell / runner call boundary 已存在”
4. 是否克制住了越界实现，没有把完整 executor、execution scheduler、action lifecycle、execution attempt body、result、recover、resume、hydrate、最终 rule table、最终 schema 或最终 protocol 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

第二十三刀的核心不是“执行体已经运行”，而是“execution attempt shell / executor invocation shell / runner call boundary 之后、真正执行体之前的最小 intake receiving edge 已经真实独立成立”。

## 4. 完成判定项

以下各项全部满足，才算第二十三刀完成：

- `execution attempt intake / invocation receiving edge / executor-entry receiving seam` 已经作为独立窄层存在，不再只是 attempt shell 或 invocation shell 的一句附带说明
- `execution attempt intake` 明确位于 `execution attempt shell / executor invocation shell / runner call boundary` 与真正 execution attempt body / executor run body 之间
- 当前链路已经能最小暴露“execution attempt intake 已存在”，而不是只暴露“execution attempt shell / executor invocation shell / runner call boundary 已存在”
- 当前实现至少能从命名和责任上看出：谁负责 attempt shell / invocation shell，谁负责 execution attempt intake，谁还没有开始承担完整 executor、execution scheduler、action lifecycle、execution attempt body 或 result 收口
- 当前 invocation receiving edge 只表达“调用壳之后已经出现一个面向执行体接收的最小边”，不能承担完整执行调度、重试、生命周期推进、结果生成或错误恢复职责
- 当前 executor-entry receiving seam 只能是进入执行体之前的极窄 seam，不能扩写成完整 executor adapter、完整 run body、完整 execution attempt、完整 result protocol 或完整 action lifecycle manager
- 当前实现没有借“已经进入 executor 入口”为理由，把第二十三刀重新收缩成一个完整 executor、一个执行调度器、一个 action lifecycle 或一个大恢复协调器
- 当前验证可以很轻，但至少要证明这条 execution attempt intake 不是纸面概念，而是在最小链路里被接到和被暴露

## 5. 结构判定

以下各项全部满足，才算结构上过线：

- `execution dispatch pre-edge / runner dispatch token / executor-call stub`、`execution attempt shell / executor invocation shell / runner call boundary`、`execution attempt intake / invocation receiving edge / executor-entry receiving seam` 已经明确分层
- `execution attempt intake` 不能反向退化成 attempt shell 或 invocation shell 的别名，也不能正向冒充完整 execution attempt body、完整 executor run body 或完整 action lifecycle 的别名
- `invocation receiving edge` 只负责让“调用壳之后已经出现一个可接收但尚未运行执行体的窄边”成立，不负责让 executor、execution scheduler、action lifecycle、result protocol 或恢复协议定型
- `executor-entry receiving seam` 不能吞掉更外侧的 dispatch pre-edge、executor-call stub、attempt shell 职责，也不能吞掉更内侧的 execution attempt body pre-edge、executor run-body preface 或 attempt operation seam 职责
- 当前结构允许 stub、placeholder、极窄 happy-path 或单一路径成立，但必须能看出“attempt shell -> execution attempt intake”是一条更内侧的最小过渡
- 当前结构没有把 `execution dispatch pre-edge -> execution attempt shell -> execution attempt intake -> execution attempt body pre-edge` 这条自然递进压扁成一层
- 当前结构不要求第二十四刀必须沿用某个最终类名、最终目录树、最终状态枚举、最终 rule table 或最终 execution protocol，只要求第二十四刀能从 execution attempt intake 继续往最小 execution attempt body pre-edge 收

## 6. 接口边界判定

以下各项全部满足，才算接口边界上过线：

- 对外暴露的是“execution attempt shell / executor invocation shell / runner call boundary 之后、真正执行体之前最小先落到哪条 intake receiving edge”的窄边界，而不是完整 executor 入口或完整 execution attempt body
- `execution attempt shell / executor invocation shell / runner call boundary -> execution attempt intake / invocation receiving edge / executor-entry receiving seam` 的最小过渡，只表达“这份调用壳现在先形成一个执行尝试接收边”，不表达完整执行协议
- 当前链路暴露的是“execution attempt shell 已成立且其后已经开始出现最小 execution attempt intake”的事实，而不是越层直抓 future executor、execution scheduler、action lifecycle、execution attempt body、result、recover、resume、hydrate 的内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 executor schema、最终 execution attempt schema、最终 action lifecycle protocol、最终 result protocol、最终字段全集或最终枚举全集
- 当前接口已经给第二十四刀留出自然入口：最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`
- 当前接口没有要求第二十四刀必须实现完整 executor、完整 execution scheduler、完整 action lifecycle、完整 execution attempt body、完整结果对象或完整恢复动作收口

## 7. 最小桥接链判定

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `execution dispatch pre-edge / runner dispatch token / executor-call stub`，会交给真正执行体之前的最小 `execution attempt shell / executor invocation shell / runner call boundary`
- 最小 `execution attempt shell / executor invocation shell / runner call boundary` 已经真实承担“executor-call stub 之后、attempt intake 之前最小先形成调用壳”的职责，而不是纯纸面占位
- attempt shell 一旦成立，已经会继续交给第一个极窄 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`
- execution attempt intake 一旦成立，当前链路已经能够暴露 execution attempt intake，而不是只停在“execution dispatch pre-edge 已存在”或“execution attempt shell 已存在”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可以是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“`execution dispatch pre-edge` -> `execution attempt shell` -> `execution attempt intake` -> 当前链路最小暴露”，不是“宿主已经完成完整 executor、execution scheduler、action lifecycle、execution attempt body / result 或完整 recover / resume / hydrate”
- 如果当前链路只能证明 attempt shell / invocation shell 已存在，却不能证明其后已经出现 execution attempt intake，则不应判定第二十三刀 done

## 8. 越界控制

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 executor 一起做进来
- 没有把完整 executor run body 一并做成最终版本
- 没有把完整 execution scheduler 或执行调度器一起做进来
- 没有把完整 executor adapter、provider adapter 或真实外部调用封装一起做进来
- 没有把完整 action lifecycle 一起做进来
- 没有把完整 execution attempt body 一起做进来
- 没有把完整 result 或 result collection 一起做进来
- 没有把完整 retry、cancel、timeout、rollback 或恢复动作收口协议一并做进来
- 没有把完整 `recover` 动作层一起做进来
- 没有把完整 `resume` 续接逻辑一起做进来
- 没有把完整 `hydrate` 灌回逻辑一起做进来
- 没有把最终 schema、最终 rule table、最终 protocol、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第二十三刀写成“完整 executor 已经进入 run body、完整 execution attempt body 已经成立、完整 action lifecycle 已经开始推进”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“attempt shell 之后、真正执行体之前的最小 intake receiving edge 已经站住”，不是“executor 或执行体顺手做完”。

## 9. not-done

出现下面任一情况，都应判定为 **not-done**：

- `execution attempt shell / executor invocation shell / runner call boundary` 之后仍然没有独立的最小 execution attempt intake，或只是 attempt shell / invocation shell 的换名说法
- 名义上有 invocation receiving edge，但实际只是说“未来这里会运行 executor”，没有更明确的 intake receiving edge 和最小挂接关系
- 当前链路仍然只暴露 execution attempt shell，没有暴露其后的更明确最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`
- execution attempt intake 与 execution dispatch pre-edge、executor-call stub、attempt shell、invocation shell、execution attempt body pre-edge 之间的职责边界仍然混在一起
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 executor、完整 execution scheduler、完整 action lifecycle、完整 execution attempt body、完整 result、完整 recover、完整 resume、完整 hydrate 或最终 schema / rule table / protocol 一起写进来了
- invocation receiving edge 接口已经被硬写成“未来最终 executor entry protocol 必须如此”的强约束
- executor-entry receiving seam 已经承担真实 executor run、调度、重试、生命周期推进、结果生成或结果收口职责
- 代码虽然能跑，但职责混写到第二十四刀已无法自然接入最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`

这类情况的共同特征是：

- 要么 attempt shell 之后的最小 execution attempt intake 没立住
- 要么 `execution dispatch pre-edge -> execution attempt shell -> execution attempt intake` 的最小接线没立住
- 要么当前链路对 execution attempt intake 的最小暴露没立住
- 要么已经把第二十四刀甚至更后面的 execution attempt body、executor run body、attempt operation、result 或恢复动作层提前绑死

## 10. done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `execution attempt shell / executor invocation shell / runner call boundary` 之后的最小 execution attempt intake 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接手或 placeholder 式接收边成立
- attempt shell 之后的最小 `invocation receiving edge / executor-entry receiving seam` 已真实存在，哪怕目前字段很少，只够表达“这份 invocation shell 结果先形成一个执行体接收边”
- 当前链路目前只负责把 execution attempt intake 暴露出来和返回最小状态，还没有承担正式 executor run body、执行调度、生命周期推进、结果收口或恢复动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 execution attempt intake 挂接闭环验证
- 当前 execution dispatch pre-edge、executor-call stub、execution attempt shell、executor invocation shell、execution attempt intake、invocation receiving edge、executor-entry receiving seam 都明显不是最终协议，但已经不再互相冒充，也不再冒充完整 executor、完整 action lifecycle、完整 execution attempt body / result 或完整 recover / resume / hydrate
- 当前实现已经能证明“executor-call stub”“execution attempt shell”“execution attempt intake”是三层，而不是同一层换名字
- 当前 execution attempt intake 只是为第二十四刀留下最小 execution attempt body pre-edge、executor run-body preface 或 attempt operation seam 的下一窄入口，而不是提前决定第二十四刀的完整执行体结构、最终 executor 协议或最终动作生命周期

换句话说，只要“execution attempt intake 站出来了、receiving edge 和 attempt shell 分开了、当前链路暴露 execution attempt intake 了、越界忍住了”，即使还不精细，也足够进入第二十四刀。

## 11. 第二十三刀完成后的第二十四刀进入条件

第二十三刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第二十四刀：

- 第二十三刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `execution dispatch pre-edge / executor-call stub`、`execution attempt shell / executor invocation shell / runner call boundary`、`execution attempt intake / invocation receiving edge / executor-entry receiving seam` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到最小 `execution attempt body pre-edge / executor run-body preface / attempt operation seam`，而不是回头重写第二十一刀、第二十二刀或第二十三刀，或直接跳去完整 executor / execution scheduler / action lifecycle / result / 完整 recover / resume / hydrate

满足这些条件后，第二十四刀才适合进入例如：

- execution attempt intake 之后、但仍然不是完整执行尝试体的最小 execution attempt body pre-edge
- 面向 executor run body 的第一条极窄 preface
- `invocation receiving edge / executor-entry receiving seam` 之后、但仍然不是完整 executor run body 的下一小段

这里的关键不是“第二十四刀一次做多大”，而是：

- 第二十三刀已经证明 attempt shell 之后、真正执行体之前的最小 execution attempt intake 是成立的
- 第二十四刀可以从 execution attempt intake 再往 executor run-body preface 方向收，而不是回头补 attempt shell，也不是直接宣布完整 executor、完整 execution scheduler、完整 action lifecycle、完整 execution attempt body / result 或完整恢复动作层完成

## 12. done / not-done 图

```text
done
  execution dispatch pre-edge 之后已站住 execution attempt shell / executor invocation shell / runner call boundary
  attempt shell 之后已站住 execution attempt intake / invocation receiving edge / executor-entry receiving seam
  当前链路已明确暴露“execution attempt intake 已存在”的事实
  execution attempt intake 与 attempt shell / invocation shell 已拆开，不互相冒充
  execution attempt intake 与完整 executor run body / execution attempt body 已拆开，不提前冒充执行体入口
  整条最小桥接链可在窄场景下走通
  接口仍是最小 executor-entry receiving seam，不是最终 executor / action lifecycle / schema / protocol / rule table 定稿
  完整 executor / execution scheduler / action lifecycle / execution attempt body / result / recover / resume / hydrate 尚未越界写入
  第二十四刀入口被留下为 execution attempt body pre-edge / executor run-body preface / attempt operation seam

not-done
  attempt shell 之后的最小 execution attempt intake 仍不存在，或只是 shell / invocation shell 的换名说法
  当前链路仍只暴露 execution attempt shell，不暴露 execution attempt intake
  invocation receiving edge 仍然没有最小挂接关系
  只有命名，没有真正执行体之前的 executor-entry receiving seam
  为了“完整”提前把完整 executor、execution scheduler、action lifecycle、execution attempt body、result 或后续恢复动作层一起写死
  借 executor-entry receiving seam 冻结最终 schema、rule table、protocol 或字段全集
```

## 13. 最终判定口径

第二十三刀是否完成，可以收敛成下面这句验收口径：

- 当 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后的最小 `execution attempt shell / executor invocation shell / runner call boundary` 已经成立，且 attempt shell 之后、真正执行体之前的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam` 也已经成立，当前链路能够明确暴露“execution attempt intake 已存在”的事实，同时实现没有越界吞掉完整 executor、完整 execution scheduler、完整 action lifecycle、完整 execution attempt body、完整 result、完整 recover、resume、hydrate 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 execution attempt shell，没有 execution attempt intake”“execution attempt intake 只是 attempt shell / invocation shell 的换名说法”“一做 executor-entry receiving seam 就直接偷跑完整 executor、execution scheduler、action lifecycle、execution attempt body、result 或完整 recover / resume / hydrate”，都不应算完成。
