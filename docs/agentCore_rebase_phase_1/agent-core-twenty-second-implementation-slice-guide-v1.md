# agentCore 第二十二实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第二十二实施切片指南**。

它只回答一类问题：

- 如果第二十一刀已经完成，第二十二轮最小实现应先接哪一小段
- 这一小段的边界应该压到多小，才不会把完整 executor、execution scheduler、action lifecycle、execution attempt body、attempt result、result layer、完整 `recover`、完整 `resume`、完整 `hydrate`、最终 schema、最终 rule table 或最终 protocol 一起提前做掉
- 做完这一刀之后，第二十三刀最自然该接到哪里

本文**不是**：

- 新 baseline
- 任一 formal baseline 的替代品
- 第二十一刀指南或完成清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 runner 或 executor 设计稿
- 最终 execution scheduler、action lifecycle、execution attempt body 或 result layer 设计稿
- 最终 `recover / resume / hydrate` 动作层设计稿
- 最终 schema、最终 rule table、最终 protocol 定稿
- 最终 TypeScript 目录树、类名、状态枚举、动作类树、字段枚举或目录树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第二十一刀做完之后，第二十二刀先落哪一小段”收敛成一个可执行建议。

白话讲，第二十二刀不是让 executor 真正跑起来，也不是产生执行结果，而是在第二十一刀已经站住的 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后，先补一片**完整 executor 运行之前的极窄 execution attempt shell / executor invocation shell / runner call boundary**。它只表达“第一次执行尝试或调用壳可以被立住”，但不真正执行、不产生 attempt result、不进入 action lifecycle、不收结果。

## 2. 为什么它自然接在第二十一刀之后

第二十一刀已经把执行前门闩之后、真正 executor 调用之前的分发前沿站住：

```text
pre-execution latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
```

第二十一刀解决的是：

- `pre-execution latch / runner pre-execution gate` 之后，不再只是“已经准备分发”
- 当前链路已经能最小形成一个面向执行调用边界的 `runner dispatch token`
- `executor-call stub` 可以先作为真正 executor 调用之前的极窄落点
- 但它仍然不进入 executor invocation shell，不建立 execution attempt shell，不调用 executor，不产生 result

第二十一刀刻意不会回答下面这些问题：

- dispatch token 之后，是否已经可以立住一个“第一次执行尝试”的外壳
- executor-call stub 是否已经能进入 runner call boundary，但不真正调用 executor
- execution attempt shell 与 execution attempt body、attempt result、action lifecycle 应该怎样分开
- runner call boundary 是否可以独立被看见，但不承担执行、重试、取消、超时、rollback 或结果收口

白话讲，第二十一刀让“执行前门闩之后已经出现一个分发令牌和调用空壳”站住；第二十二刀最自然就是继续问：**这枚 dispatch token 已经抵达 call stub 之后，能不能先立一个极窄调用边界，让系统知道第一次执行尝试的壳已经出现，但还没有进入真正执行。**

如果这一步不先补，后面很容易出现两种混写：

- 一看见 `executor-call stub`，就直接把完整 executor invocation、execution attempt body、action lifecycle、result layer 和恢复动作收口一起做掉
- 第二十三刀只能同时补 attempt shell、executor entry、attempt intake、执行体、结果层和恢复动作入口，导致边界变粗

