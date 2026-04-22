/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：作为 agentCore runtime 的治理总面，集中处理权限、策略、作用域、审计和模块治理。
 * 能力要求1：需要让上层 Agent 应用、官方模块、工具调用、模型调用都经过一致的治理判断。
 * 能力要求2：不能只做监控或日志，它是 Praxis 运行核心能被安全复用的关键边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
