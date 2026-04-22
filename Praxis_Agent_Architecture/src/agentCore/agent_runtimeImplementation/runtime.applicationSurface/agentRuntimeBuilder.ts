/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：根据 DSL、Spec、Class、manifest 或配置构建 Agent runtime。
 * 能力要求1：需要把执行引擎、模型适配、接口适配、治理面和官方模块承托面装配起来。
 * 能力要求2：它是从“声明/配置”走向“可运行 Agent”的构建入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
