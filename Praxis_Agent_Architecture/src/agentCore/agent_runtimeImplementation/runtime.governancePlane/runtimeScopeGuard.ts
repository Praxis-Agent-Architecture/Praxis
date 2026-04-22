/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：守住 runtime 作用域边界，防止应用、模块、工具、模型调用互相越界。
 * 能力要求1：需要确认某个动作是否只能看状态、能否改状态、能否触发工具或模型。
 * 能力要求2：这是避免 agentCore 被上层产品逻辑污染的重要门。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
