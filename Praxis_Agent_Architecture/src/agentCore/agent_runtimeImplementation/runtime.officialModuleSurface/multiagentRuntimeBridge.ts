/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为多 Agent 管理系统桥接 spawn、resume、interrupt、coordination 等能力。
 * 能力要求1：需要让多 Agent 系统能够复用 agentCore 实例和 runtime surface。
 * 能力要求2：它不实现完整 multiagent 策略，只提供 runtime 接入和协作边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
