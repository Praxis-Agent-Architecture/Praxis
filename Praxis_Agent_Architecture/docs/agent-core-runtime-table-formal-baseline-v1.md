# agentCore runtime-table 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agent-core-host-design-baseline-v1.md` 中 `runtime-table` 一节的正式下钻文，也是 `Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack` 继续向运行态收束时必须经过的对象边界文。

本文只冻结 `runtime-table` 第一版的对象定位、装配边界、检查用途和导出用途，不重复宿主总纲，也不展开源码实现。

本文要回答的是：

- `runtime-table` 在 Praxis 宿主里到底是什么
- 它为什么是正式装配产物，而不是临时调试变量
- 它如何把 `Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack` 的编译后结果汇合起来
- 它为什么应当同时服务框架内部、高级用户和运行时启动
- 为什么第一版只冻结“它是什么、给谁用、边界在哪”，不冻结字段 schema、序列化格式和 boot 算法

本文不冻结以下内容：

- 完整字段表
- 具体 JSON 字段名
- 序列化格式
- boot 算法
- checker 的精确实现
- exporter 的精确格式
- compiler 的内部展开步骤

## 2. 上游输入

`runtime-table` 不是单独长出来的，它来自上游声明块在编译后的汇合结果。

从前几份基线文的分工看，这条链路已经清楚地分开了：

- `Spec / Class` 负责声明输入和复用组织
- `PromptPack` 负责提示语义块
- 能力系统负责能力名解析、映射表与宽度策略
- `ModelCarrier` 负责承载面分类与路径位阶
- `InterfacePack` 负责对外接口开放面

因此，`runtime-table` 的职责不是再发明一套新语义，而是把这些上游声明在编译后汇总为一个可检查、可导出、可按表启动的正式装配结果。

### 2.1 它接收的不是单一输入

`runtime-table` 不是某一个上游对象的别名，也不是把某个对象原封不动改名之后就能成立。

它接收的是一组已经过编译方向整理的结果，包括但不限于：

- `Spec` 的约束与默认目标
- `Class` 的继承、覆写和组合展开结果
- `PromptPack` 的语义块引用与拼装结果
- 能力系统的解析结果
- `ModelCarrier` 的承载面与 surface 选择结果
- `InterfacePack` 的开放结果

这些输入先分别成立，再在 `runtime-table` 这一层汇合。

### 2.2 它不是 provider payload

`runtime-table` 不是 provider 原始 payload。

provider payload 只回答“某家服务端这次收到了什么字段”，而 `runtime-table` 回答的是“宿主编译后，最终准备如何装配和启动这一份 agentCore 运行态”。

这意味着：

- provider payload 可能只是 `runtime-table` 某个下放结果的承载壳
- `runtime-table` 自身不能被缩减成某一家 API 请求体
- 后续 carrier 下放可以变化，但 `runtime-table` 仍然是宿主侧正式结果

### 2.3 它不是 prompt 字符串

`runtime-table` 也不是单纯的 prompt 字符串。

`PromptPack` 负责语义块，`runtime-table` 负责编译后的装配结果。前者是“哪些提示语义存在”，后者是“这些语义在运行时如何被正式组织起来”。

因此，`runtime-table` 可以携带 prompt 相关引用、归属和装配关系，但不能被降格成一段拼接好的长文本。

### 2.4 它也不是 capability registry 本身

`runtime-table` 不是 capability registry 本身。

capability registry 侧重“有哪些能力、如何解析、如何映射”，而 `runtime-table` 侧重“这些能力解析和映射的编译结果，最终如何进入运行时装配”。

白话讲：

- registry 更像清单和解析面
- `runtime-table` 更像最终装配账本

两者有关联，但不是同一个对象。

## 3. 产物边界

第一版冻结的不是字段形状，而是 `runtime-table` 的产物边界。

### 3.1 正式装配产物

`runtime-table` 是正式装配产物，不是临时调试变量，也不是只给开发者看的内存中间态。

它一旦存在，就应该被当作宿主正式运行态的一部分来对待，能够参与：

- 框架内部导出
- 框架内部检查
- 高级用户导出
- 高级用户检查
- 运行时按表启动

### 3.2 一等产物

系统内部必须把 `runtime-table` 当一等产物。

这句话的意思不是“普通用户都要手动编辑它”，而是说：

- 任何后续 compile 都应围绕它展开
- 任何 checker 都应围绕它展开
- 任何 exporter 都应围绕它展开
- 任何 boot 过程都应围绕它展开

换句话说，`runtime-table` 是运行态的正式中心对象，不是旁路缓存。

### 3.3 对普通用户的可见性

普通用户可以不直接操作 `runtime-table`。

