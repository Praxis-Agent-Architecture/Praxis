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

## 2.1 Definition Surface And Configuration Surface

Praxis separates the developer-facing **definition surface** from the runtime-facing **configuration surface**.

Plainly:

- definition surface: what the developer writes in TypeScript to define an Agent.
- configuration surface: what the runtime reads after `compileAgent(...)` has normalized the Agent into an `AgentManifest`.

The normal authoring chain is:

```text
TypeScript Agent class
  -> compileAgent(...)
  -> AgentManifest
  -> inspect / test / run
  -> RuntimeKernel.runManifest(...)
```

The developer should usually define these fields:

| Field | Developer meaning | Runtime meaning |
| --- | --- | --- |
| `identity` | Who this Agent is. | Stable agent id, version, inspect/report key. |
| `model` | Default model. | Primary provider carrier and invocation target. |
| `modelFleet` | Optional multi-endpoint model plan. | Capability-role matrix for provider probing and routing. |
| `promptPack` | Base prompt, prompt package, patches, declared context material. | PromptPack material refs, cache segments, audit refs. |
| `mainLoop` | Reusable running strategy and extension refs. | Stable lifecycle hooks, not arbitrary JS execution. |
| `sandbox` | Host/sandbox profile. | Provider readiness, filesystem/network/process boundary metadata. |
| `toolPolicy` | BaseTool governance matrix/profile. | Policy decision input for safe/risky/dangerous tool actions. |
| `storage` | Where project/runtime data should live. | `.rax_workspace` and SQLite/artifact/cache path refs. |
| `session` | Persistence, resume, thread, log settings. | Session/state/event store policy. |
| `statePlane` | What external surfaces can see/control. | Pause/resume/approval/inspect/repair control contract. |
| `harness` | The assembled capability shell. | Tools, loop limits, policy, refs, runtime requirements. |

The key rule: **runtime only executes the Manifest**. Class fields are authoring convenience. Constructor parameters may select declaration variants, but constructors must not start processes, read secrets, call providers, or mutate host state.

Minimal definition:

```ts
class MinimalAgent extends praxis.Agent {
  identity = "agent.minimal";
  model = praxis.model("gpt-5.5");
  harness = praxis.harness({
    tools: praxis.tools([praxis.baseTools.code.read()]),
    loop: praxis.loop.standard({ maxModelTurns: 1, maxToolCalls: 1 }),
  });
}
```

Mature definition:

