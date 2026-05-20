# RepoInspector Agent

这是 `examples/fullstack` 项目里的一个 Agent 子工程。

- `praxis.agent.ts` 是 rax 可编译入口。
- `agent.ts` 是 OAO Agent class。
- `config/` 管 identity/model/modelFleet/options。
- `prompts/` 管 PromptPack class 和 prompt package。
- `tools/` 管工具集合，不写治理结论。
- `policies/` 管治理矩阵，不声明工具清单。
- `mainLoop/` 管主循环扩展点 refs。
- `harness/` 只做能力外壳装配；它用 refs 把 model、promptPack、tools、toolPolicy、mainLoop、sandbox、storage、session、statePlane、interfaces、context、memory 串成一个可编译外壳。
- `sandbox/ storage/ state/ interfaces/` 分别接运行边界、持久化、状态面、外部承接面。
