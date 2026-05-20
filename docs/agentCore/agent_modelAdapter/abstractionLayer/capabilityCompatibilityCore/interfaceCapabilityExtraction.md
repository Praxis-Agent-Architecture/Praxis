# interfaceCapabilityExtraction

> 对应源码：`src/agentCore/agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore/interfaceCapabilityExtraction.ts`

## 1. 文件位置

- 所属顶层模块：模型适配层（`agent_modelAdapter`）。
- 所属路径：`agent_modelAdapter/abstractionLayer/capabilityCompatibilityCore`。
- 当前文件：`interfaceCapabilityExtraction.ts`。
- 角色概括：把 OpenAI、Anthropic、DeepMind/Gemini 和自定义上游格式接入 agentCore，并统一成内核可使用的模型能力。

## 2. 文件职责

实现模型抽象层中的 interface / Capability / Extraction 能力。

这个文件的核心不是“占一个目录位置”，而是要在当前路径上形成一个可实现、可测试、可被 runtime 或相邻模块调用的窄能力点。它应该围绕“实现模型抽象层中的 interface / Capability / Extraction 能力”建立清晰的输入、输出、错误和治理边界。

## 2.1 文件名语义拆解

- 原始文件名：`interfaceCapabilityExtraction.ts`。
- 命名片段：`interface` / `Capability` / `Extraction`。
- 工程含义：这是跨厂商能力抽象链路中的一个能力点，重点是把 provider/custom 差异整理成可比较、可选择、可桥接的中间形态。
- 第一实现重点：定义输入能力描述、中间映射结构、兼容性判断和缺口说明。
- 边界提醒：这里做抽象，不直接发网络请求，也不直接暴露给上层 Agent 应用。

## 3. 目录语义

- 模型抽象层：把不同 provider/custom 格式抽象成 agentCore 可继续处理的能力和格式。
- 能力兼容核心：提取、映射、转换和保护跨厂商能力差异。

## 4. 源码头部能力注释

- 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
- 核心目的：承载 interface Capability Extraction 这一能力位点。
- 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
- 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 实现模型抽象层中的 interface / Capability / Extraction 能力
- 需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 把本文件能力包装成稳定的 TypeScript 类型、函数或类接口。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- 真实上游能力描述、接口格式、模型能力信号和用户通过 DSL 表达的调用意图。
- provider/custom 格式中的字段、限制、差异和兼容性风险。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- 跨厂商抽象后的能力描述、格式描述、中间映射结果和兼容性判断。
- 可被 bridgingLayer 消费的统一中间结构。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.modelAdapter
- runtime.governancePlane
- providerCarrierRegistry
- DSL/Spec 表达、能力兼容规则、真实上游能力描述

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- agent_modelAdapter/bridgingLayer
- runtime.modelAdapter/modelCapabilityBridge

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要让 provider 字段形状反向定义 agentCore，也不要把自定义格式升格成内核标准。
- 不要提前冻结最终 schema、协议、目录树或字段枚举，除非用户明确进入冻结阶段。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- 先定义 TypeScript 类型契约：输入、输出、错误、上下文和最小配置。
- 实现一个最小纯函数或薄类壳，能完成“实现模型抽象层中的 interface / Capability / Extraction 能力”的可测路径。
- 所有副作用先通过明确依赖注入进入，避免在文件内部偷偷读全局状态。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法输入各至少一组。
- 验证该文件确实只完成“实现模型抽象层中的 interface / Capability / Extraction 能力”，没有越界承担相邻模块职责。
- 验证错误结果可解释、可分类、不会泄漏不该暴露的内部细节。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它处在真实调用层和桥接层之间：把 provider/custom 差异整理成跨厂商能力抽象。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