```ts
class FullstackAgent extends praxis.AgentArchetype {
  identity = { id: "agent.fullstack", version: "1.0.0" };
  model = praxis.model("gpt-5.5", { provider: "openai", endpointShape: "responses" });
  promptPack = new CodingPrompt();
  mainLoop = praxis.mainLoop.standard({ buildPromptRef: "agent.fullstack.prompt" });
  sandbox = praxis.sandbox.linuxBubblewrap();
  toolPolicy = praxis.toolPolicies.standard();
  storage = praxis.storage.raxWorkspace();
  session = praxis.session({ persistence: "sqlite", resume: "auto", thread: "durable", logs: "full" });
  statePlane = praxis.statePlane({
    expose: ["phase", "toolCalls", "errors"],
    control: ["pause", "resume", "interrupt", "approve", "deny", "inspect", "repair"],
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

Configuration lives in the compiled manifest:

```ts
const compiled = praxis.compileAgent(FullstackAgent);
if (!compiled.ok) throw new Error(compiled.error.message);
console.log(compiled.manifest.harness.tools);
console.log(compiled.manifest.sandbox);
console.log(compiled.manifest.toolPolicy);
```

CLI equivalents:

```bash
rax inspect agents/repoInspector/praxis.agent.ts --export RepoInspectorAgent
rax test agents/repoInspector/praxis.agent.ts --export RepoInspectorAgent
```

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

### 7.1 Tool Selection Modes

Tool exposure is not all-or-nothing. The framework supports several authoring modes:

- `allOpen`: expose all 175 BaseTool definitions. Useful for fullstack stress tests, noisy for normal agents.
- `autoFolded`: expose family-level tool descriptions first; the model can request `praxis_expand_tool_context` to unfold a family/group/tool description.
- `manualCoarse`: developer selects by family or group, for example all `codeBase` and `gitBase`.
- `manualFine`: developer selects exact tool ids, for example `code.read` and `git.getRepositoryStatus`.
- `semiAuto`: developer pins hot families/tools and lets the rest stay folded.
- `none`: no BaseTool exposure, pure chat/planning.

The context tree is stable:

```text
baseTool_index
-> family
-> group
-> tool
```

Tool heat is tracked per Agent. A tool call increases the tool score, its group score, and its family score. Hot nodes stay expanded so the model does not repeatedly rediscover common tools. Cold nodes fold back to indexes to protect PromptPack cache stability.

### 7.2 BaseTool Readiness Meaning

When docs or inspection say a BaseTool is ready, it means the tool has passed these gates:

```text
catalogMounted
providerSchemaReady
modelCallable
governanceReady
dependencyReady
hostAdapterReady
liveSmokeReady
```

For the current Codex/OpenAI path, fullstack live dialogue also proves `modelDialogueReady`: the model can see provider tools, choose a tool from natural language, call it, receive the result, and continue.

Useful commands:

```bash
npm run test:agentCore:all-tools-matrix
bin/rax test realtest/fullstack --all-testable --json
```

Expected current all-tools matrix:

```text
catalog.total = 175
matrixCoverage.covered = 175
matrixCoverage.missing = 0
shell = 32/32
git = 35/35
code = 29/29
skill = 6/6
omni = 14/14
computeruse = 32/32
search = 4/4
mcp = 23/23
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

`PraxisRuntimeKernel.runManifest(...)` now prepares the declared sandbox before model invocation. If a required live provider is unavailable, the run fails early with `SANDBOX_UNAVAILABLE`, records the sandbox probe in session events, and avoids calling the model or tools under a false isolation claim.

When `praxis.sandbox.linuxBubblewrap()` is prepared successfully, the default runtime-owned BaseTool executor runs process-backed host ports through bubblewrap:

- `shell.run`
- `process.run`
- `git.runGit`
- external `search.ripgrep` dispatch

Filesystem ports such as `filesystem.readText` and `filesystem.writeText` are still executed by the Node runtime process, so they are governed by workspace/allowed-root policy rather than OS-level bubblewrap containment. This split is intentional for v1: process side effects get real Linux sandbox execution first, while direct filesystem adapters remain strict scoped host adapters.

### 8.1 Linux Sandbox Profiles

Linux is the first platform with a real OS-level sandbox route. The main provider is bubblewrap (`bwrap`).

Available Linux authoring helpers:

```ts
praxis.sandbox.hostObserved()
praxis.sandbox.workspaceOnly()
praxis.sandbox.linuxBubblewrap()
praxis.sandbox.linuxBubblewrapReadonly()
praxis.sandbox.linuxBubblewrapWorkspaceWrite()
praxis.sandbox.linuxBubblewrapNetworked()
```

Profile meanings:

| Profile | Isolation | Default use |
| --- | --- | --- |
| `hostObserved` | No OS isolation. Runtime observes, logs, gates, approves. | Default local development. |
| `workspaceOnly` | Policy-level workspace boundary. Not a container. | Safer local file policy without bwrap. |
| `linuxBubblewrap` | Real Linux process sandbox when `bwrap` is available. | Recommended Linux isolation route. |
| `linuxBubblewrapReadonly` | Bubblewrap with workspace read-only stance. | Analysis agents and repo inspectors. |
| `linuxBubblewrapWorkspaceWrite` | Bubblewrap with workspace write policy gates. | Coding agents that need edits. |
| `linuxBubblewrapNetworked` | Bubblewrap with network allowed by policy. | Agents that must call network tools. |

The bubblewrap filesystem model:

```text
/workspace
  mapped project workspace

$HOME
  .rax_workspace/sandbox/home

/tmp
  .rax_workspace/sandbox/tmp

artifacts
  .rax_workspace/sandbox/artifacts
```

