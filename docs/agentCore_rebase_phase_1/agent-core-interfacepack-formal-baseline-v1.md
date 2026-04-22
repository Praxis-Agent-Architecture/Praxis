# agentCore InterfacePack 正式基线 v1

## 1. 定位

本文是 `Praxis_Agent_Architecture/docs/agentCore/agentCore_rebase_phase_1/agent-core-host-design-baseline-v1.md` 中 `InterfacePack` 一节的正式下钻文，用来冻结 `agentCore` 第一版里 `InterfacePack` 的对象定位、前门边界、官方接口方向与外部治理接入关系。

本文要回答的是：

- `InterfacePack` 在 Praxis 宿主里到底是什么
- 为什么它是“开放哪些前门”的声明层，而不是四大官方模块本身
- `single-agent / multi-agent / cmp / tap / mp / custom` 这些方向在第一版里应如何被承认
- 为什么 `InterfacePack` 负责的是开放结果与接入前门，而不是模块内部状态机或逐模块配置中心
- 后续 `runtime-table`、官方模块和外部治理系统应如何围绕它继续展开

本文不重复宿主总纲，也不展开源码实现。

本文明确不冻结以下内容：

- 完整接口清单
- 完整字段 schema
- 具体 JSON 字段名
- 精确文件拆分
- 完整 DSL 关键字
- 完整 `custom interface` 机制
- 四大官方模块接入位点的具体字段形状

第一版的目标不是一次性发明完整接口语言，而是先把“宿主到底在开放什么面、这些开放面如何分层”固定下来。

## 2. 上位基线承接

结合前面的宿主总纲、`Spec / Class`、`PromptPack`、能力系统、`ModelCarrier` 与 `runtime-table` 文档，以下结论已经成立，本文直接承接：

- `Spec / Class` 负责声明输入与复用组织。
- `PromptPack` 负责提示语义块。
- 能力系统负责能力名、映射表与宽度策略。
- `ModelCarrier` 负责承载面与 surface 分类。
- `runtime-table` 负责记录正式装配结果，其中至少要承载接口开放结果。
- `cmp / mp / tap / multiAgent` 第一版只作为官方模块占位与接入协议存在，不提前写死内部行为系统。

因此，本文不是重新定义这些模块内部怎么实现，而是解释：当宿主需要正式声明“对外开放什么面”时，这一层对象应该如何成立。

## 3. InterfacePack 的定义边界

`InterfacePack` 是宿主对外暴露的一组接口与接入协议的集合。

白话讲，它回答的问题不是“系统内部有多少模块”，而是：

- 这一份 `agentCore` 最终准备开放哪些正式入口
- 哪些外部系统或上层壳可以通过这些入口接管、观察、导出或调用运行态
- 哪些调用面是宿主承认的正式前门

因此，`InterfacePack` 不是四大官方模块本身。

它不是：

- `cmp` 的内部工作流实现
- `mp` 的内部存储、检索与提升逻辑
- `tap` 的内部治理、审批、交付与 replay 状态机
- `multiAgent` 的内部治理逻辑、管理策略或调度器本体

它是宿主用来声明“这些东西可以从哪些正式前门被接入、被观察、被调用、被治理”的那一层。

## 4. 前门与后厨边界

`InterfacePack` 第一版必须明确区分“前门”与“后厨”。

### 4.1 前门

这里说的前门，是宿主正式承认可以对外开放的调用面、观察面、导出面和接入面。

这些前门回答的是：

- 外部调用方从哪里进入
- 外部治理系统从哪里挂接
- 外部检查器或高级用户从哪里读到正式结果

### 4.2 后厨

后厨指模块内部实现所需的运行细节，例如：

- 内部状态机
- 中间态快照
- 逐阶段调度逻辑
- 专属于模块内部互相配合的桥接细节

这些内容可能真实存在，但不应被 `InterfacePack` 直接写成“默认对外开放面”。

### 4.3 第一版冻结的边界

第一版冻结以下判断：

- `InterfacePack` 负责前门，不负责后厨。
- 它负责开放结果，不负责模块内部运行真相。
- 它可以声明“可接入”“可观察”“可导出”“可治理”，但不把内部状态机直接等同于接口面。
- 它也不能退化成逐模块配置中心。

换句话说，`InterfacePack` 要做的是“开放边界整理”，不是“把内部实现全摊平给外部”。

## 5. 第一版承认的官方接口方向

