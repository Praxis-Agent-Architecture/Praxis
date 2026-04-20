# agentCore PromptPack 语义层与 provider/carrier 映射基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-host-design-baseline-v1.md` 中 `PromptPack` 一节的下钻文，也是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-spec-class-declaration-model-v1.md` 在 PromptPack 板块上的补充基线。

本文只定义 `PromptPack` 第一版应该冻结的语义层、边界层与 provider/carrier 映射原则，不重复宿主总纲，也不展开完整 `DSL`、完整 schema 或具体源码实现。

本文要回答的是：

- `PromptPack` 在 Praxis 宿主里到底先统一什么
- 三层语义分别承载什么内容
- 为什么不能让 OpenAI / Anthropic / Gemini 的原生字段名反向决定我们的设计
- `PromptPack` 作为声明板块之一，应当如何被组合、引用和后续下放

本文不冻结以下内容：

- 具体文件命名规则与目录结构
- 具体 `DSL` 关键字、完整 JSON 字段名、精确 schema
- provider 适配器里的最终 lower 细节
- prompt 文件系统的最终组织规则
- dynamic `development_prompt` 的最终生成规则
- user prompt 边界管理的最终策略

## 2. 设计目标

`PromptPack` 第一版先统一 Praxis 自己的语义层，而不是直接照抄某一家模型厂商的原生请求字段。

这件事的重点不是“把三家 API 字段翻译成另一个名字”，而是先把宿主真正关心的提示信息边界固定下来。只有宿主自己的语义层先稳定，后续的 `provider` 适配、`carrier` 下放、声明复用和运行期检查才不会被某一个接口形状绑死。

因此，`PromptPack` 第一版冻结的是：

- 统一的语义层
- 统一的边界层
- 统一的拼装规则方向

而不是冻结：

- 某一家 API 的字段名
- 某一家 SDK 的对象结构
- 某一次请求最终长成什么 JSON

## 3. 三层语义

`PromptPack` 第一版至少分为三层统一语义：

- `governance`
- `task`
- `context`

这三层是 Praxis 宿主内部的语义层，不等于 OpenAI、Anthropic、Gemini 或未来其他 provider 的原生字段名。

### 3.1 governance

`governance` 层承载系统与开发侧的制度性约束。它描述的是“这次对话与执行应当遵守什么规则”，而不是“当前用户要我做什么”。

第一版中，`governance` 大致承载：

- system prompt 一类的宿主根规则
- development prompt 一类的开发侧约束
- 运行纪律、行为边界、执行契约
- 模式说明、制度性补充、治理注入块

这层的特点是：

- 优先表达长期或中期稳定约束
- 不应与当前单轮任务正文混写
- 在 provider 映射时可以被拆分、合并或下放，但语义上仍然属于治理层

### 3.2 task

`task` 层承载本轮任务意图。它描述的是“这一次到底要做什么”，是当前回合的主输入层。

第一版中，`task` 大致承载：

- 当前任务
- 用户意图
- 当前回合主输入
- 与本轮执行直接相关的目标说明

这层的特点是：

- 它应当保持当前性，围绕当前回合展开
- 它不等于全部上下文历史
- 它不应被治理性制度文本淹没

### 3.3 context

`context` 层承载辅助完成本轮任务的上下文材料。它描述的是“为了正确完成当前任务，还需要带上哪些补充块”。

第一版中，`context` 大致承载：

- 历史片段
- 工具结果
- 外部模块注入块
- 动态 slot
- 任务相关背景、工作区摘要、证据片段

这层的特点是：

- 它服务于当前任务，但不等于当前任务本身
- 它允许来自多个外部子系统的注入
- 它在规模上最容易增长，因此更需要分块、引用与边界控制

## 4. 为什么不能用三家的字段名反推设计

OpenAI、Anthropic、Gemini 对 prompt 的承载方式不同，这种差异说明 provider 原生字段只是“承载壳”，不是宿主语义本身。

从当前仓库现实锚点看，已经能看到这一点：

- `src/agent_core/core-prompt/live-chat-assembly.ts` 已经把现有提示内容拆成 `system`、`development`、`contextual user` 等块，再按不同出口重组
- `src/agent_core/integrations/model-inference.ts` 会针对不同 provider 走不同 lower 路径
- `src/integrations/openai/api/generation/chat_completions_compat/adapter.ts` 接收的是更接近 `messages` 的兼容形状
- `src/integrations/anthropic/api/generation/messages/descriptor.ts` 接收的是 top-level `system` 加 `messages`
- `src/integrations/deepmind/api/generation/generate_content/create.ts` 接收的是更接近 `contents` 的形状

这说明：

- 同一套宿主语义，到了不同 provider / carrier，会落成不同承载字段
- 不同字段名之间不能直接画等号
- 宿主设计如果先绑定某一家字段名，后续一定会在别家适配时被迫扭曲

因此，Praxis 在 `PromptPack` 上必须坚持：

- 先定语义层
- 再定边界层
- 最后才做 provider/carrier lower

## 5. provider/carrier 映射原则

`PromptPack` 统一的是语义层、边界层和拼装规则，不是字段名本身。

这里的 `provider` 指模型厂商语义面，`carrier` 指具体承载通道或接口表面，例如 API、SDK、CLI 以及同一 provider 下不同 generation surface。二者都可能改变字段形状，但都不应反向定义宿主语义。

### 5.1 OpenAI 方向

OpenAI 一侧目前更接近 `developer` / `user` / `input` 一类分层，也可能因 surface 不同而表现为 `responses` 或 `chat.completions` 风格。

