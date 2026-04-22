/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：记录治理相关的通过、拒绝、覆盖、审批、委托和异常行为。
 * 能力要求1：需要给 debug、inspection、managementPlane 提供可回放的治理证据。
 * 能力要求2：审计记录应服务后续安全、调试和运行质量判断。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