第一版至少正式承认以下六类方向：

- `single-agent`
- `multi-agent`
- `cmp`
- `tap`
- `mp`
- `custom`

这里冻结的是方向，不是完整接口枚举表。

### 5.1 single-agent

`single-agent` 是最基本的宿主前门。

它回答的是：如果用户只是拉起一个最小可用的 `agentCore`，宿主至少要开放怎样的基本进入面、调用面与运行态检查面。

白话讲，没有它，`agentCore` 连“单体被使用”都说不清楚。

### 5.2 multi-agent

`multi-agent` 在这里不是 `agentCore` 本体，而是外部治理 / 管理系统的一种正式接入方向。

这点必须明确：

- `multiAgent` 不是 `agentCore` 内部长出来的一块核心器官
- 它代表的是“这个 `agentCore` 是否开放被多智能体系统接管和治理的接口”

所以在 `InterfacePack` 语境里，`multi-agent` 关注的是：

- 是否存在正式治理前门
- 是否允许上层系统观察、接管或编排这份 `agentCore`
- 哪些边界可以交给多智能体系统

它不提前定义多智能体系统内部怎么调度、怎么仲裁、怎么分工。

### 5.3 cmp

`cmp` 在这里仍然只是官方模块的接入协议面。

它回答的是：宿主是否正式开放给 `cmp` 使用或挂接的前门，例如：

- 项目级入口
- 工作流入口
- 五 agent 运行入口
- `tapBridge` 入口
- worksite 导出入口

这些都是“可正式接入的面”，不是 `cmp` 内部行为系统本身。

### 5.4 tap

`tap` 在这里也只是官方模块的接入协议面。

它关注的是：宿主是否开放给治理控制面、执行桥、审批桥、导出桥使用的正式前门。

它不提前定义：

- tool reviewer 的内部状态机
- provisioner 的内部交付逻辑
- replay 的内部恢复链

这些属于 `tap` 子系统设计，不属于 `InterfacePack` 第一版。

### 5.5 mp

`mp` 在这里仍然只表示官方模块的接入协议面。

它关注的是：宿主是否开放给记忆治理、搜索、物化、导出与桥接使用的正式前门。

它不提前定义：

- memory scope 的全部状态规则
- promotion 的细部策略
- search planner 的最终实现结构

这些仍属于 `mp` 子系统自己要解决的事。

### 5.6 custom

`custom` 方向代表宿主需要允许用户或上层系统在官方方向之外，声明额外的正式前门。

第一版只冻结这件事本身：

- 宿主不能把所有接口方向都写死成官方保留字
- 需要为未来扩展保留正式接口面

但本文不提前写死：

- `custom interface` 的完整机制
- 注册方式
- 命名规则
- 校验规则

## 6. 与外部治理系统的关系

`InterfacePack` 的一个关键职责，是把宿主和外部治理系统之间的边界说清楚。

### 6.1 它不等于治理系统

外部治理系统可以是：

- `multiAgent`
- `cmp`
- `tap`
- `mp`
- 未来别的官方模块或自定义治理壳

但 `InterfacePack` 本身不是这些系统中的任何一个。

它只是声明：宿主开放了哪些接入前门，让这些系统可以合法挂接。

### 6.2 它不应变成模块配置中心

如果把 `InterfacePack` 写成逐模块配置总表，后面很容易跑偏成：

- 哪个模块有哪些内部状态
- 哪个模块默认策略是什么
- 哪个模块内部调度器怎么转

这会把“前门声明层”重新塌回“模块实现层”。

第一版明确排除这种写法。

### 6.3 它要能服务治理，但不代替治理

后续外部治理系统要能围绕 `InterfacePack` 获得这些最小稳定前提：

- 这份 `agentCore` 对外到底开放了什么面
- 哪些面是官方方向
- 哪些面是扩展方向
- 哪些治理系统可以正式挂接

但 `InterfacePack` 不负责替这些系统做内部策略决策。

## 7. 与前面文档的分工

到目前为止，几份基线文档的分工应当保持如下关系：

- `Spec / Class` 决定声明输入与复用组织
- `PromptPack` 决定提示语义块
- 能力系统决定能力如何解析
- `ModelCarrier` 决定承载面分类
- `InterfacePack` 决定“对外开放什么面”
- `runtime-table` 记录编译后的开放结果

因此，`InterfacePack` 不是：

