/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：作为 CMP、MP、TAP、multiagent 等官方模块接入 runtime 的主入口。
 * 能力要求1：这些模块不是外部插件，而是 Praxis 内置正式模块。
 * 能力要求2：本文件需要给它们提供统一、受治理、可演进的 runtime 使用方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
