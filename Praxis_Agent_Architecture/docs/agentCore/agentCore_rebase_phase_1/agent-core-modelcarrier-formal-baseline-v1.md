# agentCore ModelCarrier 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agent-core-host-design-baseline-v1.md` 中 `ModelCarrier` 一节的正式下钻文，用来冻结 `agentCore` 第一版里 `ModelCarrier` 的对象边界、分类原则与分层视角。

本文要回答的是：

- `ModelCarrier` 在 Praxis 宿主里到底指什么
- `provider` 和 `carrier` 为什么不能混成一个概念
- “能力名 -> 映射表 -> provider/carrier 路径”里的 `carrier 路径` 应该怎样理解
- 为什么第一版必须接受多轨并重，而不是被单一接口形状绑死
- 后续 carrier 子系统设计，应该围绕哪些稳定边界继续展开

本文不讨论源码迁移计划，也不把当前仓库中的任何旧实现直接提升为新标准的最终 schema。

本文明确不冻结以下内容：

- 最终字段 schema
- 完整 JSON 命名
- 完整 DSL 关键字
- resolver 的精确接口
- runtime-table 里的最终 carrier 表结构
- 各 carrier 子系统的具体协议细节

第一版的目标不是一次性发明统一 carrier 语言，而是先把“我们到底在描述哪一类对象、这些对象如何分类”固定下来。

## 2. 上位基线承接

结合前面的宿主总纲、能力系统与 PromptPack 文档，以下结论已经成立，本文直接承接：

- `ModelCarrier` 是模型承载与调用通道的总称，模型不只通过一种接口形状进入系统。
- 第一版采用多轨并重，不被单一接口形状绑死。
- 正式规划至少覆盖三类大面：`API carrier`、`SDK carrier`、`CLI carrier`。
- 能力系统默认按能力名调用，再由映射表把“能力名 + 宽度策略”解析到 `provider/carrier` 路径。
- `PromptPack` 先统一宿主语义，再 lower 到 `provider/carrier`；carrier 不能反向定义 `PromptPack` 语义。

因此，本文不是重新证明“为什么要有 carrier”，而是解释：当能力映射与 Prompt lower 都落到 carrier 时，这些路径到底属于什么类别、如何分层、边界在哪里。

## 3. ModelCarrier 的定义边界

`ModelCarrier` 指模型被接入、承载、调用、附着运行能力并暴露具体交互表面的那一层现实通道。

白话讲，`provider` 更像“是谁提供模型”，`carrier` 更像“模型是通过什么壳、什么通道、什么调用面进入系统并被使用”。

因此，`ModelCarrier` 关心的不是抽象模型名本身，而是这类更接近运行承载的问题：

- 这次是通过哪一种调用壳进入系统
- 这条通道暴露的是哪一种 `surface`
- 这条通道能否承接工具调用、MCP、状态管理、会话续接等额外能力面
- 这条通道属于更薄的 API 面，还是更厚的 runtime / agent 面

第一版必须明确：`ModelCarrier` 不是“generation endpoint 的别名”。generation surface 只是 carrier 上可能出现的一种表面，不是 carrier 的全部。

## 4. provider 与 carrier 的区别

### 4.1 provider 不是 carrier

`provider` 更接近模型厂商、模型家族或官方生态边界。

例如在当前仓库现实里，`openai`、`anthropic`、`deepmind` 都属于 `provider` 范畴。它回答的是“这条能力路径最终归属于谁的模型生态”。

### 4.2 carrier 不是 provider

`carrier` 更接近具体承载通道、运行壳、调用面与 surface 组合。

它回答的是：

- 通过 API 还是 agent runtime 接入
- 使用哪一种 generation surface
- MCP 是 runtime 代管还是 provider-native
- 这条通道是否只承接 tools，还是还能承接 resources / prompts / session

### 4.3 二者的关系

第一版冻结以下关系：

- 同一 `provider` 下可以有多个 `carrier`
- 同一 `carrier` 家族里可以存在多个 `surface`
- `provider` 是上游归属维度，`carrier` 是承载与调用维度
- 能力映射不能把二者压扁成同一个词

这意味着后续实现不能把“OpenAI”直接等同于一个 carrier，也不能把“messages”或“responses”直接等同于 provider。

## 5. carrier 的分层视角

`ModelCarrier` 第一版不冻结单一对象 schema，但冻结一种稳定的分层看法。

### 5.1 顶层：carrier 主类

从宿主总纲出发，第一版正式规划至少承认三类大面：

- `API carrier`
- `SDK carrier`
- `CLI carrier`

这三类是顶层主类，用来说明“模型进入系统的大方向”，不是要把所有下游 carrier 都压成同一种厚度。

### 5.2 中层：更细 carrier 姿态

在顶层主类之下，需要允许更细的 carrier 家族或中层姿态存在。

这类中层视角至少可能区分：