所以，第二十二刀最自然不是回头重写第二十一刀，也不是直接启动 executor，而是先把 **`execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后、完整 executor 运行之前的最小 `execution attempt shell / executor invocation shell / runner call boundary`** 站住。

## 3. 第二十二刀依赖哪些上位文档 / 边界文档

第二十二刀不是凭空起一层，它至少依赖下面这些文档与并行前置假设。

### 3.1 `agent-core-twenty-first-implementation-slice-guide-v1.md`

这份文档负责给第二十二刀提供**直接起点**。

它支撑第二十二刀的方式是：

- 明确第二十一刀只做到 `execution dispatch pre-edge / runner dispatch token / executor-call stub`
- 明确第二十一刀不是 execution attempt shell，不是 executor invocation shell，不是完整 executor，也不是结果收口
- 帮助第二十二刀确认自己不是补 pre-execution latch 或 dispatch token，而是在 dispatch token 之后继续向调用边界收束

白话讲，没有第二十一刀的 runner dispatch token，第二十二刀就会失去“为什么现在可以谈 runner call boundary”的施工起点。

### 3.2 `agent-core-twenty-first-implementation-slice-done-checklist-v1.md`

这份文档负责给第二十二刀提供**进入条件**。

它支撑第二十二刀的方式是：

- 要求第二十一刀已经能暴露“execution dispatch pre-edge 已存在”
- 要求 `runner intake lane`、`pre-execution latch`、`execution dispatch pre-edge` 已经分层
- 明确第二十二刀入口是最小 `execution attempt shell / executor invocation shell / runner call boundary`
- 防止第二十二刀回头把 executor-call stub 改名成 attempt shell，却没有新增独立调用边界

白话讲，第二十二刀必须建立在“分发前沿真的站住了”之上，而不是替第二十一刀补课。

### 3.3 `agent-core-recovery-chain-implementation-landing-map-v1.md`

这份文档负责给第二十二刀提供**实现落位感**。

它支撑第二十二刀的方式是：

- 提醒第二十二刀仍然处在恢复链后段、候选执行之前到执行入口之前的极窄桥接区域
- 帮助第二十二刀只落到 execution attempt shell，而不是直接铺完整 executor 或执行调度器
- 防止第二十二刀把“调用壳已经出现”误写成“恢复动作已经开始执行并产出结果”

### 3.4 `agent-core-recovery-chain-structure-map-v1.md`

这份文档负责给第二十二刀提供**链路位置感与越界控制**。

它支撑第二十二刀的方式是：

- 帮助第二十二刀继续沿恢复链路逐层向内收，而不是把 dispatch token、call boundary、attempt body、result layer 压成一层
- 帮助区分 `executor-call stub`、`execution attempt shell`、`executor-entry receiving seam`、`execution attempt body` 这些相邻但不同的问题域
- 防止第二十二刀把调用边界写成完整 action lifecycle 或最终 execution protocol 的入口定稿

### 3.5 `agent-core-runtime-resume-recover-hydrate-formal-baseline-v1.md`

这份文档负责给第二十二刀提供**`recover / resume / hydrate` 的正式边界上限**。

它支撑第二十二刀的方式是：

- 提醒 `recover` 偏找回，`resume` 偏续接，`hydrate` 偏灌回，三者不是同义词
- 明确第二十二刀仍然不是完整 `recover / resume / hydrate` 的动作实现
- 防止 execution attempt shell 被误写成恢复动作本体、续接策略本体或灌回逻辑本体

白话讲，第二十二刀最多说明“恢复相关候选已经可以立一个执行尝试或 executor 调用的外壳”，不能说恢复动作已经被 executor 执行，也不能说结果已经回灌。

## 4. 当前建议的第二十二刀是什么

### 4.1 切片名称

建议把第二十二刀收敛成：

**`execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后、完整 executor 运行之前的最小 `execution attempt shell / executor invocation shell / runner call boundary`**

也可以白话地叫成：

**分发令牌之后、真正执行之前的第一次执行尝试壳 / executor 调用壳 / runner 调用边界**

这里的关键词是：

- `execution attempt shell`
- `executor invocation shell`
- `runner call boundary`
- `executor-call stub` 之后的最小执行尝试外壳

它不是完整 executor，不是 execution scheduler，不是 execution attempt body，不是 action lifecycle，不是 attempt result，也不是 result layer。

### 4.2 这一刀的最小组合

这一刀建议只包含下面三件事：

1. 在第二十一刀固定的 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后，最小承认“runner 可以立住一个即将进入 executor 调用的 attempt shell 或 invocation shell”
2. 让当前链路结构上能看出：dispatch token 之后不是直接执行，而是先进入一个完整 executor 运行之前的极窄 runner call boundary
3. 给第二十三刀留下自然入口：attempt shell 之后的最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`

它对应的最小主线可以先压成：

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
  -> candidate shell 之后的最小 candidate body seam / candidate detail intake / candidate-body-facing edge
  -> candidate detail intake 之后、完整 runner 之前的最小 pre-runner readiness seam / runner-facing pre-edge / candidate execution readiness precheck
  -> pre-runner readiness seam 之后的最小 runner handoff token / runner intake stub / execution handoff pre-entry
  -> runner handoff token 之后、完整 runner 执行前的最小 runner intake lane / runner intake receiving strip / execution-intake-facing seam
  -> runner intake receiving strip 之后、真正 runner execution 之前的最小 pre-execution latch / execution readiness latch / runner pre-execution gate
  -> pre-execution latch 之后、真正 executor 调用之前的最小 execution dispatch pre-edge / runner dispatch token / executor-call stub
  -> dispatch pre-edge 之后、完整 executor 运行之前的最小 execution attempt shell / executor invocation shell / runner call boundary
```

