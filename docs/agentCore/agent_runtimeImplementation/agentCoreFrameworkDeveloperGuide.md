# AgentCore Framework Developer Guide

> Source paths:
>
> - `src/agentCore/index.ts`
> - `src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.ts`
> - `src/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.ts`

## 1. What AgentCore Is

`agentCore` is the Praxis framework kernel.

Plainly: developers write a TypeScript Agent class, Praxis compiles it into an `AgentManifest`, and the runtime executes only that manifest. The class is the authoring experience. The manifest is the runtime truth.

The required chain is:

```text
PraxisAgent class or instance
  -> compileAgent(...)
  -> AgentManifest
  -> PraxisRuntimeKernel.runManifest(...)
  -> model / promptPack / mainLoop / BaseTool / session-state-event
```

Do not build product logic or official-module shortcuts around this chain. Raxode, Raxos, TAP, CMP, MP, multiagent, and user agents should enter through `agentCore` contracts.

## 2. Public Import Boundary

Normal developers should import from the public entry:

```ts
import {
  praxis,
  type RuntimeApprovalResolver,
} from "@praxis-ai/framework";
```

In this repo, that public surface is `src/agentCore/index.ts`.

Do not ask normal developers to import from deep `runtime.*` files. Those files are implementation organs: useful for framework internals, tests, and official module bridges, but not the stable authoring API.

## 3. The Minimal Agent

Use `PraxisAgent` when the agent is small and mostly needs one model plus a harness.

```ts
class MinimalRepoAgent extends praxis.Agent {
  identity = "agent.repo.minimal";
  model = praxis.model("gpt-5.4");

  harness = praxis.harness({
    tools: praxis.tools([
      praxis.baseTools.code.read(),
      praxis.baseTools.code.searchRipgrep(),
      praxis.baseTools.git.getRepositoryStatus(),
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 1, maxToolCalls: 2 }),
  });
}

const compiled = praxis.compileAgent(MinimalRepoAgent);
if (!compiled.ok) throw new Error(compiled.error.message);

const runtime = new praxis.runtime.PraxisRuntimeKernel({ runtimeId: "runtime.repo" });
const result = await runtime.runManifest(compiled.manifest, "Summarize this repo.");
```

Defaults:

- sandbox: `sandbox.hostObserved()`
- tool policy: `toolPolicies.standard()`
- session: memory, manual resume, ephemeral thread
- storage: memory unless sqlite persistence is requested

`hostObserved` means there is no container isolation yet, but runtime governance, event logging, approval, and resource metadata still apply.

## 4. The Mature Agent Archetype

Use `PraxisAgentArchetype` when the class should be reusable, inheritable, patchable, and suitable as a product or official agent base.

```ts
class CodingAgent extends praxis.AgentArchetype {
  identity = { id: "agent.coding", version: "1.0.0" };

  model = praxis.model("gpt-5.4-nano", {
    carrierId: "carrier.coding.background",
    endpointShape: "responses",
  });

  promptPack = {
    promptPackId: "prompt.coding",
    base: praxis.markdown("You are a Praxis coding agent.", "coding.base"),
  };

  mainLoop = praxis.mainLoop.standard({
    hooks: {
      buildPrompt: { strategyRef: "coding.prompt.strategy" },
      shouldContinue: { strategyRef: "coding.loop.continue" },
    },
  });

  sandbox = praxis.sandbox.hostObserved();
  toolPolicy = praxis.toolPolicies.standard();
  storage = praxis.storage.raxWorkspace();
  session = praxis.session({
    persistence: "sqlite",
    resume: "auto",
    thread: "durable",
    logs: "full",
  });
  statePlane = praxis.statePlane({
    expose: ["phase", "lastAction", "toolCalls", "errors"],
    control: ["pause", "resume", "interrupt"],
  });

  harness = praxis.harness({
    tools: praxis.tools([
      ...praxis.toolSets.coding.readonly({ includeGit: true, includeSearch: true }),
      praxis.baseTools.shell.commandExecution(),
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 4, maxToolCalls: 8 }),
  });
}
```

This is the preferred shape for serious agents: class fields describe the agent, `compileAgent` normalizes them, and runtime executes the manifest.

## 5. Model Authoring

A simple agent can use one model:

```ts
model = praxis.model("gpt-5.4", {
  provider: "openai",
  endpointShape: "responses",
});
```

A mature agent can declare a model fleet:

```ts
modelFleet = praxis.modelFleet.auto({
  primary: praxis.endpoint("/v1/responses", {
    role: "reasoning",
    provider: "openai",
    model: "gpt-5.4",
  }),
  batch: praxis.endpoint("/v1/batches", {
    role: "batch",
    provider: "openai",
    model: "gpt-5.5-pro",
  }),
});
```

Current v1 live path is the `codex_responses` style provider path through runtime model adapter. Other endpoint roles are manifest and inspection contracts until their provider adapters are made live.

Credential rule: manifests should carry credential refs or auth envelopes, not raw provider tokens.

