# Praxis Example

`minimal/` 是最小 Agent 写法，适合看核心链路。

`fullstack/` 是完整 AI 应用工程写法，适合看工程极限：

- project-level `application/authentication/context/memory/topology/tests`
- agent-level `agents/repoInspector/config/prompts/tools/policies/mainLoop/harness/sandbox/storage/state/interfaces`

运行：

```bash
node --import tsx examples/minimal/runRepoInspector.ts
bin/rax inspect examples/fullstack
bin/rax test examples/fullstack
bin/rax run examples/fullstack "Inspect this Praxis fullstack agent project."
node --import tsx examples/fullstack/application/runRepoInspector.ts --deep --shell --skill-authoring --policy=permissive
```
