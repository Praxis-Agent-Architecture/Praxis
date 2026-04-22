/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：承载 agentCore 与官方模块之间的 runtime 事件流。
 * 能力要求1：需要支持事件发布、订阅、过滤、来源标记和治理约束。
 * 能力要求2：它让官方模块能协作但不互相硬耦合。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
