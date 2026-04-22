/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：桥接应用生命周期和 runtime 生命周期。
 * 能力要求1：需要处理应用启动、暂停、卸载、重载与 runtime boot/resume/shutdown 的对应关系。
 * 能力要求2：不能把应用生命周期和 agentCore 内部生命周期混成同一个对象。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
