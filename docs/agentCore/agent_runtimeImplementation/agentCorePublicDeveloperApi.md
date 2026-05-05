# agentCorePublicDeveloperApi

> 对应源码：`src/agentCore/index.ts`

> 完整开发者手册：`docs/agentCore/agent_runtimeImplementation/agentCoreFrameworkDeveloperGuide.md`

## 1. Public Boundary

`src/agentCore/index.ts` 是普通开发者的 framework 入口。开发者应该从这里拿到 OAO authoring、manifest compile 和 runtime kernel，而不是直接 import `runtime.*` 深层实现文件。

推荐形状：

```ts
import {
  PraxisAgent,
  PraxisAgentArchetype,
  PraxisRuntimeKernel,
  type RuntimeApprovalResolver,
  compileAgent,
  harness,
  model,
  sandbox,
  toolPolicies,
} from "praxis";
```

当前 package source export map 把包根和 `./agentCore` 指到这个公共入口。深层 `runtime.execEngine`、`runtime.modelAdapter`、`runtime.governancePlane`、`runtime.officialModuleSurface` 仍然是 repo 内部实现面，不承诺普通开发者 semver 稳定性。

## 2. Minimal Agent Example

```ts
class MinimalAgent extends PraxisAgent {
  identity = "agent.minimal";
  model = model("gpt-5.4");
  harness = harness({
    tools: tools([
      tool("code.read", { family: "codeBase", group: "explore" }),
    ]),
    loop: loop.standard({ maxModelTurns: 1 }),
  });
}

const manifest = compileAgent(MinimalAgent);
```

这个例子不需要声明 sandbox 或 tool policy；compiler 会默认使用：

- `sandbox.hostObserved()`
- `toolPolicies.standard()`

## 3. Mature Archetype Example

```ts
class CodingAgent extends PraxisAgentArchetype {
  identity = "agent.coding";
  model = model("gpt-5.4-nano");
  promptPack = {
    promptPackId: "prompt.coding",
    base: markdown("You are a Praxis coding agent.", "coding.base"),
  };
  mainLoop = mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "coding.prompt.strategy" },
    },
  });
  sandbox = sandbox.hostObserved();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto" });
  statePlane = statePlane({ expose: ["phase", "toolCalls"], control: ["pause"] });
  harness = harness({
    tools: tools([
      tool("shell.commandExecution", { family: "shellBase", group: "shellExecution" }),
    ]),
    loop: loop.standard({ maxModelTurns: 2, maxToolCalls: 2 }),
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

## 7. Internal Boundary

普通开发者不应依赖这些路径作为稳定 API：

- `src/agentCore/agent_runtimeImplementation/runtime.execEngine/*`
- `src/agentCore/agent_runtimeImplementation/runtime.modelAdapter/*`
- `src/agentCore/agent_runtimeImplementation/runtime.governancePlane/*`
- `src/agentCore/agent_runtimeImplementation/runtime.officialModuleSurface/*`
- `src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/*`

这些文件可以被 framework 内部、官方模块 bridge、测试和调试使用，但不作为用户 authoring 主入口。
