# runtimeCheckRunner

> 对应源码：`src/runtimeImplementation/runtime.inspection/runtimeCheckRunner.ts`

## 1. 文件位置

- 所属顶层模块：运行时承托层（`agent_runtimeImplementation`）。
- 所属路径：`agent_runtimeImplementation/runtime.inspection`。
- 当前文件：`runtimeCheckRunner.ts`。
- 角色概括：agentCore 的核心运行承托面，面向上层应用、官方模块、治理、契约、调用、检查、调试、自修复和自适应运行。

## 2. 文件职责

实现运行检查面中的 runtime / Check / Runner 能力。

这个文件的核心不是“占一个目录位置”，而是要在当前路径上形成一个可实现、可测试、可被 runtime 或相邻模块调用的窄能力点。它应该围绕“实现运行检查面中的 runtime / Check / Runner 能力”建立清晰的输入、输出、错误和治理边界。

## 2.1 文件名语义拆解

- 原始文件名：`runtimeCheckRunner.ts`。
- 命名片段：`runtime` / `Check` / `Runner`。
- 工程含义：这是 runtime 中 `runtime.inspection` 表面下的 `runtimeCheckRunner` 能力点，重点是让上层应用或官方模块通过 runtime 稳定使用 agentCore。
- 第一实现重点：先明确它暴露给谁、接收什么上下文、返回什么状态或结果、经过哪些治理/契约检查。
- 边界提醒：runtime 是承托面，不应吞并 executionEngine、modelAdapter、interfaceAdapter 的内部实现。

## 3. 目录语义

- 运行检查面：检查契约、治理、模块挂载、surface readiness 和运行不变量。

## 4. 源码头部能力注释

- 文件定位：Agent 运行态实现层 / 运行检查面。
- 核心目的：承载 runtime Check Runner 这一能力位点。
- 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
- 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 实现运行检查面中的 runtime / Check / Runner 能力
- 需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
- 如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
- 把本文件能力包装成稳定的 TypeScript 类型、函数或类接口。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- runtime 创建/调用/管理过程中传入的上下文、契约、策略、事件或命令。
- 来自上层应用、官方模块、执行引擎、模型适配层或接口适配层的运行信号。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- 明确的 runtime 结果、状态变化、事件、契约判断或治理判断。
- 可被上层应用、官方模块或其他 runtime surface 消费的稳定结构。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。
- 治理拒绝、契约失败、模块未挂载、runtime 未 ready、状态不一致要形成稳定错误码或错误对象。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.contractSurface
- runtime.governancePlane
- runtime.invocationMethod

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- 上层 Agent 应用
- CMP/MP/TAP/multiagent 官方模块
- 其他 runtime surface

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要把 runtime 写成普通启动器，也不要让上层应用直接碰执行引擎内部状态。
- 不要提前冻结最终 schema、协议、目录树或字段枚举，除非用户明确进入冻结阶段。
- 不要允许上层应用或官方模块绕过 runtime governance 直接操纵内部状态。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- 先定义 TypeScript 类型契约：输入、输出、错误、上下文和最小配置。
- 实现一个最小纯函数或薄类壳，能完成“实现运行检查面中的 runtime / Check / Runner 能力”的可测路径。
- 所有副作用先通过明确依赖注入进入，避免在文件内部偷偷读全局状态。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法输入各至少一组。
- 验证该文件确实只完成“实现运行检查面中的 runtime / Check / Runner 能力”，没有越界承担相邻模块职责。
- 验证错误结果可解释、可分类、不会泄漏不该暴露的内部细节。
- 验证 runtime surface 在未 ready、治理拒绝、契约失败时的行为一致。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它属于 runtime 主干：上层应用和官方模块都应先经过 runtime，再进入执行、模型或接口适配层。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
