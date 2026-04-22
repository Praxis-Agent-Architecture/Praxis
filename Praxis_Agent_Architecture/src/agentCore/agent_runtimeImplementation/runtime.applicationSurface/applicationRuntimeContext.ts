/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：给上层应用提供受控 runtime 上下文。
 * 能力要求1：需要包含当前能力、会话、模式、事件订阅、治理状态等应用需要的信息。
 * 能力要求2：不能泄露执行引擎、模型适配或官方模块的内部可变状态。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
