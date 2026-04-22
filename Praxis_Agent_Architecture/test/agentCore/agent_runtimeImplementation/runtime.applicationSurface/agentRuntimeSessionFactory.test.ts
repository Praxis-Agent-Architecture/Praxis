/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：创建应用侧 runtime session，用来隔离会话、上下文和调用状态。
 * 能力要求1：需要支持一个应用挂多个 Agent 或同一 Agent 多会话的情况。
 * 能力要求2：它不等于记忆系统，只负责 runtime 层会话边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
