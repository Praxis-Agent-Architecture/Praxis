/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：定义 runtime 对上层应用公开哪些能力。
 * 能力要求1：需要把公共 API、可见事件、可调用能力和不可见内部细节分开。
 * 能力要求2：它是防止应用直接依赖内部文件结构的出口清单。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