这里的关键不是把第二十二刀做成 execution attempt body，而是先把：

- 第二十一刀已经站住的最小 execution dispatch pre-edge / runner dispatch token / executor-call stub
- dispatch token 之后、完整 executor 运行之前的最小 execution attempt shell / executor invocation shell
- 当前链路对 runner call boundary 的最小暴露

这三者真实拆开。

## 5. 第二十二刀包含什么

第二十二刀建议只包含下面这些内容。

### 5.1 execution attempt shell 的最小承认点

它只负责一件事：

- 在 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后，承认“第一次执行尝试可以先有一个外壳”

第二十二刀里，它应该做到：

- 明确 execution attempt shell 位于 executor-call stub 与 executor-entry receiving seam 之间
- 明确它回答的是“分发令牌之后，是否已经能立住第一次执行尝试的外框”
- 让当前实现结构上能看出：它是 dispatch token 内侧的下一窄层，不是 dispatch token 的换名
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径 attempt shell 成立

第二十二刀里，它不需要做到：

- 执行 attempt body
- 产生 attempt result
- 调用真实 executor
- 建立 retry、cancel、timeout、rollback 或 result 收口协议
- 推进 action lifecycle

### 5.2 executor invocation shell 的最小承认点

它只负责一件事：

- 让 execution attempt shell 有一个极窄的 executor invocation shell 落点，但这个 shell 还不能真正执行 executor

第二十二刀里，它应该做到：

- 存在一个最小 invocation shell 概念，用来承认“下一层会进入 executor 入口接收边”
- 这个 invocation shell 可以只是 carrier、marker、placeholder、stub result 或命名清晰的过渡对象
- 当前链路能区分“invocation shell 已存在”和“executor 已经运行”
- 当前链路能区分“attempt shell 已存在”和“attempt result 已经产生”

第二十二刀里，它不需要做到：

- 真实选择或调度 executor 实例
- 真实调用 executor
- 处理 executor 返回值
- 分配最终 attempt id 规则
- 建立最终 executor adapter
- 建立最终 execution protocol

### 5.3 runner call boundary 的最小暴露

它只负责一件事：

- 当前链路要能最小暴露“runner call boundary 已存在”，而不是只暴露“executor-call stub 已存在”

第二十二刀里，它应该做到：

- 有一条从 executor-call stub 到 attempt shell / invocation shell 的最小桥接关系
- 暴露口径只说明“已经抵达 runner 调用边界”，不说明“executor 已经开始执行”
- 验证时可以只证明 attempt shell / invocation shell 被构造、被返回、被记录或被链路看见
- 命名上避免把 `shell` 写成 `body`，避免把 `invocation shell` 写成 `invocation result`

第二十二刀里，它不需要做到：

- 执行 action
- 推进 action lifecycle 状态
- 产生 execution attempt body
- 产生 attempt result 或 result object
- 写定最终 runner/executor 协议

## 6. 第二十二刀不包含什么

第二十二刀必须明确不包含下面这些内容：

