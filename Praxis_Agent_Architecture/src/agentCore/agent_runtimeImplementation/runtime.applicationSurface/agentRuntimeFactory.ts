/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：提供创建 runtime 实例的工厂能力，封装默认装配流程。
 * 能力要求1：需要隐藏内部装配细节，让开发者能稳定 new 出或获取一个 agentCore 实例。
 * 能力要求2：它应服务未来 OAO 和官方模块复用 agentCore 的使用方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
