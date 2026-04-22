/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：检查抽象层整理出的模型能力是否能被 agentCore 内部调用形态真正使用。
 * 能力要求1：需要校验能力、输入格式、输出格式、上下文承载和调用约束是否满足 agentCore 需要。
 * 能力要求2：它不是检查 provider 官方 API 是否存在，而是检查“进入 agentCore 前最后一公里”是否兼容。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