这是正常的，因为普通用户的主要交互点应当仍然是声明模型、能力名、任务输入或更高层接口，而不是装配层细节。

但“普通用户不直接操作”不等于“系统内部可以忽略它”。相反，越是对外屏蔽，越要求内部把它定义清楚。

### 3.4 产物边界与宿主边界

`runtime-table` 的边界应当保持在宿主装配层内。

它不能被混写成：

- 纯 provider 请求体
- 纯提示词文本
- 纯能力注册表
- 纯模块配置文件

它是这些声明块的编译后汇总结果，但不是其中任意一块本身。

## 4. 至少承载的信息边界

第一版不冻结完整字段表，但必须先冻结 `runtime-table` 至少承载哪些类信息。

### 4.1 模型 / carrier 选择结果

`runtime-table` 至少要承载模型和 carrier 的选择结果。

这里说的不是 provider 名字列表，而是“这份装配结果最终落到哪类承载面、哪条路径、哪种运行表面”的结果。

这部分信息是运行时可启动性的基础，因为 boot 需要知道要从哪一类承载面进入。

### 4.2 PromptPack 装配结果引用

`runtime-table` 至少要承载 PromptPack 的装配结果引用。

它不需要在本文里定义 PromptPack 的完整内部字段，但要能表达：

- 哪些 PromptPack 语义块被纳入
- 这些语义块在装配后如何被引用
- 这些引用怎样进入运行态

也就是说，`runtime-table` 要能指向“已经装配好的提示语义结果”，而不是只知道原始文本文件在哪里。

### 4.3 能力解析结果

`runtime-table` 至少要承载能力解析结果。

这里指的是经过能力名、映射表和宽度策略之后，最终得出的可执行路径结论。它不是 registry 本身，也不是用户输入本身，而是编译后的解析落点。

### 4.4 接口开放结果

`runtime-table` 至少要承载接口开放结果。

这部分回答的是：这一份运行态最终开放哪些接口面、哪些接入位点、哪些正式调用入口。

这里需要的是“开放结果”，不是把 `InterfacePack` 再原样抄一遍。

### 4.5 宽度 / 约束 / 默认策略结果

`runtime-table` 至少要承载宽度、约束和默认策略的编译结果。

这部分信息说明：

- 哪些默认值被采纳
- 哪些约束被提升为硬边界
- 哪些宽度策略在这次装配里生效
- 哪些默认解析结果最终被固定下来

换句话说，`runtime-table` 不只是“有什么”，还要能说明“这些东西在这次装配里为什么以这种方式成立”。

### 4.6 外部官方模块接入位点

`runtime-table` 还应当承载与外部官方模块的接入位点。

这里说的接入位点，是指后续 `cmp / mp / tap / multiAgent` 等官方模块或外部治理系统，如何在宿主正式装配结果上找到自己的挂接处。

本文不定义这些模块的内部行为，也不提前写死它们的接入实现，只冻结它们在 `runtime-table` 中必须有可定位的装配位置。

## 5. 检查与导出

`runtime-table` 第一版必须可被检查，也必须可被导出。

### 5.1 框架内部检查

框架内部检查的目标，是确认装配后的结果是不是符合宿主规则。

检查的重点应当是：

- 这份装配结果是否完整
- 上游声明是否都已正确汇合
- 选择结果和开放结果是否能对得上
- 有无越界的默认值或错误引用

检查不是为了重建 schema 的所有细节，而是为了确认装配结果可以被宿主接受。

### 5.2 高级用户检查

高级用户应当能够导出并检查 `runtime-table`。

这里的“高级用户”不是普通操作用户，而是需要诊断、审查或治理装配结果的用户。让他们看见 `runtime-table` 的目的，是让运行态变得可解释，而不是把宿主变成黑盒。

### 5.3 导出用途

`runtime-table` 的导出用途，应该服务于三类场景：

- 宿主内部审查
- 用户侧诊断与复核
- 运行态启动前确认

导出不等于公开 schema 冻结。第一版只冻结“可以导出”，不冻结“导出长什么样”。

## 6. 运行时关系

`runtime-table` 是 compile、checker、exporter 和 boot 共同围绕的中心对象，但本文不提前发明完整编译器实现。

### 6.1 compile 围绕它展开

后续 `compile` 的角色，应当是把上游声明块汇合成 `runtime-table`。

这里的 compile 只表示方向：

- 先从声明输入出发
- 再展开各类复用、引用和选择
- 最后落成正式装配结果

本文不写完整编译器算法，也不写中间 IR 结构。

### 6.2 checker 围绕它展开

后续检查器应当围绕 `runtime-table` 判断“这份装配能不能成立”。