因此对 OpenAI 的理解应是：

- 它适合承接多角色、多输入块的表达
- 但这些角色名只是 OpenAI 侧 carrier 的表面，不是 Praxis 的最终语义命名
- Praxis 可以把 `governance`、`task`、`context` lower 成更接近 OpenAI 的层次，但不能把宿主设计改写成“只剩 developer/user 两层”

### 5.2 Anthropic 方向

Anthropic 一侧目前更接近 top-level `system` 加 `messages` 的结构。

从当前现实锚点看，Praxis 现有 lower 已经把 `system` 与 `developer` 一类内容归并进 Anthropic 的 `system`，再把用户向内容归入 `messages`。这说明 Anthropic 侧的字段边界与 Praxis 的三层语义不是一一对应关系。

因此对 Anthropic 的理解应是：

- 它适合承接“治理块集中上提、任务与上下文再进入消息体”的一种 lower 方式
- 但 Anthropic 的 top-level `system` 不是 Praxis `governance` 的唯一合法定义方式，它只是当前 carrier 的一种落点

### 5.3 Gemini 方向

Gemini 一侧目前更接近 `systemInstruction` 加 `contents` 这一类思路；即便在当前仓库某些现实实现中还呈现为把多层内容压入 `contents`，也不能把这种现状误认成宿主语义已经退化成单层长文本。

因此对 Gemini 的理解应是：

- 它更强调由系统指令与内容承载共同构成最终调用
- Praxis 对 Gemini 的适配应围绕三层语义做 lower，而不是要求宿主直接长成 Gemini 原生样子

### 5.4 映射基线

第一版冻结的不是“三家分别用什么字段”，而是以下方向：

- `governance`、`task`、`context` 必须先在宿主侧独立可辨认
- provider/carrier lower 可以合并、拆分、提升或下放这些层
- lower 后即便字段位置不同，也应仍能追溯其原始语义归属
- provider/carrier 适配器负责承载映射，不负责重新定义 PromptPack 语义

## 6. 组合与引用原则

`PromptPack` 必须是可组合、可分层、可引用的，不是一整段不可拆的长 prompt。

第一版至少应支持以下方向：

- 不同语义层独立存在
- 同一语义层可以由多个来源共同组成
- PromptPack 可以被 `Spec` 或 `Class` 以声明方式引用
- 某些块允许后续由运行态、模块或外部注入动态补入

这意味着 `PromptPack` 的核心组织方式应当更接近“声明块集合”，而不是“一段最终字符串”。

### 6.1 组合原则

组合时应遵守以下基线：

- `governance`、`task`、`context` 先按语义归类，再决定如何拼装
- 不同来源的块可以进入同一语义层，但应保留边界意识
- 拼装顺序应当可解释、可检查，而不是临时拼接

### 6.2 引用原则

引用时应遵守以下基线：

- PromptPack 可以被独立引用，而不是只能内联写死
- 一个 `agentCore` 声明可以同时引用多个 PromptPack 来源
- 后续文件系统、模块注入或动态槽位进入时，应继续遵守三层语义边界

### 6.3 边界意识

`PromptPack` 的价值不只在“能拼起来”，更在“知道每一块为什么在这里”。

因此后续实现应保留如下能力空间：

- 区分治理块与任务块
- 区分当前任务正文与上下文注入
- 区分静态声明块与动态注入块
- 在检查或导出时能够说明某块内容属于哪一层

本文不冻结最终导出格式，但冻结这种边界意识本身。

## 7. 与 Spec / Class 的关系

在 `agentCore` 声明模型里，`PromptPack` 是声明板块之一。

结合 `agent-core-spec-class-declaration-model-v1.md`，可以把分工理解为：

- `Spec` 负责声明 PromptPack 的边界目标、默认约束与允许引用范围
- `Class` 负责声明 PromptPack 如何被继承、覆写、组合
- `PromptPack` 文档本身负责说明“被引用的这一类声明块，语义层应该怎么分”

换句话说：

- `Spec / Class` 文档回答“声明模型怎样组织”
- 本文回答“PromptPack 这一声明板块内部，首先要统一什么”

因此，后续实现者在推进 prompt 子系统时，不应直接从 provider API 入手倒推对象模型，而应先把 `PromptPack` 作为声明板块稳定下来，再去接 `Spec`、`Class`、编译与运行态下放。

## 8. 当前不冻结的内容

为给后续 prompt 子系统保留演进空间，本文明确不写死以下细节：

- PromptPack 的最终文件系统规则
- dynamic `development_prompt` 的最终生成与注入机制
- user prompt 边界管理的最终实现细则
- 动态 slot 的精确声明语法
- 多来源块冲突时的最终 merge 算法
- provider 适配器内部的精确 lower schema
- 导出检查时的精确序列化格式

这意味着第一版的目标不是一次性发明完整 prompt 语言，而是先把语义地基打稳。

## 9. 结论

`PromptPack` 第一版的设计核心可以压缩为五点：

- Praxis 先统一自己的语义层，不直接照抄三家原生字段名
- 三层统一语义至少包括 `governance`、`task`、`context`
- provider/carrier 适配统一的是语义层、边界层与拼装规则，不是字段名本身
- PromptPack 必须可组合、可分层、可引用，而不是单块长 prompt
- PromptPack 作为 `Spec / Class` 声明板块之一，应先被稳定定义，再进入后续实现与编译链

后续 prompt 子系统的实现、文件系统和动态注入能力，都应围绕这条基线推进，而不是反过来让某个 provider 的当前字段形状决定 Praxis 的宿主设计。
