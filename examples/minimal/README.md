# Praxis Agent example / minimal

这个目录展示 **最小可用 Praxis Agent**。

目标不是把所有能力都用满，而是证明普通开发者可以只靠 `@praxis-ai/praxis` 的公开 API 写出：

```text
Agent object -> compileAgent -> AgentManifest -> inspect -> runManifest dry-run
```

运行：

```bash
node --import tsx examples/minimal/runRepoInspector.ts
```

结构：

- `repoInspectorAgent.ts`：最小 OO authoring 面，只声明 identity/model/promptPack/sandbox/toolPolicy/storage/session/harness。
- `runRepoInspector.ts`：编译、摘要 inspect、dry-run 一次 runtime。
- `repo-inspector/`：最小 prompt package 文件。

默认是 dry-run，不需要真实模型 auth。默认使用 memory session，不创建 SQLite。

这个 minimal 示例故意保持轻量：

- 不展示 modelFleet。
- 不展示 mainLoop hook refs。
- 不展示 statePlane 控制面。
- 不展示 SQLite / `.rax_workspace` 初始化。
- 不展示 full inspection report。

想看工程极限，请运行 `examples/fullstack/runRepoInspector.ts`。
