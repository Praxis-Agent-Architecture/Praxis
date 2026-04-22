/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：定义官方模块能向 runtime 申请和使用哪些能力。
 * 能力要求1：需要约束 CMP/MP/TAP/multiagent 的能力读取、调用和事件订阅范围。
 * 能力要求2：它是官方模块稳定依赖 agentCore 的契约文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
