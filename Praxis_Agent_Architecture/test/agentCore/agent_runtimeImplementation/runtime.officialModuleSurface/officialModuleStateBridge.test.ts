/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：桥接官方模块读取必要 runtime 状态。
 * 能力要求1：需要提供受控状态视图，而不是让模块直接改 agentCore 内部状态。
 * 能力要求2：它服务模块协作，也保护 runtime 状态一致性。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
