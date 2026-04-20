# agentCore 第四实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第四实施切片完成判定清单**。

它只回答一个问题：

- 第四刀 `cursor advancement recognition` 最小正式边界 + `cursor advancement recognition result` 最小结果邻域，做到什么程度，才算这一刀已经完成，可以进入第五刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第四实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终算法或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第四刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第四实施切片是：

- `cursor advancement recognition` 最小正式边界
- `cursor advancement recognition result` 最小结果邻域
- 上位协调面对这组更窄结果邻域的桥接消费

白话讲，这一刀只验收一件事：

- 第三刀留下的 `recognition` 最小挂点，是否已经继续收紧成独立正式边界；边界成立后，是否已经留下一个最小可继续消费的 `recognition result` 邻域；并且上位协调面是否已经开始以协调者身份消费这组更窄邻域

也就是至少能形成下面这条最小桥接链：

```text
cursor advancement result
  -> cursor advancement recognition 最小正式边界
  -> cursor advancement recognition result 最小结果邻域
  -> 上位协调面消费更窄的 recognition 后结果邻域
```

这里验收的是“正式边界和最小结果邻域是否站住”，不是“`acceptance / ack result`、`hydrate`、`resume` 或最终协议是否完整做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `cursor advancement recognition` 是否已经从第三刀的“最小挂点”真实收紧成独立正式边界，而不是继续停留在命名层或顺手逻辑层
2. `cursor advancement recognition result` 是否已经作为 recognition 之后留下的最小结果邻域存在，而不是继续并回 `recognition` 整体或 `cursor advancement result` 整体
3. 上位协调面是否已经消费“recognition 正式边界 + recognition result 最小邻域”，而不是继续只认挂点存在或自己重做承认判断
4. 是否克制住了越界实现，没有把 `acceptance / ack result`、`hydrate`、`resume`、最终 rule table 或最终 schema 一起写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `cursor advancement recognition` 已经作为独立最小正式边界存在，不再只是第三刀里的挂点别名
- `cursor advancement recognition result` 已经作为独立最小结果邻域存在，不再只是 recognition 内部尾态或 coordinator 私有返回值
- 上位协调面已经以协调者身份消费第四刀结果邻域，而不是重新吞掉 recognition boundary builder 或 recognition result producer 的职责
- 当前实现至少能从命名和责任上看出：谁负责 recognition 正式边界，谁产出 recognition result，谁负责上位桥接消费
- 当前实现没有借“先跑起来”为理由，把第四刀重新收缩成一个大 recognition 函数或一个大 coordinator 函数

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `cursor advancement recognition` 对外暴露的是“推进结果跨过承认边界的最小正式面”或等价载体，而不是第三刀挂点语义的换名复用
- `cursor advancement recognition result` 对外暴露的是“承认之后留下的最小可继续消费结果面”或等价载体，而不是把整个 `cursor advancement result` 原样下传
- 上位协调面消费的是“recognition 正式边界 + recognition result 最小邻域”，而不是自己重做 recognition 判断，或越层直抓 replay / advancement 内部细节
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 schema、最终字段全集、最终 acceptance / ack 条件集合或最终 rule table
- 当前接口已经给第五刀的 `acceptance / ack result` 最小正式邻域留出自然挂点

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `cursor advancement result` 出口，会交给 `cursor advancement recognition` 最小正式边界消费
- `recognition` 当前即使只支持极窄 happy-path，也已经真实承担“推进结果何时算被承认”的最小正式职责，而不是纯纸面占位
- recognition 一旦成立，已经会留下一个最小 `cursor advancement recognition result` 或等价结果壳
- 上位协调面已经消费上述 recognition 后结果邻域，而不是只接收“recognition 有入口”这种更早一级的接线事实
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是文档上说未来可以接
- 当前最小链路的闭环重点是“advancement result -> recognition 正式边界 -> recognition result -> 上位桥接消费”，不是“宿主已经完成 acceptance / hydrate / resume”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把 `acceptance / ack result` 全层一起做进来
- 没有把完整 acceptance / ack 条件集合或完整 rule table 一起做进来
- 没有把 `hydrate` 真正灌回逻辑一起做进来
- 没有把 `resume` 真正续接逻辑一起做进来
- 没有为了“先完整一点”而把最终 recognition schema、最终 recognition result schema、最终 serialization / DSL / JSON 字段名或最终目录树一并定稿
- 没有把第四刀写成“宿主最终承认协议已经完成”，而仍然保持在 phase_1 的小切片边界内