- 更偏 `api` 的薄承载面
- 更偏 `agent` / runtime 的厚承载面
- shared runtime mediated 的承载面
- provider-native 的承载面
- 未来更专门的宿主壳或桥接壳

这里冻结的是“允许存在这一层”，不是冻结完整枚举表。

这里的“中层姿态”只是分类位阶，不预设宿主最终一定存在名为 `layer`、`carrierKind` 或其他现存字段名的规范槽位。

### 5.3 下层：具体 surface

再往下，carrier 会落到更具体的 surface。

当前现实锚点已经说明，不同 provider 下存在不同 surface 示例，例如：

- OpenAI 侧有 `responses`、`chat_completions`
- Anthropic 侧有 `messages`
- DeepMind 侧有 `generateContent`
- 某些 agent / runtime 路径还会出现更偏 MCP runtime、hosted tool、local stdio runtime 的具体表面

这里的重点是：`surface` 是具体表面，不等于 `carrier` 全体。一个 carrier 可以承接一个或多个 surface，一个 surface 也只是在某个 carrier 里出现的具体调用面。

### 5.4 纵向理解

因此，后续实现者可以把 `ModelCarrier` 粗略理解成下面这种纵向结构：

```text
provider 归属
  -> carrier 主类
  -> 更细 carrier 姿态（家族 / 运行取向等）
  -> 具体 surface
  -> 该 surface 所能承接的能力面
```

这是一种分类原则，不是最终字段结构，也不要求后续 schema 必须出现名为 `layer` 的规范字段。

## 6. 三大主类

### 6.1 API carrier

`API carrier` 指更偏官方 API surface、远端请求面、显式参数 lower 的承载路线。

它通常更薄、更可控，也更容易成为窄宽度策略下的默认优先方向。但第一版不把它限定为“只有 generation HTTP endpoint”。文件、批处理、embedding、远程 MCP connector 等同样可能属于 API carrier 范围。

### 6.2 SDK carrier

`SDK carrier` 指更偏官方 SDK、对象封装、宿主 helper、client abstraction 的承载路线。

它可能与 API carrier 指向同一 provider，但其承载厚度、可用能力面与宿主耦合方式都可能不同。第一版承认 SDK carrier 是正式主类，但不要求所有 SDK carrier 都比 API 更厚，具体厚度由各家 runtime 现实决定。

### 6.3 CLI carrier

`CLI carrier` 指更偏命令行 runtime、agent shell、工具编排壳、会话宿主壳的承载路线。

它往往更接近运行中系统，而不只是一次薄请求。CLI carrier 可以承接更完整的工具、状态与会话能力，但第一版不预设所有 CLI carrier 都天然更强，也不把任何现有 CLI 运行壳直接写成唯一标准。

## 7. surface 与能力面

`ModelCarrier` 的一个核心要求，是把“surface”与“能力面”区分开。

### 7.1 surface 是什么

`surface` 指具体调用表面，也就是调用方真正命中的某个入口形状。

例如当前现实里已经可见：

- generation surface：`responses`、`chat_completions_compat`、`messages`、`generateContent`
- OpenAI API 侧还存在 `embeddings`、`files`、`batches` 这类 surface
- MCP / agent runtime 侧还可能出现更偏 hosted、stdio、remote connector、runtime-mediated 的表面

这些都是“具体表面”，不是宿主级总分类名。

### 7.2 carrier 需要承接的能力面

第一版必须明确：carrier 需要承接的不只是 generation endpoint，还包括但不限于：

- `auth`
- tool use
- MCP
- session / state
- streaming
- resources / prompts
- memory handoff
- runtime lifecycle

换句话说，carrier 的设计要能回答“这条通道到底能承接哪些能力面”，而不只是“它发请求时走哪个方法名”。

### 7.3 surface 与能力面的关系

第一版冻结以下关系：

- `surface` 是入口表面
- 能力面是该 carrier / surface 所能承接的功能维度
- 不能因为某条 generation surface 存在，就假设它自动承接所有能力面
- 也不能因为某条 carrier 能承接工具，就把它误写成只剩工具面

后续实现应允许“同一 carrier 家族里，不同 surface 支持能力面不同”的现实。

## 8. 与能力系统的关系

能力系统文档已经冻结：用户默认按能力名调用，映射表把“能力名 + 宽度策略”解析到 `provider/carrier` 路径。

本文补充冻结的是：这些路径不应被理解成单一字符串，而应被理解为一种分层后的路径类别。

也就是说，能力系统解决的是：

- 用户先说要什么能力
- 当前宽度策略允许多大的开放面
- 默认优先走哪一类 carrier

`ModelCarrier` 文档解决的是：

- 被解析出来的 carrier 路径，在概念上属于哪一类对象
- 路径里的 `provider`、carrier 主类、家族、surface、能力面分别是什么层次
- 为什么后续 resolver 与 runtime-table 不应把这些层次压扁

因此，能力系统负责“找路”，`ModelCarrier` 负责定义“路的类型与分层原则”。

