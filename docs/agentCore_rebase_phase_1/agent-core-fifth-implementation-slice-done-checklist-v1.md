# agentCore 第五实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第五实施切片完成判定清单**。

它只回答一个问题：

- 第五刀 `acceptance / ack result` 最小正式邻域 + 最小 `downstream handoff / downstream consumption` 邻域 + 当前桥接层对这组更窄邻域的消费改口径，做到什么程度，才算这一刀已经完成，可以进入第六刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第五实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终 rule table 或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第五刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第五实施切片是：

- `acceptance / ack result` 最小正式邻域
- 最小 `downstream handoff / downstream consumption` 邻域
- 当前桥接层对这组更窄邻域的桥接消费

白话讲，这一刀只验收一件事：

- 第四刀留下的 `cursor advancement recognition result`，是否已经继续收紧成“宿主接受/确认后留下的更具体结果”的最小正式邻域；这个更具体结果外侧，是否已经站住一个最小可继续下交的 handoff / consumption 邻域；并且当前桥接层是否已经开始消费这组更窄邻域，而不是继续直接拿 `recognition result` 当下游交付面

也就是至少能形成下面这条最小桥接链：

```text
cursor advancement recognition result
  -> acceptance / ack result 最小正式邻域
  -> downstream handoff / downstream consumption 最小邻域
  -> 当前桥接层消费更窄的 acceptance 后结果邻域
```

这里验收的是“更具体结果层和最小下交壳是否站住”，不是“完整 acceptance / ack 协议、完整 downstream adapter、完整 `recover` / `resume` / `hydrate` 或最终协议是否一起做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `acceptance / ack result` 是否已经从 `recognition result` 里真实收紧成独立最小正式邻域，而不是继续停留在换名结果壳或顺手尾态
2. 最小 `downstream handoff / downstream consumption` 邻域是否已经作为 `acceptance / ack result` 外侧的独立窄层存在，而不是继续并回结果本体或直接偷换成完整下游动作
3. 当前桥接层是否已经消费“`acceptance / ack result` + 最小 handoff 邻域”，而不是继续直接消费 `recognition result`，或自己重做 acceptance / ack 判断
4. 是否克制住了越界实现，没有把 `recover`、`resume`、`hydrate`、最终 rule table、最终 schema 或最终目录树一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `acceptance / ack result` 已经作为独立最小正式邻域存在，不再只是 `cursor advancement recognition result` 的换名尾态
- 最小 `downstream handoff / downstream consumption` 邻域已经作为 `acceptance / ack result` 外侧的独立窄层存在，不再只是结果对象里的一句描述
- 当前桥接层已经以桥接者身份消费第五刀结果邻域，而不是重新吞掉 acceptance / ack 边界构建或 handoff 邻域产出的职责
- 当前实现至少能从命名和责任上看出：谁负责 `acceptance / ack result` 最小正式邻域，谁负责最小 handoff 邻域，谁负责上位桥接消费
- 当前实现没有借“先跑起来”为理由，把第五刀重新收缩成一个大 acceptance 函数、一个大 handoff 函数或一个大 coordinator 函数

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `acceptance / ack result` 对外暴露的是“宿主接受/确认后留下的最小可继续下交结果面”或等价载体，而不是把整个 `recognition result` 原样下传
- 最小 `downstream handoff / downstream consumption` 邻域对外暴露的是“这份 acceptance 后结果已可继续下交”的最小交接面，或等价载体，而不是完整 downstream adapter、完整动作协议或完整运行态恢复出口
- 当前桥接层消费的是“`acceptance / ack result` + 最小 handoff 邻域”，而不是自己重做 acceptance / ack 判断，或越层直抓 recognition / advancement / replay 内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 acceptance / ack 条件全集、最终 rule table、最终 result schema、最终 protocol 或最终字段全集
- 当前接口已经给第六刀更明确的下游最小消费挂点留出自然入口

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `cursor advancement recognition result` 出口，会交给 `acceptance / ack result` 最小正式邻域消费
- `acceptance / ack result` 当前即使只支持极窄 happy-path，也已经真实承担“宿主接受/确认后留下哪份更具体结果”的最小正式职责，而不是纯纸面占位
- acceptance 一旦成立，已经会留下一个最小 `downstream handoff / downstream consumption` 邻域，或等价的交接壳
- 当前桥接层已经消费上述 acceptance 后结果邻域，而不是只接收“已经 recognition”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“recognition result -> acceptance / ack result -> handoff 邻域 -> 当前桥接消费”，不是“宿主已经完成 recover / resume / hydrate”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把完整 acceptance / ack 条件集合一起做进来
- 没有把完整 acceptance / ack rule table 一起做进来
- 没有把最终 `acceptance / ack result` schema、最终 serialization、最终 DSL、最终 JSON 字段名或最终枚举名一起定稿
- 没有把完整 downstream handoff protocol 或完整 downstream consumption 流一起做进来
- 没有把 `recover` 真正收口逻辑一起做进来
- 没有把 `resume` 真正续接逻辑一起做进来
- 没有把 `hydrate` 真正灌回逻辑一起做进来
- 没有为了“先完整一点”而把最终目录树、最终 adapter 拓扑或最终运行态恢复出口一并定稿

