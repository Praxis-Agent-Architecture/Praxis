/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：作为上层 Agent 应用使用 agentCore runtime 的主入口。
 * 能力要求1：应用通过它创建、调用、观察和管理 Agent，而不是直接触碰执行引擎。
 * 能力要求2：它需要承托 Raxode/Raxos 和第三方 Agent 应用共同使用 Praxis 的方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
