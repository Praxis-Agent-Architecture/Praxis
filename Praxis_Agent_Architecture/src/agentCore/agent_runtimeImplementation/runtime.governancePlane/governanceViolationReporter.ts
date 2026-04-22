/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：报告治理违规或可疑越界行为。
 * 能力要求1：需要把违规信息送到检查面、调试面、管理面或自修复面。
 * 能力要求2：它不直接惩罚调用者，而是把违规变成 runtime 可处理事件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
