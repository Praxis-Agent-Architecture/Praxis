/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：测试模型适配桥接层暴露给 agentCore 的实际调用接口是否可用。
 * 能力要求1：需要覆盖从抽象层结果到 agentCore 内部调用入口的最小连通性。
 * 能力要求2：它用于防止 provider 已接入但 agentCore 仍不能稳定调用的假接通。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
