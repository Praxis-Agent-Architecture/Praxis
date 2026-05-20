# shell.interactiveControl

> 对应源码：`src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.interactiveControl.ts`

## 1. 文件位置

- 所属顶层模块：执行引擎（`agent_executionEngine`）。
- 所属路径：`agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction`。
- 当前文件：`shell.interactiveControl.ts`。
- 角色概括：Agent 的执行身体，负责输入输出、PromptPack、主循环、状态机、基础工具原语和执行事件暴露。

## 2. 文件职责

提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语。

这个文件的核心不是“占一个目录位置”，而是要在当前路径上形成一个可实现、可测试、可被 runtime 或相邻模块调用的窄能力点。它应该围绕“提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语”建立清晰的输入、输出、错误和治理边界。

## 2.1 文件名语义拆解

- 原始文件名：`shell.interactiveControl.ts`。
- 命名片段：`shell` / `interactive` / `Control`。
- 工程含义：这是 `shellBase` 下 `shellInteraction` 分组里的 `interactiveControl` 基础工具原语，重点是把一个底层动作做成可治理、可审计、可测试的最小工具能力。
- 第一实现重点：先定义工具调用参数、权限需求、dry-run/guard/audit 结果，再决定是否接真实系统动作。
- 与 TAP 的关系：这里只提供底层原语；审批、组合、专业工具库和替换策略应交给 TAP 高级系统。

## 3. 目录语义

- 基础工具原语层：提供 Agent 成立所需的底层工具能力，让 TAP 在其上构建更高级工具治理系统。
- Shell 基础工具：shell 检测、命令生成、执行、监控、进程控制和交互

## 4. 源码头部能力注释

- 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
- 核心目的：提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语。
- 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
- 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
- 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。

## 5. 需要提供的能力

- 提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语
- 需要定义该能力的输入、输出、错误、权限需求和可观测事件。
- 这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
- 后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
- 把本文件能力包装成稳定的 TypeScript 类型、函数或类接口。
- 为上层调用方保留必要的运行上下文、治理上下文和事件线索。
- 在不冻结最终 schema 的前提下，给后续真实实现留下最小但清楚的扩展点。

## 6. 输入边界

- runtime/toolInvocationEntrypoint 下发的工具调用请求。
- TAP 治理、执行上下文、资源限制、工作目录、目标对象和审计上下文。

输入边界必须窄：只接收完成本文件职责所需的材料，不把相邻模块的大对象整包吞进来。

## 7. 输出边界

- 工具执行结果、工具事件、审计材料和可交给 TAP 继续治理的状态。
- 不泄漏底层实现细节的标准工具结果信封。

输出边界必须稳定：上层应该依赖这里给出的标准结构，而不是依赖内部临时变量、provider 原始字段或工具底层细节。

## 8. 错误边界

- 参数缺失、契约不满足、权限不足、作用域越界时必须返回可解释错误。
- 工具执行失败、环境缺失、危险操作、资源越界和审批未通过要区分处理。

错误处理要服务工程构建：第一版可以简单，但必须可分类、可测试、可被 runtime inspection/debug/selfRepair 继续消费。

## 9. 依赖对象

- runtime.execEngine
- runtime.governancePlane
- runtime.contractSurface
- runtime.invocationMethod/toolInvocationEntrypoint
- TAP approval/governance bridge
- 基础环境与资源限制

依赖关系应该通过显式参数、接口或 runtime context 进入，不要在文件内部形成隐式全局耦合。

## 10. 被谁调用

- runtime.invocationMethod/toolInvocationEntrypoint
- runtime.execEngine
- TAP 高级工具系统

调用方只能依赖本文件公开的窄接口；如果需要更多能力，应新增相邻能力点或上移到 runtime surface，而不是把本文件写胖。

## 11. 不应该做什么

- 不要在这里写上层产品逻辑，也不要让它直接绑定某一家 provider 的请求格式。
- 不要提前冻结最终 schema、协议、目录树或字段枚举，除非用户明确进入冻结阶段。
- 不要把基础工具原语写成 TAP 的完整高级工具系统；TAP 负责更上层的审批、治理和专业工具组合。

越界判断标准很简单：如果实现开始替别的模块做策略、产品逻辑、最终协议冻结或大而全编排，就应该停下来拆文件。

## 12. 最小实现建议

- 先定义 TypeScript 类型契约：输入、输出、错误、上下文和最小配置。
- 实现一个最小纯函数或薄类壳，能完成“提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语”的可测路径。
- 所有副作用先通过明确依赖注入进入，避免在文件内部偷偷读全局状态。
- 危险动作先只实现 dry-run / guard / audit path，再逐步打开真实执行。

第一版实现应该追求“能被调用、能被测、边界清楚”，不要追求一次性完整。

## 13. 最小测试建议

- 空输入、最小合法输入、非法输入各至少一组。
- 验证该文件确实只完成“提供 Shell 基础工具 / Shell 交互 中的“控制交互进程”基础能力原语”，没有越界承担相邻模块职责。
- 验证错误结果可解释、可分类、不会泄漏不该暴露的内部细节。
- 验证 guard/dry-run/audit path，避免测试误触真实危险操作。

测试优先证明边界正确，而不是证明未来完整能力已经全部实现。

## 14. 与系统链路的关系

它处在工具调用链的底层：runtime 和 TAP 经过治理后调用这些基础工具原语。

这份文档服务后续编码：当实现该文件时，应先回看本文件说明，再决定类型、函数、类和测试如何落位。