## 6. Harness Authoring

Harness is the declarative capability shell. It should say what the agent may use, not run arbitrary logic.

Common fields:

- `tools`: BaseTool selection
- `loop`: model/tool turn limits
- `policy`: provider/tool execution flags and workspace roots
- `context`, `memory`, `storage`: material and persistence declarations
- `runtimeRequirements`: explicit required runtime features

Example:

```ts
harness = praxis.harness({
  tools: praxis.tools([
    praxis.baseTools.code.read(),
    praxis.baseTools.code.searchRipgrep(),
    praxis.baseTools.git.getRepositoryStatus(),
  ]),
  policy: praxis.policy({
    allowProviderCall: true,
    allowToolExecution: true,
    workspaceRoot: process.cwd(),
    allowedRoots: [process.cwd()],
  }),
  loop: praxis.loop.standard({ maxModelTurns: 2, maxToolCalls: 4 }),
});
```

## 7. Tool Authoring

Prefer typed public helpers:

```ts
praxis.baseTools.code.read()
praxis.baseTools.code.searchRipgrep()
praxis.baseTools.git.getRepositoryStatus()
praxis.baseTools.shell.commandExecution()
```

Prefer tool sets for common bundles:

```ts
praxis.toolSets.coding.readonly({ includeGit: true, includeSearch: true })
praxis.toolSets.git.inspection()
praxis.toolSets.shell.safe()
```

You can still use low-level `tool(...)` when needed:

```ts
praxis.tool("code.read", { family: "codeBase", group: "explore" })
```

But the compiler validates `toolId`, `family`, and `group` against the runtime catalog. Tool identity is always:

```text
family / group / toolId
```

Runtime does not become a second tool brain. BaseTool semantics live in `src/storagePool/baseToolStorage`; runtime owns executor ports, governance, dependencies, session linkage, and observation.

BaseTool invocation must keep this chain:

```text
runtime request
  -> adaptRuntimeToolInvocation
  -> bridgeExecEngineInvocation
  -> createBaseToolRegistry().lookupHandler
  -> BaseToolHandler.invoke({ executor })
  -> BaseToolExecutorPort.*
```

## 8. Policy And Sandbox

Default policy profile is `standard`.

Available profiles:

- `praxis.toolPolicies.bapr()`: broad pass, useful only for trusted test harnesses
- `praxis.toolPolicies.yolo()`: low human intervention; dangerous actions still require approval
- `praxis.toolPolicies.permissive()`: safe actions pass, risky actions guarded, dangerous actions approval
- `praxis.toolPolicies.standard()`: conservative daily default
- `praxis.toolPolicies.restricted()`: approval for all tool actions

Default sandbox profile is:

```ts
praxis.sandbox.hostObserved()
```

This is an honest host-mode profile. It does not promise container isolation. It does promise runtime observation, policy gates, approval surfaces, event logs, and metadata for later sandbox implementations.

Provider-aware sandbox profiles are also available:

- `praxis.sandbox.workspaceOnly()`: workspace and `.rax_workspace` policy profile.
- `praxis.sandbox.linuxBubblewrap()`: Linux bubblewrap provider profile.
- `praxis.sandbox.rootlessContainer()`: future rootless container provider contract.
- `praxis.sandbox.windowsSandbox()`: Windows Sandbox contract.
- `praxis.sandbox.macosContainerization()`: macOS Containerization contract.
- `praxis.sandbox.remoteWorker()`: future Raxos/enterprise remote worker contract.

Linux bubblewrap is the first real smoke-tested provider:

```ts
const prepared = await praxis.sandboxPlane.prepareSandboxRuntime(
  praxis.sandbox.linuxBubblewrap(),
  { cwd: process.cwd(), runSmoke: true },
);
```

If `bwrap` is missing, the runtime reports a public-safe dependency plan instead of pretending isolation is active. Non-Linux providers remain contract/readiness surfaces until their platform adapters are implemented.

## 9. PromptPack

PromptPack is Praxis internal context material, not the provider payload.

It can contain:

- declared built-ins: base prompt, prompt patches, declared materials
- process products: tool results, observations, model failures, event summaries
- user request: current task and input material

Example:

```ts
class CodingPrompt extends praxis.PromptPack {
  promptPackId = "prompt.coding";
  base = praxis.markdown("You are a Praxis coding agent.", "coding.base");
  patches = [
    praxis.prompt.append("coding.base", praxis.markdown("Prefer small patches.", "coding.patch.rules")),
  ];
}
```

Provider payload shaping happens later through `promptLoweringRuntime` and model adapter surfaces.

## 10. MainLoop

MainLoop is the reusable running core, but developers should extend it by stable refs, not arbitrary runtime JS.

```ts
mainLoop = praxis.mainLoop.standard({
  buildPromptRef: "coding.prompt.strategy",
  chooseModelRef: "coding.model.router",
  beforeToolRef: "coding.beforeTool.policy",
  afterToolRef: "coding.afterTool.handler",
  onApprovalRef: "coding.approval.route",
  onErrorRef: "coding.error.report",
  onResumeRef: "coding.resume.session",
});
```