- 不实现完整 executor
- 不实现完整 executor adapter、provider adapter 或真实外部调用封装
- 不实现完整 execution scheduler
- 不实现 execution attempt body
- 不生成 attempt result
- 不进入 action lifecycle
- 不推进 action state、action transition 或 action completion
- 不建立 result layer、result collection、result protocol 或 result persistence
- 不建立 retry、cancel、timeout、rollback、compensation 或 recovery closure 协议
- 不实现完整 `recover`
- 不实现完整 `resume`
- 不实现完整 `hydrate`
- 不冻结最终 schema、最终 rule table、最终 protocol、最终 serialization / DSL / JSON 字段名或最终字段枚举
- 不冻结最终 TypeScript 类树、目录树、模块边界或导出面
- 不替第二十三刀写完 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`

一句话说，第二十二刀要的是“调用壳已经站住”，不是“执行已经发生”。

## 7. 与第二十一刀 / 第二十三刀的边界

### 7.1 与第二十一刀的边界

第二十一刀的终点是：

```text
execution dispatch pre-edge / runner dispatch token / executor-call stub
```

它回答的是：

- pre-execution latch 之后，是否已经能形成面向 executor 调用边界的最小分发前沿
- runner dispatch token 是否已经能独立站住
- executor-call stub 是否能作为真正 executor 调用之前的极窄落点

第二十二刀的起点就是这个终点。

第二十二刀不要回头重写：

- `runner intake lane / runner intake receiving strip`
- `pre-execution latch / execution readiness latch / runner pre-execution gate`
- `execution dispatch pre-edge / runner dispatch token / executor-call stub`

第二十二刀只在它们之后新增一层：

```text
execution attempt shell / executor invocation shell / runner call boundary
```

白话讲，第二十一刀是“已经拿到调度令牌”；第二十二刀是“令牌已经走到第一次调用壳门口”。二者不能互相冒充。

### 7.2 与第二十三刀的边界

第二十二刀的终点建议是：

```text
execution attempt shell / executor invocation shell / runner call boundary
```

第二十三刀的自然入口应留给：

```text
execution attempt intake / invocation receiving edge / executor-entry receiving seam
```

第二十三刀才应该回答：

- attempt shell 之后，executor 入口侧是否已经有最小 receiving edge
- invocation shell 是否已经被 executor-entry seam 接住
- executor-entry receiving seam 是否可以独立暴露，但仍不替完整 executor body、attempt body 或 result layer 定稿

第二十二刀不要替第二十三刀写完：

- executor-entry receiving seam
- execution attempt intake
- invocation receiving edge
- executor 入口接收后的执行体
- attempt result 或 result 收口

白话讲，第二十二刀只把“门框”立起来；第二十三刀再接“门内侧第一条接收边”。第二十二刀不要直接把门内的房间装修完。

## 8. 与 recover / resume / hydrate 的关系

第二十二刀仍然在 `recover / resume / hydrate` 的正式动作层之外。

它和三者的关系可以这样理解：

- `recover` 偏“找回”：第二十二刀不负责找回策略，只承认找回后形成的候选可能抵达调用壳
- `resume` 偏“续接”：第二十二刀不负责续接策略，只承认续接链路可能形成第一次调用壳
- `hydrate` 偏“灌回”：第二十二刀不负责把状态灌回运行时，只承认后续可能需要 executor-entry seam 来接住调用壳

第二十二刀可以说：

- 当前恢复链路已经能最小表达“准备进入第一次执行尝试的外壳”
- 这层 shell 可以承载来自 recover/resume/hydrate 语义上游的极窄调用意图
- 这层 shell 不等于 recover/resume/hydrate 的动作执行完成

第二十二刀不能说：

- recover 动作已经执行
- resume 续接已经完成
- hydrate 灌回已经完成
- executor 已经执行并返回结果
- 恢复动作结果已经进入 result layer

## 9. 与 runner / executor 的关系

第二十二刀要继续保持 runner 与 executor 的边界清楚。

runner 侧在这一刀里最多承担：

- 接住第二十一刀留下的 runner dispatch token
- 形成一个最小 runner call boundary
- 把 executor-call stub 推进到 execution attempt shell
- 暴露“调用壳已存在”的最小事实

executor 侧在这一刀里最多承担：

- 被 invocation shell 指向
- 作为下一层 executor-entry receiving seam 的方向
- 保持未运行、未返回、未产出 result 的状态

runner 侧在这一刀里不能承担：

- 完整 execution scheduler
- 完整 action lifecycle manager
- 完整 retry/cancel/timeout coordinator
- 完整 result collector

executor 侧在这一刀里不能承担：

- 真实执行 action
- 真实生成 attempt result
- 真实处理外部 provider 返回值
- 真实执行恢复动作体

白话讲，runner 在第二十二刀里只是把“要调用”的壳摆出来；executor 在第二十二刀里只是作为“下一步入口方向”被看见，还不能真的工作。

## 10. 最小桥接链

第二十二刀完成后，最小桥接链应至少能被描述成：

```text
runner intake lane / runner intake receiving strip
  -> pre-execution latch / execution readiness latch / runner pre-execution gate
  -> execution dispatch pre-edge / runner dispatch token / executor-call stub
  -> execution attempt shell / executor invocation shell / runner call boundary