- `Spec / Class` 的替代品
- `PromptPack` 的替代品
- 能力 resolver 的替代品
- carrier 分类表的替代品
- `runtime-table` 的替代品

它的职责只有一件事：把宿主正式承认的对外接口面和接入协议面定义清楚。

### 7.1 与 runtime-table 的关系

后续 `runtime-table` 至少要承载 `InterfacePack` 的开放结果。

但这里必须保持边界：

- `runtime-table` 记录的是编译后结果
- `InterfacePack` 记录的是声明层的开放方向与前门边界

所以 `runtime-table` 不需要把 `InterfacePack` 原样照抄进去，只需要承载“最终开放了哪些面、哪些接入位点成立了”这一类正式结果。

## 8. 当前仓库的现实锚点

`InterfacePack` 不是拍脑袋造出来的概念，当前仓库里已经有不少现实锚点支持“正式前门”的存在。

### 8.1 cmp-api 已经体现正式前门集合

`src/agent_core/cmp-api/index.ts` 已经把 `cmp` 对外可见的正式面拆成几组稳定入口：

- `project`
- `workflow`
- `fiveAgent`
- `tapBridge`
- `worksite`

这些入口的意义，不在于它们的当前字段形状，而在于它们已经表现出一种“模块不是直接暴露全部内部对象，而是通过正式 API 面开放前门”的现实。

### 8.2 tap / mp 也已有可正式接入的出口形状

`src/agent_core/ta-pool-runtime/index.ts` 与 `src/agent_core/mp-runtime/index.ts` 当前导出的并不只是私有内部函数，而是一组可被外部 runtime 或更上层门面使用的正式类型与 helper。

这说明：

- `tap / mp` 不只是埋在内部状态机里
- 它们已经存在可被宿主承认为正式出口的一层现实形状

### 8.3 当前 runtime 已经在消费接口开放结果

`src/agent_core/live-agent-chat.ts` 当前已经在消费一些接近“开放结果”的面，例如：

- `state.runtime.cmp.worksite.exportCorePackage(...)`
- `state.runtime.cmp.worksite.exportTapPackage(...)`
- `state.runtime.cmp.worksite.exportMpCandidates(...)`

这些调用说明：运行态和上层壳已经需要依赖一组稳定入口，而不是直接钻进所有内部细节。

### 8.4 现实锚点只能证明方向，不能反绑标准

这些现实锚点足以支持本文的判断：`InterfacePack` 作为“宿主对外开放面的声明层”不是概念发明。

但不能据此把：

- 当前导出函数名
- 当前对象字段
- 当前目录拆分
- 当前 API 形状

直接升级成新宿主标准的冻结 schema。

本文只承认它们证明了“正式前门确实存在”，不承认它们自动等于未来标准。

## 9. 当前不冻结的内容

为给后续 `InterfacePack` 子系统保留演进空间，本文明确不写死以下内容：

- 完整接口清单
- 精确文件拆分
- 完整字段 schema
- 具体 JSON 字段名
- 完整 DSL 关键字
- `custom interface` 的完整注册与校验机制
- `single-agent / multi-agent / cmp / tap / mp` 的精确子接口枚举
- 四大官方模块接入位点的具体字段形状
- `runtime-table` 中接口开放结果的最终序列化结构

这意味着后续实现者的下一步，不是先发明一套完整接口语言，而是先围绕这几件事继续下钻：

- 如何把“前门”正式声明出来
- 如何把“开放结果”编译进 `runtime-table`
- 如何让官方模块和外部治理系统围绕这些正式前门挂接
- 如何在不泄漏后厨细节的前提下，给高级用户和宿主运行时足够稳定的入口

## 10. 结论

`InterfacePack` 第一版的冻结重点可以压缩为六点：

- 它是宿主对外暴露的一组接口与接入协议的集合。
- 它不是四大官方模块本身，而是声明“开放哪些前门”的那一层。
- 第一版至少承认 `single-agent / multi-agent / cmp / tap / mp / custom` 六个方向。
- `multiAgent` 在这里表示“这个 `agentCore` 是否开放被外部治理系统接管和治理的接口”，而不是 `agentCore` 本体。
- `cmp / mp / tap` 在这里仍然只是官方模块的接入协议面，不提前写死内部行为系统。
- 后续实现、`runtime-table` 与外部治理系统，都应围绕这些正式前门继续展开，而不是让旧实现字段反向绑死新标准。
