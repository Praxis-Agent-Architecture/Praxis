/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：登记 runtime 可执行的治理策略，例如谁能调用、能调什么、在哪种模式下能调。
 * 能力要求1：需要支持来自 DSL、应用配置、官方模块和运行时管理面的策略来源。
 * 能力要求2：后续实现要能被 rule evaluator、managementPlane、officialModuleSurface 共同查询。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
