/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：返回给上层应用的稳定 runtime 句柄。
 * 能力要求1：句柄需要能发起调用、订阅事件、查询状态、关闭实例，但不暴露内部可变对象。
 * 能力要求2：它是开发者真正拿在手里使用 agentCore 的对象边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
