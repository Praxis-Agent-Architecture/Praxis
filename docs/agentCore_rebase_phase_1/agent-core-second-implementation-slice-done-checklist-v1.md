# agentCore 第二实施切片完成判定清单 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 的一份**第二实施切片完成判定清单**。

它只回答一个问题：

- 第二刀 `journal replay result` 最小结果桥 + `cursor advancement` 最小判定壳，做到什么程度，才算这一刀已经完成，可以进入第三刀

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第一刀完成判定清单的替代品
- 全面 QA 计划
- 完整测试计划总表
- 最终 schema、最终算法或最终目录树的定稿文

因此，这份文档的用途不是扩展设计边界，而是给第二刀提供一个偏实施、偏验收的 `done / not-done` 判定口径。

## 2. 对应切片

本文对应的第二实施切片是：

- `journal replay result` 最小结果桥
- `cursor advancement` 最小判定壳
- `recovery coordinator` 对这两个最小结果的桥接消费

白话讲，这一刀只验收一件事：

- replay 出口是否已经从“过程占位”收紧成“最小结果桥”，并且这个结果桥是否已经支撑一个独立的最小推进判定壳，再由 `recovery coordinator` 用协调者身份消费它们

也就是至少能形成下面这条最小桥接链：

```text
replay pipeline shell
  -> journal replay result 最小结果桥
  -> cursor advancement 最小判定壳
  -> recovery coordinator 消费最小桥接结果
```

这里验收的是“最小桥接层是否站住”，不是“恢复后半条链路是否完整做完”。

## 3. 完成判定总原则

这一刀是否完成，优先看下面四件事：

1. `journal replay result` 是否已经从 replay 过程里真实拆出来，而不是继续当过程尾巴或占位别名
2. `cursor advancement` 是否已经作为独立窄壳存在，而不是被塞回 replay pipeline 或 `recover` 主体
3. `recovery coordinator` 是否已经消费“result + advancement 最小判断”，而不是回头偷看 replay 内部过程
4. 是否克制住了越界实现，没有把 `cursor advancement result`、`recognition`、`hydrate / resume` 等后续问题域提前写死

只要这四件事里有一件明显没站住，就不应判定为 done。

## 4. 完成判定项

### 4.1 结构判定项

以下各项全部满足，才算结构上过线：

- `journal replay result` 已经作为独立结果桥存在，不再只是 `replay pipeline shell` 内部的尾部临时态
- `cursor advancement` 已经作为独立最小判定壳存在，不再只是 replay 结束后的顺手判断片段
- `recovery coordinator` 已经以协调者身份消费这两个壳，而不是重新吞掉 result builder 与 advancement evaluator 的职责
- 当前实现至少能从命名和责任上看出：谁产出 replay result，谁做 advancement 判断，谁做 recover 侧桥接消费
- 当前实现没有借“先跑起来”为理由，把第二刀重新收缩成一个大 replay 函数或一个大 recover 函数

### 4.2 接口边界判定项

以下各项全部满足，才算接口边界上过线：

- `journal replay result` 对外暴露的是“replay 后可继续消费的最小结果面”或等价载体，而不是 replay 过程内部态的直接外泄
- `cursor advancement` 接收的是 replay result 邻域与相邻 cursor 材料的最小输入面，而不是任意越层抓取 replay 内部细节
- `recovery coordinator` 消费的是 `journal replay result + cursor advancement 最小判断`，而不是自己重做推进判定
- 当前接口允许很窄的 happy-path、stub 或 placeholder，但没有提前钉死最终 schema、最终字段全集、最终规则表
- 当前接口已经给第三刀的 `cursor advancement result` 与 `recognition` 留出自然挂点

### 4.3 最小桥接链判定项

以下各项全部满足，才算最小桥接链上过线：

- 存在一个明确的 replay 出口，会产生最小 `journal replay result` 或等价结果壳
- 该结果壳已经被交给 `cursor advancement` 最小判定壳消费
- `cursor advancement` 至少能产出一个最小“是否形成推进”的判断信号、状态或等价结果
- `recovery coordinator` 已经消费上述最小桥接结果，而不是只接收“replay 跑过了”的纯过程占位信号
- 整条链路至少在一个最小场景下可运行，可是 mock、stub 或极窄 happy-path，但不能只是纸面接口完全未接线
- 当前最小链路的闭环重点是“replay 产物 -> 推进判断 -> recover 协调消费”，不是“后续恢复完成”

### 4.4 越界控制判定项

以下各项全部满足，才算这一刀没有越界：