这意味着检查对象不是某个零散声明片段，而是编译后正式结果。

### 6.3 exporter 围绕它展开

后续导出器应当围绕 `runtime-table` 把正式结果交给内部审查或高级用户查看。

导出的对象是“装配结果本身”，不是临时变量回放。

### 6.4 boot 围绕它展开

后续 boot 过程应当按 `runtime-table` 启动。

这里的“按表启动”只冻结方向，不冻结算法：

- 启动时读取正式装配结果
- 依据其中的模型 / carrier、PromptPack、能力解析和接口开放结果初始化运行态
- 在运行时不再把上游声明重新当成唯一真相

也就是说，boot 不是凭空生成运行态，而是消费已经装配好的 `runtime-table`。

## 7. 现实锚点

本文把现有仓库代码当作现实锚点，不把它们直接写死成新标准的最终 schema。

### 7.1 声明 -> 编译 的现实路径

在当前仓库里，`src/agent_core/goal/*` 已经能看到清晰的三段式形状：

- `createGoalSource` 负责把输入整理成源层对象
- `normalizeGoal` 负责把源层整理成规范化对象
- `compileGoal` 负责把规范化对象编译成 `GoalFrameCompiled`

这说明“源 -> 规范化 -> 编译”的思路不是拍脑袋想出来的，而是已经在现实现象里成立。

### 7.2 编译结果与运行态的现实关系

`src/agent_core/types/kernel-goal.ts` 里的 `GoalFrameCompiled`，以及 `src/agent_core/types/kernel-run.ts` 里的 `RunRecord.goal`，已经体现出“编译后的目标会进入运行态”的现实关系。

`src/agent_core/runtime.ts` 里 `createCompiledGoal(source)` 再进入 `createRunFromSource(input)` 的路径，也说明运行时不是直接吃原始输入，而是先吃编译结果。

这些锚点可以支持本文的判断：`runtime-table` 作为“编译后装配结果”并不是空想，而是现有代码路径的抽象上提。

### 7.3 但不能反向绑死新标准

虽然现实锚点说明了方向正确，但本文不能把旧实现字段反向绑死为新标准。

所以：

- 可以承认“编译后会有正式结果”
- 可以承认“运行态会消费编译结果”
- 但不能据此把现有 `GoalFrameCompiled`、`RunRecord` 或 `createRunFromSource` 的字段形状直接升级成 `runtime-table` 的冻结 schema

换句话说，现实锚点证明的是“装配结果这件事存在”，不是“旧字段就是未来标准”。

### 7.4 与外部官方模块的现实接入面

当前仓库中也能看到不少模块化接入的现实形状，例如 `cmp / mp / tap` 相关子系统、能力注册与运行态桥接。

这些现象说明，把 `runtime-table` 设计成能挂接外部官方模块，并不是概念发明，而是与现有架构方向一致。

但本文只承认“存在接入位点这一层需求”，不把它写成固定的模块列表或固定字段。

## 8. 与前序文档的接法

这份文档只做一件事：把前面几份基线文的成果收束到运行态装配结果上。

- `Spec / Class` 管声明输入
- `PromptPack` 管提示语义块
- 能力系统管解析逻辑
- `ModelCarrier` 管承载面分类
- `InterfacePack` 管对外开放面
- `runtime-table` 管最终编译后装配结果

因此，后续所有 `compile`、检查器、导出器和 boot 过程，都应该围绕 `runtime-table` 展开，而不是绕开它另起一套运行时真相。

## 9. 当前不冻结的内容

下面这些内容留待后续设计或实现子系统定义，本文不写死：

- `runtime-table` 的完整字段 schema
- `runtime-table` 的具体 JSON 字段名
- `runtime-table` 的序列化格式
- `runtime-table` 的 boot 算法
- checker 的精确校验规则
- exporter 的精确导出格式
- compile 的内部展开步骤
- 是否采用某种内部 IR
- 是否允许多种序列化后端
- 外部官方模块接入位点的具体字段形状

## 10. 结论

`runtime-table` 第一版的冻结重点很明确：

- 它是正式装配产物，不是临时调试变量
- 它是编译后汇合 `Spec / Class / PromptPack / 能力系统 / ModelCarrier / InterfacePack` 的正式结果
- 它要能被框架内部导出与检查，也要能被高级用户导出与检查
- 它要成为运行时按表启动的中心对象
- 它要承载对象定位、装配边界、检查用途和导出用途
- 它不在本文中冻结字段 schema、序列化格式和 boot 算法

后续实现者如果要继续往下走，第一步不是先把 `runtime-table` 变成某种具体 JSON，而是先围绕它把 compile、checker、exporter 和 boot 的职责边界继续收紧。
