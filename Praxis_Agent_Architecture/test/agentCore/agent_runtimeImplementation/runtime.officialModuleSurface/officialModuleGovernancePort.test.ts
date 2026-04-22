/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：让官方模块通过治理面申请 runtime 权限。
 * 能力要求1：需要把模块动作、能力范围、审批需求和策略结果接起来。
 * 能力要求2：官方模块也必须受治理，而不是天然拥有无限权限。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