- 没有把 `cursor advancement result` 正式结果层一起做进来
- 没有把 `cursor advancement recognition` 或 `cursor advancement recognition result` 一起做进来
- 没有把 `acceptance / ack result` 一起拉进来
- 没有把 `hydrate` 真正灌回逻辑一起做进来
- 没有把 `resume` 真正续接逻辑一起做进来
- 没有为了“先完整一点”而把最终 replay result schema、最终 advancement algorithm、最终目录树一并定稿

一句话说，这一刀要的是“最小桥接层到位”，不是“后半条结果链顺手做完”。

## 5. 哪些情况算这刀还没做完

出现下面任一情况，都应判定为 **not-done**：

- `journal replay result` 仍然只是名字变了，本质上还是 replay pipeline 内部态或纯完成标记
- 名义上有 `cursor advancement`，但实际推进判断仍然埋在 replay pipeline 或 `recover` 主体里
- `recovery coordinator` 仍然只吃“replay 已执行”信号，没有消费最小 result + advancement 桥接结果
- 当前实现只有概念图，没有一条最小可运行桥接链
- 为了让链路显得更完整，提前把 `cursor advancement result`、`recognition`、`hydrate / resume` 一起写进来了
- replay result 或 advancement 接口已经被硬写成“未来最终 schema 必须如此”的强约束
- 代码虽然能跑，但职责混写到第三刀已无法自然插入

这类情况的共同特征是：

- 要么结果桥没立住
- 要么推进判定壳没立住
- 要么 recover 消费侧没立住
- 要么已经把后续问题域提前绑死

## 6. 哪些情况虽然粗糙，但已经足够进入第三刀

下面这些情况，即使实现还很粗糙，仍然可以判定为 **done-enough**：

- `journal replay result` 已真实存在，哪怕目前字段很少，只够表达最小可消费结果面
- `cursor advancement` 目前只支持极窄 happy-path、空推进或单一路径判断，但已经作为独立壳接在线路里
- `recovery coordinator` 目前只负责桥接消费和返回最小状态，还没有承担正式恢复收口
- 当前验证方式仍然很轻，例如 smoke 级调用验证、stub 驱动验证或最小桥接闭环验证
- 当前结果壳和判断壳都明显不是最终协议，但已经不再冒充过程内部态
- 当前实现已经能证明“replay 产物”和“推进判断”是两层，而不是同一层换名字

换句话说，只要“结果桥拆出来了、推进壳接上了、recover 消费改口径了、越界忍住了”，即使还不精细，也足够进入第三刀。

## 7. 第二刀完成后的第三刀进入条件

第二刀完成后，不是立刻任意扩写，而是满足下面条件后，才适合进入第三刀：

- 第二刀的 done 判定项已经全部满足
- 当前最小桥接链可以稳定重复触发，而不是一次性拼出来的临时演示
- 团队对 `journal replay result`、`cursor advancement`、`recovery coordinator` 三者的职责边界没有明显歧义
- 当前实现没有暴露出必须先回炉修正的结构性混写问题
- 下一刀要补的对象已经明确收敛到 `cursor advancement result` 邻域，必要时再进入 `recognition` 邻域，而不是回头重写第二刀

满足这些条件后，第三刀才适合进入例如：

- `cursor advancement result` 的最小结果层
- `recognition` 入口的最小挂点

这里的关键不是“第三刀一次做多大”，而是：

- 第二刀已经证明 replay 出口、推进判断和 recover 桥接消费之间的最小关系是成立的

## 8. 一个很小的 done / not-done 边界图

```text
done
  replay pipeline shell 已交出 journal replay result 最小结果桥
  cursor advancement 已作为独立最小判定壳接在 result 下游
  recovery coordinator 已消费 result + advancement 最小桥接结果
  整条最小桥接链可在窄场景下走通
  接口仍是最小壳，不是最终 schema / 最终算法定稿
  cursor advancement result / recognition / hydrate / resume 尚未越界写入

not-done
  replay 结束后仍只有过程完成标记，没有独立 result 壳
  advancement 仍藏在 replay 或 recover 主体里
  coordinator 仍直接翻 replay 过程细节
  只有命名，没有最小接线
  为了“完整”提前把后续结果层和承认层一起写死
```

## 9. 最终判定口径

第二刀是否完成，可以收敛成下面这句验收口径：

- 当 `journal replay result` 已经作为 replay 出口的最小结果桥成立，`cursor advancement` 已经作为独立最小判定壳成立，且 `recovery coordinator` 已经消费这条最小桥接链而没有越界吞掉后续问题域时，这一刀就算完成

如果还停留在“replay 出口仍是过程尾巴”“推进判断仍是顺手逻辑”“recover 仍靠越层偷看内部细节”，都不应算完成。
