/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：隔离应用扩展对 runtime 内部状态的影响。
 * 能力要求1：需要允许应用扩展能力，但所有扩展都应经过契约和治理约束。
 * 能力要求2：它让 agentCore 能被第三方应用复用，同时保持内核稳定。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
