/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：把上层 Agent 应用挂载到 agentCore runtime。
 * 能力要求1：需要处理应用生命周期、能力申请、事件订阅和治理接入。
 * 能力要求2：它让应用成为 runtime 的正式使用者，而不是临时调用脚本。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
