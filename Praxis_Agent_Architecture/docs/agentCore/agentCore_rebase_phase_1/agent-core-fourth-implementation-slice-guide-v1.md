# agentCore 第四实施切片指南 v1

## 1. 文档定位

本文是 `agentCore_rebase_phase_1` 当前恢复链路文档组的一份**第四实施切片指南**。

它只回答一类问题：

- 如果第三刀已经完成，第四轮最小实现应先接哪一段
- 这一段的边界应该压到多小，才不会把后面的 `acceptance / ack result`、`hydrate`、`resume` 或更终局的协议层一起提前做掉
- 做完这一刀之后，第五刀最自然该接到哪里

本文**不是**：

- 新对象定义文
- 任一 baseline 的替代品
- 第三刀完成判定清单的替代品
- 全面施工计划
- 最终 roadmap
- 最终 schema 定稿
- 最终目录树或最终 TypeScript 类树设计稿

因此，后续真实实现仍应以现有 formal baseline 为准；本文只负责把“第三刀做完之后，第四刀先落哪一小段”收敛成一个可执行建议。

## 2. 为什么它自然接在第三刀之后

第三刀已经把下面这条最小桥接链立住了：

```text
journal replay result
  -> cursor advancement
  -> cursor advancement result 最小结果层
  -> recognition 最小挂点
  -> 上位协调面消费更稳定的结果邻域
```

第三刀解决的是：

- `cursor advancement result` 已经从“是否推进”的单点判断里真实拆出来
- `recognition` 已经不再只是概念词，而是在线路里有了一个独立最小挂点
- 上位协调面开始消费“advancement result 邻域”，而不是只吃单点推进信号

但第三刀还刻意没有回答下面两类问题：

- `recognition` 自己到底作为一个**最小正式边界**站在哪里，而不只是一个挂点名字
- 一旦 recognition 边界成立，最小应该留下什么 **recognition result 邻域** 给下游继续消费

白话讲，第三刀已经把“recognition 可以挂上去”的接口位置留出来了；第四刀最自然就是把“这个 recognition 挂点自己是什么边界、边界成立后最小留下什么结果邻域”补上。

如果这一步不先补，后面无论是：

- `acceptance / ack result`
- 更下游的 recover 收口
- `hydrate`
- `resume`

都会因为 recognition 仍然只是挂点、不是正式边界，而失去稳定落脚点。

## 3. 当前建议的第四刀是什么

### 3.1 切片名称

建议把第四刀收敛成：

**`cursor advancement recognition` 最小正式边界 + `cursor advancement recognition result` 最小结果邻域**

### 3.2 这第四刀的最小组合

这一刀建议只包含下面三件事：

1. 把第三刀留下的 `recognition` 最小挂点收紧成一个最小正式边界
2. 在该正式边界下游接出一个极窄的 `cursor advancement recognition result` 最小结果邻域
3. 让上位协调面开始消费“recognition 正式边界 + recognition result 最小邻域”，而不是只停在挂点存在这一级

它对应的最小主线可以先压成：

```text
cursor advancement result
  -> cursor advancement recognition 最小正式边界
  -> cursor advancement recognition result 最小结果邻域
  -> 上位协调面消费更窄的 recognition 后结果邻域
```

这里的关键不是把 recognition 全层或 acceptance 链做完，而是先把：

- recognition 作为独立问题域的最小正式边界
- recognition 边界成立后留下的最小结果邻域
- 上位协调面对这组更窄结果邻域的桥接消费

这三者真实拆开。

## 4. 这第四刀包含什么

第四刀建议只包含下面这些内容。

### 4.1 `cursor advancement recognition` 最小正式边界

它只负责一件事：

- 把第三刀里的 `recognition` 从“最小挂点”收紧成“围绕推进结果承认边界的最小正式层”

第四刀里，它应该做到：

- 明确 `recognition` 站在 `cursor advancement result` 与更下游消费动作之间
- 明确它回答的是“推进结果何时、为何、以什么最小边界被承认成可继续使用结果”
- 让当前实现结构上能看出：`recognition` 是独立窄层，不再只是 result 内部注释口或 coordinator 顺手逻辑
- 允许当前只支持极窄 happy-path、stub、placeholder 或单一路径承认

第四刀里，它不需要做到：

- 最终 recognition rule table
- 最终 acceptance / ack 条件集合
- 最终 replay window / batch / cursor policy
- 最终 recognition schema、serialization、DSL、JSON 字段名或枚举名

### 4.2 `cursor advancement recognition result` 最小结果邻域

它只负责一件事：

- 在 `recognition` 正式边界下游，形成一个**可被下游继续消费的最小 recognition 后结果邻域**

第四刀里，它应该做到：

- 明确 `cursor advancement recognition result` 不等于 `recognition` 整个问题域，也不等于 `cursor advancement result` 整体
- 至少让实现结构上能看出：某次推进结果一旦跨过 recognition 边界，会留下一个更窄结果壳给下游
- 让上位协调面开始消费 recognition 后结果邻域，而不是继续只看挂点存在与否
- 允许当前结果邻域很窄，只表达“被承认后留下的最小可消费结果面”

第四刀里，它不需要做到：

- 最终 recognition result schema 定稿
- 最终 `acceptance / ack result`
- 最终冲突合并、去重、幂等细则

### 4.3 上位协调面的最小消费改口径

它只负责一件事：