## 9. 与 PromptPack 的关系

PromptPack 文档已经冻结：`PromptPack` 先统一 `governance / task / context` 三层语义，再 lower 到 `provider/carrier`。

因此，`ModelCarrier` 第一版需要承认两件事：

- PromptPack 的 lower 必须进入具体 carrier
- carrier 不能反向定义 PromptPack 的语义

白话讲，carrier 负责“怎么承”，PromptPack 负责“语义上是什么”。二者要接上，但不能倒置。

这意味着：

- 不同 carrier 可以把同一 PromptPack 语义 lower 成不同字段形状
- 同一 provider 下不同 surface 也可以有不同 lower 方式
- 这些 lower 差异不构成 PromptPack 语义层本身

因此，后续 carrier 子系统的职责，是定义“如何忠实承接 PromptPack 语义”，而不是“借某家字段名重写 PromptPack”。

## 10. 当前仓库的现实锚点

本文不是从空中发明 `ModelCarrier`，当前仓库已经给出若干现实锚点，可以说明这个概念确实存在，但这些锚点只用于证明“概念有现实基础”，不反向绑死新标准。

### 10.1 generation surface 已经不是单一形状

`src/rax/live-config.ts` 已存在 `ProviderGenerationVariant`，现实上已经区分：

- `responses`
- `chat_completions_compat`
- `messages`
- `generateContent`

这说明 generation 本身就已经不是单一统一表面。

### 10.2 runtime 已经在记录 carrier 形状

`src/rax/mcp-runtime.ts` 的连接记录和摘要中，现实上已经存在这类 carrier 形状字段：

- `officialCarrier`
- `carrierKind`
- `layer`
- `loweringMode`
- `supportsResources`
- `supportsPrompts`

这说明运行时已经不得不表达“这条通道到底属于什么 carrier 姿态、能承接哪些能力面”。

这些名字只是旧 runtime 的现实记录项，用来证明系统已经在表达这类信息；它们不是新宿主必须继承的规范键名。

### 10.3 provider 下已经出现多个 carrier 与多个 surface

当前 `src/integrations/*` 中已经能看到若干现实例子：

- OpenAI API 侧同时出现 `responses`、`chat_completions`、`embeddings`、`files`、`batches`
- OpenAI agent 侧与 API 侧又是不同 carrier 壳
- Anthropic API 侧以 `messages` 为 generation surface，但 agent/runtime 侧还能承接更丰富的 MCP surface
- DeepMind 侧既有 `generateContent` 这类 generation surface，也有不同形态的 MCP bridge

这说明在现实代码里，`provider`、carrier、surface、能力面已经不是一层东西。

### 10.4 这些锚点的使用边界

第一版只承认这些锚点说明了两件事：

- `ModelCarrier` 不是拍脑袋概念
- 新标准必须容纳这种多层现实

但本文不把任何现有命名、枚举值或 payload 结构直接提升为宿主标准字段名。

## 11. 第一版明确不冻结的内容

为了给后续实现留出真实空间，本文明确不写死以下细节：

- 不写死统一字段 schema
- 不写死 carrier 的最终注册表结构
- 不写死完整 layer 枚举
- 不写死完整 carrierKind 枚举
- 不写死完整 loweringMode 枚举
- 不写死 surface 的宿主标准字段名
- 不写死 resolver 返回值的最终对象形状
- 不写死 runtime-table 中 carrier 路径的序列化方式
- 不写死 CLI runtime 与 agent runtime 的最终边界命名

特别需要强调的是：

- `responses`
- `chat_completions_compat`
- `messages`
- `generateContent`
- 当前各类 CLI / runtime shell

这些都只是现实 surface 或 carrier 例子，不是宿主标准字段名本身。

## 12. 结论

`ModelCarrier` 第一版冻结的不是一个统一 schema，而是一套稳定的对象边界与分类原则：

- 模型进入系统有多种承载通道，`ModelCarrier` 是这些通道的总称
- `provider` 负责上游归属，`carrier` 负责具体承载与调用路径
- carrier 至少要从“主类 -> 更细 carrier 姿态 -> surface -> 能力面”来理解
- 第一版正式承认 `API / SDK / CLI` 三大主类，但不把下游全部压成同一种厚度
- carrier 必须能承接的不只是 generation，还包括 auth、tool use、MCP、session/state、streaming、resources/prompts、memory handoff 等能力面
- 能力系统负责按能力名找路，`ModelCarrier` 负责定义这条路在概念上由哪些层组成
- PromptPack 语义先于 carrier lower，carrier 不反向定义 PromptPack

后续 carrier 子系统的工作重点，应该围绕这套边界继续展开：把不同 provider、不同 carrier 家族、不同 surface 和不同能力面怎样登记、怎样解析、怎样 lower、怎样导出检查，逐步做实；而不是先发明一个会把未来演进空间锁死的总字段表。
