# customInterfaceRuleConstrainer

> 对应源码：`src/agentCore/agent_interfaceAdapter/custom_interfaceLayer/customInterfaceRuleConstrainer.ts`

## 1. 文件位置

- 所属顶层模块：接口适配层（`agent_interfaceAdapter`）。
- 所属路径：`agent_interfaceAdapter/custom_interfaceLayer`。
- 当前文件：`customInterfaceRuleConstrainer.ts`。
- 角色概括：定义 CMP、MP、TAP、multiagent 等内置模块与自定义接口进入 agentCore 的接口边界。

## 2. 文件职责

定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界。

这个文件的核心不是“占一个目录位置”，而是要在当前路径上形成一个可实现、可测试、可被 runtime 或相邻模块调用的窄能力点。它应该围绕“定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界”建立清晰的输入、输出、错误和治理边界。

## 2.1 文件名语义拆解

- 原始文件名：`customInterfaceRuleConstrainer.ts`。
- 命名片段：`custom` / `Interface` / `Rule` / `Constrainer`。
- 工程含义：这是接口适配层的一处能力点，重点是把官方模块或自定义接口纳入 runtime 契约和治理。
- 第一实现重点：定义接口声明、调用入口、规则约束和复用方式。
- 边界提醒：这里只定义进入 agentCore 的接口边界，不实现 CMP/MP/TAP/multiagent 的内部策略。

## 3. 目录语义

- 自定义接口层：定义用户自定义接口的定义、管理、复用与规则约束。

## 4. 源码头部能力注释

- 文件定位：Agent 接口适配层 / 自定义接口层。
- 核心目的：承载 custom Interface Rule Constrainer 这一能力位点。
- 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
- 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界
- 需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 把本文件能力包装成稳定的 TypeScript 类型、函数或类接口。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- 官方模块或自定义接口传入的接口定义、调用请求、能力声明和规则约束。
- runtime governance 与 contract surface 下发的接口边界要求。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- “定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界”后形成的标准化结果。
- 必要的事件、状态和错误信息，供上层继续编排或检查。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.interfaceAdapter
- runtime.governancePlane
- runtime.contractSurface

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- runtime.interfaceAdapter
- runtime.officialModuleSurface
- 上层自定义接口接入方

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要把官方模块内部策略塞进这里，也不要让接口绕过 runtime 治理。
- 不要提前冻结最终 schema、协议、目录树或字段枚举，除非用户明确进入冻结阶段。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- 先定义 TypeScript 类型契约：输入、输出、错误、上下文和最小配置。
- 实现一个最小纯函数或薄类壳，能完成“定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界”的可测路径。
- 所有副作用先通过明确依赖注入进入，避免在文件内部偷偷读全局状态。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法输入各至少一组。
- 验证该文件确实只完成“定义自定义接口层 custom / Interface / Rule / Constrainer 的接入和治理边界”，没有越界承担相邻模块职责。
- 验证错误结果可解释、可分类、不会泄漏不该暴露的内部细节。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它属于接口接入链：把官方模块或自定义接口纳入 runtime contract/governance，而不是绕过内核。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