- 让上位协调面从“消费 recognition 挂点”前移到“消费 recognition 正式边界 + recognition result 最小邻域”

第四刀里，它应该做到：

- 不再只证明 recognition 挂点存在
- 改为消费 recognition 之后留下的更窄结果邻域
- 继续保持协调角色，不顺手吞掉 acceptance、hydrate 或 resume 的职责

第四刀里，它不需要做到：

- `acceptance / ack result` 正式收口
- 真正 `hydrate`
- 真正 `resume`

## 5. 这第四刀明确不包含什么

为了保证第四刀足够小，这一轮应明确排除下面这些内容：

- `acceptance / ack result` 全层
- 完整 acceptance / ack 条件集合
- 完整 acceptance / ack rule table
- `hydrate` 真正灌回逻辑
- `resume` 真正续接逻辑
- replay window / batch / cursor policy 定稿
- 最终 recognition schema
- 最终 recognition result schema
- 最终 serialization / DSL / JSON 字段名 / 枚举名
- 最终 TypeScript 目录树、类名、状态枚举或协议表

一句话说，第四刀只做：

- recognition 这个承认边界先正式站住
- recognition 站住后最小留下什么结果邻域先站住

不做“宿主最终如何接受/确认并继续交付”的下一层。

## 6. 为什么这个切片适合作为第四刀

这个切片适合作为第四刀，主要有六个原因。

### 6.1 它正好补上第三刀之后最明显的缺口

第三刀已经证明：

- advancement result 可以独立存在
- recognition 可以作为挂点接在线路里

但“recognition 作为正式边界是什么”“边界成立后留下什么更窄结果”还没站住。  
第四刀正好补这个缺口，不需要回头改写第三刀。

### 6.2 它先把“挂点”与“正式边界”分开

如果第四刀不先补这一步，后面很容易继续出现：

- recognition 只有名字，没有真正问题域
- coordinator 直接跳过 recognition 边界，偷消费更下游结果
- acceptance / ack 被迫倒灌回来替 recognition 补定义

第四刀先把正式边界站住，能最快止住这类混写。

### 6.3 它先把 recognition 与 recognition result 分开

如果 recognition 一成立就直接把“边界本身”和“边界后的结果壳”混成一层，后面很容易出现：

- recognition 自己既负责承认，又冒充承认后结果
- recognition result 没有独立落脚点
- 第五刀只能回头拆层

第四刀先把这两层分开，后续 acceptance / ack 才有自然接点。

### 6.4 它比直接进入 `acceptance / ack result` 更稳

`acceptance / ack result` 已经是 recognition 之后的更窄结果层。  
如果第四刀直接跳过去，很容易把：

- acceptance / ack 条件
- acceptance / ack result
- 甚至 hydrate / resume 后续出口

一起带进来。先把 recognition 正式边界与 recognition result 邻域站住，更符合“小切片继续推进”的节奏。

### 6.5 它仍然停在 recovery bridge 邻域，没有跳成终局协议

这一步仍然围绕：

- `cursor advancement result`
- `cursor advancement recognition`
- `cursor advancement recognition result`
- 上位协调面最小桥接消费

还没有跳去：

- `acceptance / ack result`
- `hydrate`
- `resume`
- 最终 schema 或最终 rule table

所以边界仍然可控。

### 6.6 它会让第五刀拥有非常自然的落点

一旦第四刀完成，后面就不必再争论：

- recognition 到底是不是正式层
- recognition result 到底是不是独立结果邻域

第五刀就可以更自然地只补：

- `acceptance / ack result` 最小正式邻域

而不是回头重新拆 recognition。

## 7. 做完第四刀后，第五刀最自然接到哪里

如果第四刀完成，下一刀最自然的方向不是回头重写第三刀，也不是直接把 hydrate / resume 打通，而是继续顺着这条链往下接：

- `cursor advancement recognition result`
- `acceptance / ack result` 最小正式邻域

白话讲，第五刀最自然要回答的问题会变成：

- recognition 之后宿主真正接受/确认的那份更具体结果，最小应该怎样站住

但第五刀此时仍然不必做成：

- 完整 acceptance / ack 条件全集
- 最终 acceptance / ack rule table
- 完整 recover / hydrate / resume 出口

也就是说，第四刀做完之后，第五刀最自然是接到 **`acceptance / ack result` 最小正式邻域**，而不是把后半条恢复链一口气写完。

## 8. 一个很小的第四刀边界图

```text
第三刀终点
  cursor advancement result 已成立
  recognition 已有最小挂点

第四刀要补
  recognition 从挂点收紧成最小正式边界
  recognition result 最小结果邻域成立
  上位协调面开始消费 recognition 后更窄结果邻域

第四刀不补
  acceptance / ack result 全层
  hydrate / resume
  最终 schema / 最终 rule table
```

## 9. 最终收敛口径

第四刀可以收敛成下面这句施工口径：

- 当 `cursor advancement recognition` 已经从第三刀的最小挂点收紧成独立正式边界，`cursor advancement recognition result` 已经作为承认后留下的最小结果邻域成立，且上位协调面已经消费这组更窄邻域而没有越界吞掉 `acceptance / ack result`、`hydrate`、`resume` 与最终协议定稿问题域时，这一刀就是合格的第四实施切片

如果还停留在“recognition 只是挂点名”“recognition result 仍不存在”“协调面只是顺手往后偷接 acceptance / hydrate / resume”，都不应算第四刀。