一句话说，这一刀要的是“recognition 正式边界 + recognition result 最小邻域到位”，不是“后半条接受/确认与恢复链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `cursor advancement recognition` 仍然只是名字变了，本质上还是第三刀挂点或 coordinator 顺手判断
- 名义上有 `cursor advancement recognition result`，但实际只是把 `cursor advancement result` 换名下传，或仍然藏在 recognition 内部没有独立结果面
- 上位协调面仍然只吃“recognition 已接线”或“推进已被判断”的信号，没有消费 recognition 后更窄结果邻域
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把 `acceptance / ack result`、`hydrate`、`resume` 或最终 schema / rule table 一起写进来了
- recognition 或 recognition result 接口已经被硬写成“未来最终协议必须如此”的强约束
- 代码虽然能跑，但职责混写到第五刀已无法自然接入

这类情况的共同特征是：

- 要么正式边界没立住
- 要么 recognition result 没立住
- 要么上位桥接消费没立住
- 要么已经把第五刀甚至更后面的对象提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第五刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `cursor advancement recognition` 已真实存在，哪怕目前只支持极窄 happy-path、单一路径承认或 placeholder 式边界成立
- `cursor advancement recognition result` 已真实存在，哪怕目前字段很少，只够表达“承认之后留下的最小可消费结果面”
- 上位协调面目前只负责桥接消费和返回最小状态，还没有承担正式 acceptance / ack 收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小 recognition 闭环验证
- 当前 recognition 正式边界和 recognition result 邻域都明显不是最终协议，但已经不再冒充第三刀挂点或 advancement result 整体
- 当前实现已经能证明“recognition 边界”和“recognition 后结果”是两层，而不是同一层换名字

换句话说，只要“正式边界拆出来了、recognition result 接上了、上位消费改口径了、越界忍住了”，即使还不精细，也足够进入第五刀。

## 7. 第四刀完成后的第五刀进入条件

第四刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第五刀：

- 第四刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `cursor advancement recognition`、`cursor advancement recognition result`、上位协调消费三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到 `acceptance / ack result` 最小正式邻域，而不是回头重写第四刀，或直接跳去 `hydrate` / `resume`

满足这些条件后，第五刀才适合进入例如：

- `acceptance / ack result` 最小正式邻域

这里的关键不是“第五刀一次做多大”，而是：

- 第四刀已经证明 recognition 正式边界、recognition result 邻域和上位桥接消费之间的最小关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  cursor advancement recognition 已从最小挂点收紧成正式边界
  recognition 已交出 cursor advancement recognition result 最小结果邻域
  上位协调面已消费 recognition 后更窄结果邻域
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳，不是最终 schema / 最终 rule table 定稿
  acceptance / ack result / hydrate / resume 尚未越界写入

not-done
  recognition 仍只是挂点名，没有正式边界
  recognition result 仍不存在或只是 advancement result 换名
  上位协调面仍只认挂点存在，不消费更窄结果邻域
  只有命名，没有最小接线
  为了“完整”提前把 acceptance / ack 或后续恢复链一起写死
```

## 9. 最终判定口径

第四刀是否完成，可以收敛成下面这句验收口径：

- 当 `cursor advancement recognition` 已经作为独立最小正式边界成立，`cursor advancement recognition result` 已经作为承认后留下的最小结果邻域成立，且上位协调面已经消费这组更窄结果邻域而没有越界吞掉 `acceptance / ack result`、`hydrate`、`resume` 与最终协议定稿问题域时，这一刀就算完成

如果还停留在“recognition 只是挂点名”“recognition result 仍是内部尾态”“协调面仍只看接线事实不看更窄结果邻域”，都不应算完成。
