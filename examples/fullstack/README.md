# Praxis Fullstack Example

`fullstack` 在这里被当成一个完整 AI 应用工程项目，而不是单个 Agent 文件夹。

项目级入口：

- `rax.project.json`：工程描述，`rax inspect/test/run examples/fullstack` 会从这里找到 Agent 入口。
- `application/`：真实应用层，负责把 Agent 接成产品行为、CLI/TUI/Raxode/Raxos 入口。
- `agents/`：一个项目可以有多个 Agent；当前主 Agent 是 `agents/repoInspector/`。
- `authentication/`：开发期和运行期 auth/profile 引用策略，不保存 raw secret。
- `context/`：CMP bridge/contract 占位。
- `memory/`：MP bridge/contract 占位。
- `topology/`：multiagent 拓扑 bridge/contract 占位。
- `tests/`：项目级测试。

主 Agent 子工程：

```text
agents/repoInspector/
  praxis.agent.ts
  agent.ts
  config/
  prompts/
  tools/
  policies/
  mainLoop/
  harness/
  sandbox/
  storage/
  state/
  interfaces/
```

这里的分工是：

- `tools/` 只说“这个 Agent 挂哪些工具”。
- `policies/` 只说“这些行为怎么治理”。
- `mainLoop/` 只说“动作、hook、trigger、继续/中断策略引用”。
- `prompts/` 不只是放文本；运行时会把 prompt 包分成 `stableSystemCore / declaredRuntimeContext / toolDeclarations / projectContext / sessionSummary / memoryContext / retrievedContext / observations / userTurn / assistantScratchpadPlan`，用于缓存健康检查。
- `harness/` 很薄，只负责总装配：用 refs 把 model、promptPack、tools、toolPolicy、mainLoop、sandbox、storage、session、statePlane、interfaces、context、memory 串成声明式能力外壳。
- `application/` 才是最终产品/应用入口，不放进单个 Agent 内部。

推荐 rax 入口：

```bash
bin/rax inspect examples/fullstack
bin/rax test examples/fullstack
bin/rax run examples/fullstack "Inspect this Praxis fullstack agent project."
```

本地调试入口：

```bash
node --import tsx examples/fullstack/runRepoInspector.ts
node --import tsx examples/fullstack/application/runRepoInspector.ts --deep --shell --skill-authoring --policy=permissive
node --no-warnings --import tsx examples/fullstack/application/runRepoInspector.ts --sqlite
```

默认 dry-run，不需要真实模型 auth。

`application/runRepoInspector.ts` 会额外打印：

- `PromptPack Turn Preview`：本轮 PromptPack 分段和 cache plan。
- `Framework Inspection.promptCache`：`rax inspect` 以后应该呈现给开发者的缓存健康信息。
- `Runtime Result.cachePlanSteps`：Kernel 运行时实际持久化的 `buildCachePlan` mainLoop step。
