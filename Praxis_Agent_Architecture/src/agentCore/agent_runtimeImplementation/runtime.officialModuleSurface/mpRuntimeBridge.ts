/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 MP 桥接 runtime 的记忆、状态、上下文和调用能力。
 * 能力要求1：需要让记忆管理系统能接入 agentCore 当前运行状态和事件。
 * 能力要求2：它不实现 MP 记忆策略，只提供 runtime 接入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
