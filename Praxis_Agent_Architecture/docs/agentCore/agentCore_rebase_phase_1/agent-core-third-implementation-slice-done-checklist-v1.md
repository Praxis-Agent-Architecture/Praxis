# agentCore 第三实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第三实施切片完成判定清单**。

它只回答一个问题：

- 第三刀 `cursor advancement result` 最小结果层 + `recognition` 最小挂点，做到什么程度，才算这一刀已经完成，可以进入第四刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第三实施切片指南的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终算法或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第三刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第三实施切片是：

- `cursor advancement result` 最小结果层
- `recognition` 最小挂点
- 上位协调面对这两个最小结果邻域的桥接消费

白话讲，这一刀只验收一件事：

- 第二刀产出的“最小推进判断”是否已经继续收紧成“最小可消费结果层”，并且这个结果层是否已经给 `recognition` 留出一个独立的窄入口，再由上位协调面用协调者身份消费这组更稳定的结果邻域

也就是至少能形成下面这条最小桥接链：

```text
journal replay result
  -> cursor advancement
  -> cursor advancement result 最小结果层
  -> recognition 最小挂点
  -> 上位协调面消费更稳定的结果邻域
```

这里验收的是“最小结果层和最小挂点是否站住”，不是“正式 recognition 层、recognition result 或 acceptance 链是否完整做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `cursor advancement result` 是否已经从“最小推进判断”里真实拆出来，而不是继续当布尔信号、状态尾巴或临时占位
2. `recognition` 是否已经作为独立窄入口存在，而不是被塞回 `cursor advancement result` 或上位协调面主体
3. 上位协调面是否已经消费“advancement result 邻域 + recognition 最小挂点”，而不是继续只吃单点判断信号
4. 是否克制住了越界实现，没有把完整 recognition 规则层、`cursor advancement recognition result`、`acceptance / ack result` 或后续恢复链提前写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `cursor advancement result` 已经作为独立最小结果层存在，不再只是 `cursor advancement` 的返回标记换名
- `recognition` 已经作为独立最小挂点存在，不再只是 result 内部的顺手判断片段
- 上位协调面已经以协调者身份消费第三刀结果邻域，而不是重新吞掉 result builder 或 recognition 入口职责
- 当前实现至少能从命名和责任上看出：谁产出 advancement result，谁暴露 recognition 入口，谁负责上位桥接消费
- 当前实现没有借“先跑起来”为理由，把第三刀重新收缩成一个大 advancement 函数或一个大 coordinator 函数

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `cursor advancement result` 对外暴露的是“推进之后留下的最小可继续消费结果面”或等价载体，而不是 advancement 内部过程态的直接外泄
- `recognition` 接收的是 advancement result 邻域的最小输入面，而不是任意越层抓取 replay / advancement 内部细节
- 上位协调面消费的是“advancement result + recognition 最小挂点”这组邻域，而不是自己重做 recognition 判断
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 schema、最终字段全集、最终规则表
- 当前接口已经给第四刀的 `recognition` 最小正式边界与 `cursor advancement recognition result` 邻域留出自然挂点

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 `cursor advancement` 出口，会产出最小 `cursor advancement result` 或等价结果壳
- 该结果壳已经被交给 `recognition` 最小挂点消费，而不是停在 result 名字层
- `recognition` 当前即使只是一层极窄入口，也已经真实接在线路里，不是纯纸面预留
- 上位协调面已经消费上述最小结果邻域，而不是只接收“advance 过了/没 advance”这种单点信号
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是文档上说可以接
- 当前最小链路的闭环重点是“advancement 判断 -> advancement result -> recognition 挂点 -> 上位桥接消费”，不是“完整承认已经完成”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把 `cursor advancement recognition` 完整规则层一起做进来
- 没有把 `cursor advancement recognition result` 正式结果层一起做进来
- 没有把 `acceptance / ack result` 一起拉进来
- 没有把 `hydrate` 真正灌回逻辑一起做进来
- 没有把 `resume` 真正续接逻辑一起做进来
- 没有为了“先完整一点”而把最终 result schema、最终 recognition algorithm、最终目录树一并定稿

一句话说，这一刀要的是“最小结果层 + 最小挂点到位”，不是“正式承认后半条链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `cursor advancement result` 仍然只是名字变了，本质上还是 `cursor advancement` 的单点判断信号或内部尾态
- 名义上有 `recognition` 挂点，但实际 recognition 入口仍然埋在 result 内部或 coordinator 主体里
- 上位协调面仍然只吃“是否推进”的判断，没有消费 result 邻域
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把完整 recognition、recognition result、`acceptance / ack result` 一起写进来了
- result 或 recognition 接口已经被硬写成“未来最终 schema 必须如此”的强约束
- 代码虽然能跑，但职责混写到第四刀已无法自然接入

这类情况的共同特征是：

- 要么结果层没立住
- 要么 recognition 挂点没立住
- 要么上位桥接消费没立住
- 要么已经把后续正式承认层提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第四刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `cursor advancement result` 已真实存在，哪怕目前字段很少，只够表达最小可消费结果面
- `recognition` 目前只支持极窄 happy-path、单一路径入口或 placeholder 式接线，但已经作为独立挂点出现
- 上位协调面目前只负责桥接消费和返回最小状态，还没有承担正式 recognition 收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小桥接闭环验证
- 当前结果层和挂点都明显不是最终协议，但已经不再冒充 advancement 内部态或 coordinator 私有逻辑
- 当前实现已经能证明“推进判断”“推进后结果”“recognition 入口”是三层，而不是同一层换名字

换句话说，只要“结果层拆出来了、recognition 挂上了、上位消费改口径了、越界忍住了”，即使还不精细，也足够进入第四刀。

## 7. 第三刀完成后的第四刀进入条件

第三刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第四刀：

- 第三刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `cursor advancement result`、`recognition` 挂点、上位协调消费三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到 `recognition` 最小正式边界，再视需要收紧到 `cursor advancement recognition result` 邻域，而不是回头重写第三刀

满足这些条件后，第四刀才适合进入例如：

- `recognition` 最小正式边界
- `cursor advancement recognition result` 邻域

这里的关键不是“第四刀一次做多大”，而是：

- 第三刀已经证明 advancement 之后的结果层、recognition 入口和上位桥接消费之间的最小关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  cursor advancement 已交出 cursor advancement result 最小结果层
  recognition 已作为独立最小挂点接在 result 下游
  上位协调面已消费 result 邻域，而不是只消费单点判断
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳，不是最终 schema / 最终算法定稿
  recognition 完整规则层 / recognition result / acceptance 链尚未越界写入

not-done
  advancement 结束后仍只有单点判断，没有独立 result 层
  recognition 仍藏在 result 或 coordinator 主体里
  上位协调面仍直接吃“是否推进”信号
  只有命名，没有最小接线
  为了“完整”提前把正式承认层和后续结果层一起写死
```

## 9. 最终判定口径

第三刀是否完成，可以收敛成下面这句验收口径：

- 当 `cursor advancement result` 已经作为 advancement 出口的最小结果层成立，`recognition` 已经作为独立最小挂点成立，且上位协调面已经消费这组最小结果邻域而没有越界吞掉后续正式承认问题域时，这一刀就算完成

如果还停留在“result 仍是判断尾巴”“recognition 仍是顺手逻辑”“协调面仍靠单点信号推动”，都不应算完成。
