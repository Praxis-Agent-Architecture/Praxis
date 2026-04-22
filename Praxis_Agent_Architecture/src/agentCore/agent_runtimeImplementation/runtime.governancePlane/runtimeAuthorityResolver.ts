/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：解析当前调用者是谁，以及它在 runtime 中具有什么权限。
 * 能力要求1：调用者可能是上层应用、官方模块、子 Agent、操作者或外部控制端。
 * 能力要求2：需要把身份、会话、模块来源和治理策略合并成可判断的权限上下文。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
