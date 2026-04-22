/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 TAP 桥接 runtime 的工具、审批、治理和执行通道。
 * 能力要求1：TAP 可以在 baseTools 之上构建更高级的工具能力库。
 * 能力要求2：本文件要让 TAP 能正式使用 agentCore，而不是替代基础工具原语层。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
