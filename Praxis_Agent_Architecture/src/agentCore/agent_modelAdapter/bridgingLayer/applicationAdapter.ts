/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：把模型适配层最终产物转成 agentCore 内部实际可用的调用形态。
 * 能力要求1：actualInvocationLayer 负责拿到上游 provider/API endpoint 的真实可用调用面。
 * 能力要求2：abstractionLayer 负责根据 DSL 和格式映射完成跨厂商抽象与转换。
 * 能力要求3：本文件处在最后一步：把抽象层整理好的能力暴露成 agentCore 一看就能接入的形态。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