By default it does not expose the real user home directory. It mounts only the system paths needed for common developer commands, such as `/usr`, `/bin`, `/lib`, `/lib64`, and read-only `/etc` when needed. Device exposure is minimal: `/dev/null`, `/dev/zero`, `/dev/random`, and `/dev/urandom`.

Process isolation uses bubblewrap capabilities where available:

```text
--unshare-pid
--unshare-ipc
--unshare-uts
--die-with-parent
--proc /proc
```

Network behavior is decided by the combined sandbox profile and tool policy:

- `standard` / `restricted`: network is denied or approval-gated unless explicitly declared.
- `permissive`: network can be allowed for test/fullstack flows if policy permits.
- `yolo` / `bapr`: broader allow, still logged and inspectable.

### 8.2 Linux Sandbox Dependencies And Self-Repair

`linuxBubblewrap()` requires:

```text
binary:bwrap
```

The runtime probes it before executing process-backed tools. If missing, the runtime returns public-safe readiness and a self-repair plan. It must not silently run unsandboxed when the manifest requires bubblewrap.

Check from CLI:

```bash
rax inspect agents/repoInspector/praxis.agent.ts --export RepoInspectorAgent
rax test agents/repoInspector/praxis.agent.ts --export RepoInspectorAgent --sandbox=linuxBubblewrap
```

Check from npm tests:

```bash
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeSandboxProvider.test.ts
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.test.ts
```

Failure semantics:

| Error | Meaning |
| --- | --- |
| `SANDBOX_UNAVAILABLE` | The requested sandbox provider is not ready, and fallback is not explicitly allowed. |
| `SANDBOX_PROVIDER_UNSUPPORTED` | The selected provider is contract-only on this platform. |
| `missingDependency` | Required binary/provider dependency is missing. |
| `smokeFailed` | Provider exists but the isolation smoke failed. |

Fallback must be explicit. A manifest that asks for `linuxBubblewrap()` should not quietly run as `hostObserved`.

### 8.3 ToolPolicy And Sandbox Together

Sandbox and tool policy answer different questions:

```text
sandbox: where and how can this process run?
toolPolicy: should this action be allowed, approval-gated, or blocked?
```

Examples:

- `linuxBubblewrapReadonly()` can isolate a shell command, but `toolPolicies.standard()` may still require approval for a risky command.
- `toolPolicies.permissive()` may allow a read-only command, but sandbox readiness can still block if `bwrap` is missing and fallback is disabled.
- `workspaceOnly()` can restrict path roots, but it is not a container. It should be documented as policy-level containment.

Every sandbox or policy block should be returned as a model-visible observation and a public-safe event. The model can then replan instead of pretending the tool ran.

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

If the file exports exactly one Praxis Agent class, `rax inspect/test/run` can discover it. If the file exports multiple Agents, pass an explicit export:

```bash
rax inspect agents/mainAgent.ts --export RepoInspectorAgent
```

`rax inspect` compiles and reports manifest/sandbox/readiness. `rax test` goes one step further: it executes a governed `PraxisRuntimeKernel.runManifest(...)` dry-run with an in-memory session store, so promptPack, mainLoop records, sandbox preparation, and final output exposure are exercised without live provider calls or tool side effects.

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

Every pending runtime approval also emits an `InterfaceEnvelope` event with kind `approval`. That gives CLI/TUI/Raxode/Raxos/application surfaces a stable public-safe envelope to route, display, approve, deny, audit, or replay.

The same interface envelope shape is available for other external surfaces:

```ts
praxis.interfaceAdapter.eventInterfaceEnvelope(...);
praxis.interfaceAdapter.stateInterfaceEnvelope(...);
praxis.interfaceAdapter.managementInterfaceEnvelope(...);
praxis.interfaceAdapter.repairInterfaceEnvelope(...);
```

These are still contracts, not product UI. They are the bridge Raxode, Raxos, CLI/TUI, or an embedded application can subscribe to without importing deep runtime internals.

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
