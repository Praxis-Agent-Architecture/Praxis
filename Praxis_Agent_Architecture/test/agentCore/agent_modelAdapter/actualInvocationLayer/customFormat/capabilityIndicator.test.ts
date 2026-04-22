/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：标识自定义上游格式当前的能力可用信号。
 * 能力要求1：需要承载可用、不可用、部分可用、需要鉴权、需要配置等状态。
 * 能力要求2：给 abstractionLayer 和 runtime 检查面提供判断依据。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
