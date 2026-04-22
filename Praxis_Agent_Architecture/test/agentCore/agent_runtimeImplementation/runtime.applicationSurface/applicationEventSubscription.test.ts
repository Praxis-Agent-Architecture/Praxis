/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：让应用订阅 runtime 事件，例如行为、输出、错误、模式变化、debug 信号。
 * 能力要求1：需要支持应用只观察自己有权观察的事件。
 * 能力要求2：它是上层 Agent 应用构建 UI、日志、流程编排的重要入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