```

这里每一层都要保持独立：

- `runner intake lane` 负责接住 handoff token
- `pre-execution latch` 负责闩住执行前准备
- `execution dispatch pre-edge` 负责形成执行分发前沿
- `execution attempt shell` 负责立住第一次执行尝试或 executor 调用的外壳

最小桥接链不要求：

- executor-entry receiving seam 已完成
- execution attempt body 已完成
- action lifecycle 已完成
- attempt result 已完成
- result layer 已完成
- recover/resume/hydrate 动作层已完成

最小桥接链只要求：

- 第二十一刀的 dispatch token 可以继续进入 attempt shell
- attempt shell 与 dispatch token 不互相冒充
- attempt shell 与 executor-entry receiving seam 不互相冒充
- 当前链路能最小暴露“runner call boundary 已存在”

## 11. 推荐实施顺序

第二十二刀的真实实施建议按下面顺序推进。

1. 先确认第二十一刀 done 条件仍成立

确认点包括：

- `execution dispatch pre-edge` 已经真实独立存在
- `runner dispatch token` 与 `pre-execution latch` 已分层
- `executor-call stub` 没有偷跑成完整 executor invocation

2. 再定义极窄 attempt shell 责任

这个责任只应表达：

- dispatch token 之后已经出现第一次执行尝试外壳
- 这层 shell 可以被 runner call boundary 暴露
- 这层 shell 不执行、不返回、不收口

3. 再接一条最小桥接关系

桥接关系只应是：

```text
executor-call stub
  -> execution attempt shell / executor invocation shell
```

它不应越层写成：

```text
executor-call stub
  -> executor runs
  -> attempt result
```

4. 再暴露 runner call boundary 的最小事实

验证或导出口径只应说明：

- 当前链路已经抵达 runner call boundary
- 当前链路已经能看见 attempt shell / invocation shell
- 当前链路还没有进入 executor-entry receiving seam

5. 最后检查越界项

必须确认没有提前写入：

- executor body
- attempt body
- attempt result
- action lifecycle
- result layer
- recover/resume/hydrate 完整动作
- 最终 schema / rule table / protocol

## 12. 最小验证方式

第二十二刀的验证可以非常轻，但必须能证明这一刀不是纸面概念。

推荐的最小验证口径是：

- 能从最小链路触发到 `execution attempt shell / executor invocation shell / runner call boundary`
- 能证明这个 shell 是在 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后出现的
- 能证明当前没有真实调用 executor
- 能证明当前没有产生 attempt result
- 能证明当前没有推进 action lifecycle
- 能证明当前没有冻结最终 schema、rule table、protocol 或字段枚举

如果未来有代码实现，可以用 smoke 级验证、stub 驱动验证或最小链路快照验证。这里的 smoke 是“冒烟测试”，白话讲就是只点一下最短路径，看关键壳层是否能被触发和暴露，不做完整系统测试。

文档层面的验证则可以先检查：

- 是否有明确的第二十一刀输入边界
- 是否有明确的第二十二刀新增边界
- 是否有明确的第二十三刀保留入口
- 是否反复声明不执行、不产 result、不进 lifecycle
- 是否没有把最终协议或目录树写死

## 13. done-enough

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `execution dispatch pre-edge / runner dispatch token / executor-call stub` 之后已经真实出现最小 execution attempt shell
- attempt shell 与 dispatch token 已经明确分层，不再只是同一层换名字
- executor invocation shell 已经能作为“下一步会进入 executor-entry receiving seam”的极窄方向存在
- runner call boundary 已经能被当前链路最小暴露
- 当前链路没有真实调用 executor
- 当前链路没有产生 attempt result
- 当前链路没有推进 action lifecycle
- 当前链路没有建立完整 result layer
- 当前链路没有把 recover/resume/hydrate 完整动作层提前做掉
- 当前实现仍允许后续调整最终 schema、rule table、protocol、目录树、字段枚举和 TypeScript 类树

换句话说，只要“调用壳站出来了、调用壳和 dispatch token 分开了、当前链路暴露 runner call boundary 了、越界忍住了”，即使还不精细，也足够进入第二十三刀。

## 14. not-done

出现下面任一情况，都应判定为 **not-done**：

- `executor-call stub` 之后仍然没有独立的 execution attempt shell，或只是把 executor-call stub 改了一个名字
- 名义上有 executor invocation shell，但实际已经开始真实调用 executor
- 当前链路仍然只暴露 execution dispatch pre-edge，没有暴露其后的 runner call boundary
- attempt shell 与 attempt body、attempt result、action lifecycle 混在一起
- executor invocation shell 已经承担 executor adapter、provider adapter、result collector 或 retry coordinator 职责
- 为了让链路显得完整，提前把完整 executor、execution scheduler、action lifecycle、execution attempt body、result layer 或完整 recover/resume/hydrate 一起写进来了
- attempt shell 接口已经被硬写成“未来最终 executor call protocol 必须如此”的强约束
- 当前结构让第二十三刀无法自然接入 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`

