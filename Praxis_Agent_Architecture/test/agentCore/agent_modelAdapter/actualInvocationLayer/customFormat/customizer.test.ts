/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：承接不兼容官方形式的自定义上游模型调用形态。
 * 能力要求1：凡是不走 OpenAI、Anthropic、DeepMind/Gemini 官方格式的接入，都应进入 customFormat 体系。
 * 能力要求2：需要允许私有网关、第三方模型服务、自定义 endpoint 或特殊协议被标准化接入。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */
