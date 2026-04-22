/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：把 runtime 治理和 TAP 的工具审批、授权、人工确认系统接起来。
 * 能力要求1：需要在工具调用或高风险动作前把审批需求交给 TAP。
 * 能力要求2：它不替代 TAP，而是让 TAP 成为 runtime 治理链上的正式审批能力。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
