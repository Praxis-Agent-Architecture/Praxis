/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：执行治理规则判断，回答某个调用、模块动作或管理动作是否允许。
 * 能力要求1：需要返回通过、拒绝、需要审批、需要降级等明确结果。
 * 能力要求2：它不执行动作本身，只给 runtime 其他面提供治理裁决。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