这类情况的共同特征是：

- 要么 dispatch token 之后的最小调用壳没立住
- 要么调用壳和真正执行混在一起
- 要么当前链路对 runner call boundary 的最小暴露没立住
- 要么已经把第二十三刀甚至更后面的 executor-entry receiving seam、execution attempt body、attempt result、result layer 或恢复动作层提前绑死

## 15. 反模式

第二十二刀尤其要避免下面这些反模式。

- 把 `execution attempt shell` 写成完整 `execution attempt`
- 把 `executor invocation shell` 写成真实 `executor invocation`
- 把 `runner call boundary` 写成完整 runner execution protocol
- 把“第一次执行尝试壳”写成“第一次执行尝试已经完成”
- 为了省事直接产生 attempt result
- 为了可验证直接调用 mock executor，并把 mock executor 当成这一刀的一部分
- 把 retry/cancel/timeout/rollback 放进 attempt shell
- 把 action lifecycle 的状态推进塞进 runner call boundary
- 把 result collection 或 result persistence 放进 invocation shell
- 把 recover/resume/hydrate 的完整动作执行塞进 execution attempt shell
- 提前冻结最终 schema、rule table、protocol、目录树、字段枚举或 TypeScript 类树
- 用“未来会需要这些字段”为理由，把第二十三刀、第二十四刀甚至结果层字段提前写死

白话讲，第二十二刀最怕的不是做少，而是为了看起来完整，把真正执行、结果和恢复收口一起偷跑。

## 16. 第二十二刀后的第二十三刀入口

第二十二刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第二十三刀：

- 第二十二刀的 done-enough 判定项已经满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `execution dispatch pre-edge`、`execution attempt shell`、`executor-entry receiving seam` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到最小 `execution attempt intake / invocation receiving edge / executor-entry receiving seam`

满足这些条件后，第二十三刀才适合进入例如：

- attempt shell 之后、但仍然不是完整 executor 运行的最小 execution attempt intake
- executor invocation shell 之后的第一条 receiving edge
- `runner call boundary` 之后、但仍然不是完整 execution attempt body 的 executor-entry receiving seam

这里的关键不是“第二十三刀一次做多大”，而是：

- 第二十二刀已经证明 dispatch token 之后、完整 executor 运行之前的最小 execution attempt shell 是成立的
- 第二十三刀可以从 attempt shell 再往 executor-entry receiving seam 方向收，而不是回头补 dispatch token，也不是直接宣布完整 executor、execution scheduler、action lifecycle、execution attempt body、attempt result、result layer 或完整恢复动作层完成

## 17. 最终判定口径

第二十二刀是否完成，可以收敛成下面这句验收口径：

- 当 `execution dispatch pre-edge / runner dispatch token / executor-call stub` 已经成立，且其后、完整 executor 运行之前的最小 `execution attempt shell / executor invocation shell / runner call boundary` 也已经成立，当前链路能够明确暴露“runner call boundary 已存在”的事实，同时实现没有越界吞掉完整 executor、execution scheduler、action lifecycle、execution attempt body、attempt result、result layer、完整 recover、resume、hydrate 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“只有 dispatch token，没有 attempt shell”“attempt shell 只是 executor-call stub 的换名说法”“一做 invocation shell 就直接偷跑 executor、attempt body、attempt result、action lifecycle、result layer 或完整 recover / resume / hydrate”，都不应算完成。