The current runtime v1 still keeps a compatibility for-loop inside `PraxisRuntimeKernel.runManifest`, but it records formal `MainLoopStepRecord` entries and passes through `ModelDecision`, PromptPack, tool governance, and session/state/event contracts.

## 11. Storage And Sessions

Praxis uses two storage roots:

```text
~/.rax
  global config, auth refs, provider profiles, package cache, tool deps, trust, logs, runtime sockets

.rax_workspace
  project manifests, sessions, state, events, approvals, artifacts, cache, sandbox, reports, per-agent data
```

SQLite is the default durable local session store:

```ts
storage = praxis.storage.raxWorkspace();
session = praxis.session({
  persistence: "sqlite",
  resume: "auto",
  thread: "durable",
  logs: "full",
});
```

This resolves to:

```text
.rax_workspace/sessions/praxis.sqlite
```

Compile does not create directories. Runtime or rax init/run applies the init plan. The storage plane records public-safe path refs and must not store raw auth tokens.

## 12. Running And Inspecting

Start a new project:

```bash
rax build init minimal --name repo-agent --dir repo-agent
rax build init fullstack --name coding-agent --dir coding-agent
rax build init custom
```

`minimal` creates a small public-API agent. `fullstack` creates a mature project layout with `agents/`, `prompts/`, `policies/`, `sandbox/`, `interfaces/`, `reports/`, tests, and `.rax_workspace`. `custom` asks for model, sandbox, tool policy, session/storage, tool set, and interface-surface choices.

Inspect, test, or run:

```bash
rax inspect agents/mainAgent.ts
rax test agents/mainAgent.ts
rax run agents/mainAgent.ts "read the repo and summarize it"
```

Compile:

```ts
const compiled = praxis.compileAgent(CodingAgent);
if (!compiled.ok) {
  console.error(compiled.error);
}
```

Validate:

```ts
const validation = praxis.validateAgentManifest(compiled.manifest);
```

Inspect:

```ts
const report = praxis.inspection.createFrameworkInspectionReport({
  runtimeId: "runtime.coding",
  manifest: compiled.manifest,
});
```

Run:

```ts
const runtime = new praxis.runtime.PraxisRuntimeKernel({ runtimeId: "runtime.coding" });
const result = await runtime.runManifest(compiled.manifest, "Read package.json and summarize it.");
```

Dry-run is default unless options explicitly allow provider/tool execution. Live model/tool execution must pass governance, auth/provider setup, executor support, and dependency readiness.

## 13. Approval

Approval is an application/interface surface, not an internal dead wait.

```ts
const approvalResolver: RuntimeApprovalResolver = async (approval) => ({
  status: approval.publicSafe ? "approved" : "denied",
  resolvedBy: "my-app",
});
```

CLI, TUI, UI, Raxos, or remote management can later implement this resolver shape.

## 14. What Is Live Today

Live usable in v1:

- `PraxisAgent` / `PraxisAgentArchetype` authoring
- `compileAgent` and stable `AgentManifest`
- public developer API from `src/agentCore/index.ts`
- `PraxisRuntimeKernel.run(...)` and `runManifest(...)`
- promptPack formal handoff and provider lowering path
- provider-neutral `ModelDecision`
- governed BaseTool runtime mount chain
- session/state/event store in memory and SQLite
- approval resolver envelope
- inspection/debug/selfRepair contracts
- storage plane for `~/.rax` and `.rax_workspace`

Still compatibility bridge or contract-only:

- final product-grade MainLoop executor
- final PromptPack semantics and compression strategy
- remote package installation and marketplace distribution
- concrete TAP/CMP/MP/multiagent advanced capabilities
- macOS/Windows/container/remote sandbox providers beyond readiness contracts
- live adapters for every model endpoint role

## 15. Verification Commands

Before pushing framework-core work:

```bash
npm run typecheck
node --import tsx --test test/agentCore/agentCorePublicApi.test.ts
npm run test:agentCore
git diff --check
```

Optional live checks need provider/auth setup:

```bash
AGENTCORE_LIVE_TEST=1 npm run test:agentCore:live
npm run smoke:agentCore
npm run lab:agentCore:tools
```

## 16. Rules For Future Work

- Do not bypass `compileAgent -> AgentManifest -> runManifest`.
- Do not tell developers to import deep `runtime.*` files for normal authoring.
- Do not put raw provider secrets into manifests or workspace storage.
- Do not reclassify tools by executor namespace; keep `family / group / toolId`.
- Do not implement TAP/CMP/MP/multiagent concrete strategy inside Kernel.
- Do not turn PromptPack into a string-only provider payload builder.
- Do not turn MainLoop hooks into arbitrary user JS execution.
- Do not let BaseTool handlers touch host resources directly; runtime/TAP/adapters own host resources.
