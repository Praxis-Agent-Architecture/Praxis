# contextCompact

> 对应源码：`src/executionEngine/coreLogic/contextCompact.ts`

## 定位

`contextCompact` 定义 PromptPack compact 的边界判定、执行器抽象和审计记录。它只负责回答“边界后要不要压缩、压缩结果如何记录”，不绑定 Claude、Codex、Gemini 或任何 provider 的专用 compact endpoint。

## 语义

- 默认阈值是 `0.95`。当边界后的下一轮 PromptPack 估算达到或超过 context window 的 95% 时，返回 `shouldCompact=true`。自定义阈值会被限制在 `0.01..1`，避免无效配置让 compact 永远不触发或过早触发。
- compact 只在 `turnBoundary` 或 `toolLoopBoundary` 发生。当前模型动作、工具调用、审批恢复或过程步骤已经开始后，不由这里中途打断。
- `CompactExecutor` 可以由 provider-native compact、summary agent、application 或 runtime fallback 实现。
- `CompactRecord` 是 public-safe 审计记录，只保存 material refs、token 估算、summary/recent refs 和 executor 类型，不保存 raw provider body 或 secret。

## 输出

成功 compact 后，上层应把旧 raw conversation 写进新的 `sessionSummary`，把保留下来的注意力窗口写成 `recentConversation`，下一轮再从稳定事实源重建 PromptPack。
