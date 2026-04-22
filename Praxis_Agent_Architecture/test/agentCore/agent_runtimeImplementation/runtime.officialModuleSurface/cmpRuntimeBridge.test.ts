/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 CMP 桥接 runtime 的上下文、任务、调用和能力访问。
 * 能力要求1：需要让上下文管理能力能使用 agentCore，而不是绕开 agentCore 自建运行通道。
 * 能力要求2：它不实现 CMP 内部策略，只提供 CMP 使用 runtime 的正式桥。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