一句话说，这一刀要的是“acceptance 后更具体结果 + 最小下交壳到位”，不是“后半条恢复动作链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `acceptance / ack result` 仍然只是名字变了，本质上还是 `recognition result` 的换名结果壳或 coordinator 顺手产物
- 名义上有 `downstream handoff / downstream consumption` 邻域，但实际只是结果对象里附一句“之后可继续消费”，没有独立交接面
- 当前桥接层仍然只吃 `recognition result`，没有改成消费 acceptance 后更窄邻域
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 acceptance / ack 条件、完整 downstream protocol、`recover`、`resume`、`hydrate` 或最终 schema / rule table 一起写进来了
- `acceptance / ack result` 或 handoff 接口已经被硬写成“未来最终协议必须如此”的强约束
- 代码虽然能跑，但职责混写到第六刀已无法自然接入

这类情况的共同特征是：

- 要么 acceptance 后更具体结果层没立住
- 要么最小 handoff 邻域没立住
- 要么当前桥接消费没改口径
- 要么已经把第六刀甚至更后面的对象提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第六刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `acceptance / ack result` 已真实存在，哪怕目前只支持极窄 happy-path、单一路径接受/确认或 placeholder 式边界成立
- 最小 `downstream handoff / downstream consumption` 邻域已真实存在，哪怕目前字段很少，只够表达“这份结果现在可继续下交”
- 当前桥接层目前只负责桥接消费和返回最小状态，还没有承担正式 downstream 动作收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 acceptance 后桥接闭环验证
- 当前 `acceptance / ack result` 与 handoff 邻域都明显不是最终协议，但已经不再冒充 `recognition result` 整体或完整 downstream 动作出口
- 当前实现已经能证明“承认后结果壳”“宿主接受/确认后的更具体结果”“这份结果外侧最小下交壳”是三层，而不是同一层换名字

换句话说，只要“更具体结果拆出来了、最小下交壳接上了、当前桥接消费改口径了、越界忍住了”，即使还不精细，也足够进入第六刀。

## 7. 第五刀完成后的第六刀进入条件

第五刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第六刀：

- 第五刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `acceptance / ack result`、最小 `downstream handoff / downstream consumption` 邻域、当前桥接消费三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到“更明确的下游最小消费挂点”，而不是回头重写第五刀，或直接跳去完整 `recover` / `resume` / `hydrate`

满足这些条件后，第六刀才适合进入例如：

- 更明确的 downstream 最小消费挂点
- 对 `acceptance / ack result` 的更窄下游消费入口

这里的关键不是“第六刀一次做多大”，而是：

- 第五刀已经证明 acceptance 后更具体结果、最小 handoff 邻域和当前桥接消费之间的最小关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  recognition result 已交出 acceptance / ack result 最小正式邻域
  acceptance / ack result 外侧已站住最小 downstream handoff / consumption 邻域
  当前桥接层已消费 acceptance 后更窄邻域，而不是继续直接消费 recognition result
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳，不是最终 schema / 最终 rule table / 最终 protocol 定稿
  recover / resume / hydrate / 最终目录树 尚未越界写入

not-done
  acceptance / ack result 仍只是 recognition result 换名
  handoff / consumption 仍不存在或只是结果对象里的附带描述
  当前桥接层仍直接吃 recognition result
  只有命名，没有最小接线
  为了“完整”提前把 downstream 动作层和后续恢复链一起写死
```

## 9. 最终判定口径

第五刀是否完成，可以收敛成下面这句验收口径：

- 当 `acceptance / ack result` 已经作为 `cursor advancement recognition result` 之后的独立最小正式邻域成立，`downstream handoff / downstream consumption` 已经作为其外侧的最小交接邻域成立，且当前桥接层已经消费这组更窄邻域而没有越界吞掉 `recover`、`resume`、`hydrate` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“`recognition result` 直接冒充下游交付面”“acceptance 之后没有独立结果层”“一做 handoff 就直接偷跑完整恢复动作”，都不应算完成。
