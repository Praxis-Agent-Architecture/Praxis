# agentCorePublicDeveloperApi

> 对应源码：`src/agentCore/index.ts`

> 完整开发者手册：`docs/agentCore/agent_runtimeImplementation/agentCoreFrameworkDeveloperGuide.md`

## 1. Public Boundary

`src/agentCore/index.ts` 是普通开发者的 framework 入口。开发者应该从这里拿到 OAO authoring、manifest compile 和 runtime kernel，而不是直接 import `runtime.*` 深层实现文件。

推荐形状：

```ts
import {
  praxis,
  type RuntimeApprovalResolver,
} from "@praxis-ai/framework";
```

当前 package source export map 把包根和 `./agentCore` 指到这个公共入口。仓库内示例也可以直接 `import ... from "@praxis-ai/framework"`，模拟安装后的开发者体验。`praxis` 是推荐的一包式 authoring facade；细粒度导出仍然保留给测试、高级用户和内部工程。深层 `runtime.execEngine`、`runtime.modelAdapter`、`runtime.governancePlane`、`runtime.officialModuleSurface` 仍然是 repo 内部实现面，不承诺普通开发者 semver 稳定性。

## 2. Minimal Agent Example

```ts
class MinimalAgent extends praxis.Agent {
  identity = "agent.minimal";
  model = praxis.model("gpt-5.4");
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.tool("code.read", { family: "codeBase", group: "explore" }),
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 1 }),
  });
}

const manifest = praxis.compileAgent(MinimalAgent);
```

这个例子不需要声明 sandbox 或 tool policy；compiler 会默认使用：

- `sandbox.hostObserved()`
- `toolPolicies.standard()`

## 3. Mature Archetype Example

```ts
class CodingAgent extends praxis.AgentArchetype {
  identity = "agent.coding";
  model = praxis.model("gpt-5.4-nano");
  promptPack = {
    promptPackId: "prompt.coding",
    base: praxis.markdown("You are a Praxis coding agent.", "coding.base"),
  };
  mainLoop = praxis.mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "coding.prompt.strategy" },
    },
  });
  sandbox = praxis.sandbox.hostObserved();
  toolPolicy = praxis.toolPolicies.standard();
  session = praxis.session({ persistence: "sqlite", resume: "auto" });
  statePlane = praxis.statePlane({ expose: ["phase", "toolCalls"], control: ["pause"] });
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.tool("shell.commandExecution", { family: "shellBase", group: "shellExecution" }),
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 2, maxToolCalls: 2 }),
  });
}
```

白话解释：class 是开发者体验，manifest 是 runtime 真相。`PraxisRuntimeKernel.run(agent, task)` 可以作为语法糖，但内部必须先 `compileAgent`。

## 4. Approval Surface

外部 application surface 可以只从公共入口拿到 approval 类型：

```ts
const resolver: RuntimeApprovalResolver = async (approval) => ({
  status: "approved",
  resolvedBy: "my-application",
});
```

这让 CLI/TUI/UI/Raxos 以后可以接走 approval envelope，而不要求普通开发者 import `runtime.*` 深层文件。

## 5. Policy Profiles

BaseTool policy profile 使用 `safe / risky / dangerous` 三段风险语言：

- `bapr`: safe/risky/dangerous 全部 allow。
- `yolo`: safe/risky pass，dangerous approval。
- `permissive`: safe allow，risky guarded，dangerous approval。
- `standard`: 默认；safe guarded，risky/dangerous approval。
- `restricted`: 全部 approval。

`standard` 是默认 profile。它不是最宽松的模式，而是日常开发默认保守策略。

## 6. Sandbox Profiles

默认 sandbox 是 `host-observed`：

```text
no real container isolation yet
runtime still records, gates, budgets, and approves actions
policy remains active
```

这不是最终容器沙箱。它是当前无容器阶段的诚实宿主模式，避免把普通宿主执行伪装成已隔离执行。

开发者可用的 sandbox helper：

```ts
praxis.sandbox.hostObserved()
praxis.sandbox.workspaceOnly()
praxis.sandbox.linuxBubblewrap()
praxis.sandbox.linuxBubblewrapReadonly()
praxis.sandbox.linuxBubblewrapWorkspaceWrite()
praxis.sandbox.linuxBubblewrapNetworked()
praxis.sandbox.rootlessContainer()
praxis.sandbox.windowsSandbox()
praxis.sandbox.macosContainerization()
praxis.sandbox.remoteWorker()
```

当前真实 Linux 路线是 `linuxBubblewrap*`。它依赖 `bwrap`，并把进程型工具运行在 bubblewrap 命令下。典型边界：

- workspace 映射到 `/workspace`
- `$HOME` 指向 `.rax_workspace/sandbox/home`
- `/tmp` 指向 `.rax_workspace/sandbox/tmp`
- artifacts 写到 `.rax_workspace/sandbox/artifacts`
- 默认不暴露真实用户 home
- 网络由 sandbox profile + toolPolicy 共同裁决

`workspaceOnly()` 是路径/策略级 profile，不是 OS 容器。`rootlessContainer()`、`windowsSandbox()`、`macosContainerization()`、`remoteWorker()` 当前是 provider contract/readiness 面，不应该在文档里承诺已经真实隔离可用。

开发者检查 sandbox：

```bash
rax inspect agents/mainAgent.ts --export MainAgent
rax test agents/mainAgent.ts --export MainAgent --sandbox=linuxBubblewrap
```

如果 `bwrap` 缺失，runtime 应返回 public-safe readiness 和 self-repair plan，而不是静默降级成 host mode。

## 7. Internal Boundary

普通开发者不应依赖这些路径作为稳定 API：

- `src/agentCore_runtimeImplementation/runtime.execEngine/*`
- `src/agentCore_runtimeImplementation/runtime.modelAdapter/*`
- `src/agentCore_runtimeImplementation/runtime.governancePlane/*`
- `src/agentCore_runtimeImplementation/runtime.officialModuleSurface/*`
- `src/agentCore_executionEngine/basic_toolLayer/baseTools/*`

这些文件可以被 framework 内部、官方模块 bridge、测试和调试使用，但不作为用户 authoring 主入口。
