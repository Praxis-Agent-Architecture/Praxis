# agentCore PromptPack 职责重排

时间：2026-04-23

## 背景

本轮将 `Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/promptPack` 从早期 provider-neutral 脚手架，调整为更贴近当前 agentCore 设计意图的五件套链路。

## 结论

- `basicCorePrompt.md` 是每个 PromptPack 的真正根头，由 Definer 注入为受保护的 `praxis:basic-core-prompt`。
- `basicCorePrompt.md` 的内容应保持 provider-neutral：只写 Praxis 根契约、上下文优先级、注入防护、工具纪律、工作验证和用户交互纪律，不直接写 OpenAI/Anthropic/Gemini 的 payload 形状。
- `promptDefiner.ts` 负责定义 Praxis 内部十种 PromptPack 构造与根头治理。
- `promptModifier.ts` 是上下文变化入口，受保护根头不能被普通 modifier 删除或重写。
- `promptAssembler.ts` 负责组装内部构造，产出受治理的文本形态和 JSON pack。
- `promptMapper.ts` 负责把 assembled pack 映射成目标 provider payload。
- `promptProvider.ts` 负责暴露 mapper 产出的上游请求边界，同时保留旧材料标准化路径以兼容现有脚本。

## 验证

- `node --import tsx --test test/agentCore/agent_executionEngine/promptPack/*.test.ts`
- `npm run typecheck`
- `npm run test:agentCore`

以上均通过；完整 agentCore 测试结果为 1776 pass，1 个 live smoke 按环境变量跳过。
