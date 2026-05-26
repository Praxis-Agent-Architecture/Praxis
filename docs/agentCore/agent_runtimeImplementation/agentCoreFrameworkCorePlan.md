# AgentCore Framework Core Plan

> Source path: `src/agentCore`

## 1. Goal

Turn `agentCore` into the independent, reliable Praxis framework core.

The target chain is:

```text
Developer TS Agent
  -> compileAgent
  -> AgentManifest
  -> PraxisRuntimeKernel.runManifest
  -> promptPack / mainLoop / ModelDecision
  -> modelAdapter / BaseTool runtime governance
  -> session / state / event / approval
  -> inspectable AgentRunResult
```

Core decisions:

- `agentCore` is the only Praxis kernel.
- The developer equation is `model + harness = agent`.
- TS Agent files are the primary authoring source.
- `AgentManifest` is the runtime truth, reproducibility object, and distribution contract.
- `PraxisRuntimeKernel` is the runtime orchestrator and governance host, not the business loop.
- `agent_executionEngine` owns the agent running body: IO, promptPack, mainLoop, state, event exposure, and basic tool layer.
- BaseTool identity is `family / group / toolId`.
- BaseTool calls must go through registry / handler / executor port.
- Default policy profile is `standard`.
- Default sandbox profile is `host-observed`.
- TAP/CMP/MP/multiagent are self-hosted official modules built on `agentCore`; this plan only keeps their bridge/contract ready and does not implement their concrete advanced abilities.

## 2. Non-Goals

Do not use this plan to:

- implement TAP/CMP/MP/multiagent concrete strategy;
- invent final DSL syntax;
- implement full remote rax package distribution;
- rewrite the 176 BaseTool handlers;
- bypass `createBaseToolRegistry().lookupHandler`;
- turn PromptPack into a provider payload builder;
- turn MainLoop into arbitrary user JS execution;
- expose `runtime.*` deep files as normal public API;
- move product logic for Raxode or Raxos into `agentCore`.

## 3. Phase Index

| Phase | Name | Main Outcome |
| --- | --- | --- |
| 0 | Framework Core Audit | Current repo state split into live, dry-run contract, and v1 compatibility bridge |
| 1 | Public Developer API Boundary | Stable public exports and internal runtime boundary |
| 2 | Developer Authoring Surface v1 | Developers can write mature Agent/Archetype classes |
| 3 | AgentManifest Contract Completion | Manifest carries the full framework core contract |
| 4 | PromptPack Formal Layer | PromptPack becomes the governed internal context package |
| 5 | MainLoop/CoreLogic Formal Layer | Kernel turn loop records through mainLoop/coreLogic contracts |
| 6 | ModelDecision Layer | Provider output has one interpretation contract |
| 7 | BaseTool Runtime Governance | 176 tools are governed, observable, and policy-aware |
| 8 | Session/State/Event/Approval Core | Runs are resumable, observable, and controllable |
| 9 | Runtime Kernel Closure | Kernel becomes a clean orchestrator over formal surfaces |
| 10 | Inspection/Debug/SelfRepair Contracts | Framework can be inspected like a developer tool |
| 11 | Rax Developer Commands v1 Contract | rax inspect/test/run/dev/build shape is stable |
| 12 | Official Module Bridge Contract | TAP/CMP/MP/multiagent remain bridge-ready without backdoors |

## 4. Phase 0: Framework Core Audit

### Purpose

Get a repo-grounded map before editing. The output should distinguish real live chains from dry-run contracts and v1 compatibility bridges.

### Read Targets

- `src/runtimeImplementation/runtimeAgentManifest.ts`
- `src/runtimeImplementation/praxisRuntimeKernel.ts`
- `src/runtimeImplementation/runtime.modelAdapter/`
- `src/runtimeImplementation/runtime.execEngine/`
- `src/runtimeImplementation/runtime.governancePlane/`
- `src/runtimeImplementation/runtimeSessionStateEventStore.ts`
- `src/executionEngine/IOTransceiver/`
- `src/executionEngine/promptPack/`
- `src/executionEngine/coreLogic/`
- `src/executionEngine/basic_toolLayer/`
- `src/runtimeImplementation/runtime.inspection/`
- `src/runtimeImplementation/runtime.debug/`
- `src/runtimeImplementation/runtime.selfRepair/`
- `src/runtimeImplementation/runtime.officialModuleSurface/`

### Task Checklist

- [x] Map `PraxisAgent -> compileAgent -> AgentManifest`.
- [x] Map `runtime.run(agent, task)` and confirm it compiles first.
- [x] Map `runManifest` and list which surfaces it binds today.
- [x] Identify current PromptPack formal files versus Kernel prompt shim.
- [x] Identify current MainLoop/coreLogic formal files versus Kernel `maxModelTurns` shim.
- [x] Confirm current ModelDecision ownership.
- [x] Confirm current BaseTool runtime mount chain.
- [x] Confirm current session/state/event persistence path.
- [x] Confirm current approval/gating behavior and what is still placeholder.
- [x] Confirm current public-safe error shape.
- [x] Mark TAP/CMP/MP/multiagent bridge files as contract-only unless proven live.
- [x] Produce a short current-state doc or section with three buckets:
  - [x] live usable;
  - [x] contract ready but dry-run;
  - [x] compatibility bridge / post-v1 replacement.

### Acceptance

- A developer can see what is already real and what is only preparatory.
- No implementation work starts before this audit is complete.
- The audit does not rely on memory when current files disagree.

### Phase 0 Audit Snapshot

This snapshot is repo-grounded from the Phase 0-2 pass and remains as the readiness baseline for framework-core v1. It is intentionally split by readiness so later phases do not mistake contract scaffolding for live behavior.

#### Live usable

- OAO compile path: `runtimeAgentManifest.ts` supports `PraxisAgent` / `PraxisAgentArchetype`, `compileAgent(Class)`, `compileAgent(instance)`, stable `AgentManifest`, stable hash, public-safe compile errors, modelFleet, promptPack, mainLoop, sandbox, toolPolicy, session, and statePlane manifest fields.
- Kernel entry path: `PraxisRuntimeKernel.run(agent, task)` compiles first, then calls `runManifest`; `runManifest` creates a session, records state/events/invocations, receives text input, builds a promptPack bridge, lowers it, invokes model runtime, interprets `ModelDecision`, invokes mounted BaseTools, records `MainLoopStepRecord`, and returns `AgentRunResult`.
- Model live slice: `runtime.modelAdapter/modelInvocationRuntime.ts` can dry-run by default and can call the injected `codex_responses` provider path when governance/auth/provider caller allow it.
- BaseTool live slice: `runtime.execEngine/baseToolRuntimeMount.ts` keeps the canonical chain `adaptRuntimeToolInvocation -> bridgeExecEngineInvocation -> createBaseToolRegistry().lookupHandler -> BaseToolHandler.invoke({ executor }) -> BaseToolExecutorPort.*`.
- BaseTool runtime support: `baseToolSupportCatalog.ts` covers the current 176 builtin baseTool handlers excluding office TAP, and `baseToolExecutorPortFactory.ts` provides real host-backed support for the current safe subset plus stable unavailable boundaries for unimplemented providers.
- Session/state/event persistence: `runtimeSessionStateEventStore.ts` has in-memory and SQLite stores for sessions, states, events, and invocations with public-safe JSON.
- Text IO v1: `IOTransceiver/inputReceiver/textReceiver.ts` and output exposers have governed, tested contracts that feed the current kernel path.

#### Contract ready but dry-run

- PromptPack formal files exist in `agent_executionEngine/promptPack`: definition, assembly, modifier, mapper, and provider-facing exposure all preserve provider-neutral material records and governance/injection boundaries, but they are not the final prompt semantics.
- MainLoop/coreLogic formal files exist in `agent_executionEngine/coreLogic`: `mainLoop.ts`, `modelDecision.ts`, `ephemeralProcedure.ts`, `stateEngine.ts`, `observationIntegrator.ts`, and `reuseInvoker.ts` provide records and normalized plans, but most behavior remains planning/contracts rather than the final live loop body.
- Governance/approval surfaces exist in `runtime.governancePlane` and can classify allow/deny/requires-approval/degrade; concrete CLI/TUI/UI/Raxos approval products are post-v1 surfaces above the current envelope/resolver contract.
- Inspection/debug/selfRepair surfaces exist and are tested as governed dry-run or contract probes; final developer UX is post-v1 product work above the current framework reports.
- Official module bridge files for TAP/CMP/MP/multiagent exist in `runtime.officialModuleSurface` and remain bridge/contract-only. They must not be treated as concrete TAP/CMP/MP/multiagent implementations.

#### Compatibility Bridges Accepted In V1

- The provider body builder inside `praxisRuntimeKernel.ts` is a codex-responses compatibility bridge accepted for framework-core v1; it consumes formal PromptPack/lowering output instead of raw task string assembly.
- The `maxModelTurns` / `maxToolCalls` for-loop inside `PraxisRuntimeKernel.runManifest` is compatibility orchestration accepted for framework-core v1. It records formal mainLoop/coreLogic handoff steps; a reusable MainLoop executor is tracked as post-v1 closure.
- Provider output parsing has moved into `ModelDecision`; the kernel keeps provider tool declaration/name mapping for compatibility with codex-responses function calling.
- Approval now creates public-safe approval envelopes and can be routed to an injected application/test-harness resolver, but CLI/TUI/UI/Raxos concrete surfaces are still later work.
- `rax` developer command contract exists for inspect/test/run/dev/build; the full CLI binary and package manager remain post-v1 work.

## 5. Phase 1: Public Developer API Boundary

### Purpose

Make it clear what framework users can import, and what is internal runtime machinery.

### Public API Candidates

```ts
PraxisAgent
PraxisAgentArchetype
compileAgent
PraxisRuntimeKernel

model
modelFleet
endpoint

harness
tools
tool
toolPolicies

PromptPack
markdown
markdownFile
append
prepend
overwrite
replaceLastLines

mainLoop
loop

sandbox
session
statePlane
policy
```

### Internal API Boundary

Deep files under these surfaces are internal by default:

- `runtime.execEngine`
- `runtime.modelAdapter`
- `runtime.governancePlane`
- `runtime.invocationMethod`
- `runtime.managementPlane`
- `runtime.officialModuleSurface`
- BaseTool executor port factories
- provider-specific invocation implementations

### Task Checklist

- [x] Locate existing entry exports or barrel files.
- [x] Decide where public framework exports should live.
- [x] Add or update a public barrel export if missing.
- [x] Keep deep runtime files importable internally, but not documented as stable user API.
- [x] Add package export map if package layout supports it.
- [x] Add a public API smoke test.
- [x] Add a developer example that imports only public API.
- [x] Document stable public API versus internal unstable API.
- [x] Ensure no example agent needs deep `runtime.*` imports.

### Acceptance

- A developer can write and run a simple agent from public exports only.
- Internal runtime files remain usable by runtime implementation without being marketed as stable API.
- The public API supports both minimal agents and mature archetypes.

## 6. Phase 2: Developer Authoring Surface v1

### Purpose

Make TS class authoring genuinely comfortable for mature agents.

### Target Shape

```ts
class CodingAgent extends PraxisAgentArchetype {
  identity = "agent.coding";
  model = model("gpt-5.5");
  modelFleet = modelFleet.auto(...);
  promptPack = new CodingPrompt();
  mainLoop = mainLoop.standard(...);
  sandbox = sandbox.hostObserved();
  toolPolicy = toolPolicies.standard();
  session = session({ persistence: "sqlite", resume: "auto" });
  statePlane = statePlane({ expose: ["phase"], control: ["pause"] });
  harness = harness({ tools: tools([...]) });
}
```

### Required Additions

- `sandbox.hostObserved()`
- `toolPolicies.bapr()`
- `toolPolicies.yolo()`
- `toolPolicies.permissive()`
- `toolPolicies.standard()`
- `toolPolicies.restricted()`
- policy profile docs for `safe / risky / dangerous`
- authoring examples for minimal agent and archetype agent

### Standard Policy Definition

`standard` is the default profile:

```text
safe: pass with workspace/runtime boundary checks
risky: guarded pass or approval by category
dangerous: approval required
```

### Host Observed Sandbox Definition

`host-observed` means:

```text
no real container isolation yet
runtime still records, gates, budgets, and approves actions
policy remains active
```

### Task Checklist

- [x] Add `sandbox.hostObserved` helper.
- [x] Add policy profile helpers.
- [x] Ensure helpers compile into `AgentManifest`.
- [x] Ensure helpers appear in both top-level manifest view and harness view if needed.
- [x] Add validation for invalid profile shape.
- [x] Add tests for each policy profile.
- [x] Add tests for default `standard` profile.
- [x] Add tests for `host-observed` manifest output.
- [x] Add example minimal `PraxisAgent`.
- [x] Add example mature `PraxisAgentArchetype`.
- [x] Reject non-declarative hook/function bodies.
- [x] Reject duplicate PromptPack patch ids.
- [x] Keep constructors declaration-only.

### Acceptance

- A developer can write a mature agent without touching runtime internals.
- The default policy is useful but not reckless.
- The default sandbox is honest about being observed host execution.

## 7. Phase 3: AgentManifest Contract Completion

### Purpose

Make Manifest the complete runtime contract for framework core behavior.

### Manifest Must Express

- identity
- source and compile constraints
- model and modelFleet
- provider carriers and auth-profile refs
- harness
- promptPack
- mainLoop
- tools
- toolPolicy
- sandbox
- governance and approval
- session
- statePlane
- storage
- runtimeRequirements
- official module bridge declarations
- inspection/debug requirements
- verification gates

### Task Checklist

- [x] Review existing `AgentManifest` type.
- [x] Add missing framework fields conservatively.
- [x] Normalize and validate each new field.
- [x] Preserve stable manifest hash.
- [x] Preserve `runManifest` compatibility.
- [x] Add validation for malformed manifest-like input if supported.
- [x] Add inspectable manifest summary.
- [x] Ensure no raw credentials or provider private shapes enter manifest.
- [x] Ensure top-level authoring fields and harness view stay consistent.
- [x] Add tests for hash stability.
- [x] Add tests for malformed fields.
- [x] Add tests for manifest inspect output.

### Acceptance

- Manifest is the only object the runtime needs to execute an agent.
- Manifest is stable enough for package/sign/repro workflows.
- Manifest does not leak raw secrets or provider-specific response details.

## 8. Phase 4: PromptPack Formal Layer

### Purpose

Turn PromptPack into the formal governed context package, replacing ad hoc Kernel string building over time.

### Context Sources

```text
declared built-ins
process products
user request
```

### Required Capabilities

- base prompt material
- tool description projection
- prompt patching
- scene trigger material
- state trigger material
- process observation material
- tool result summary material
- failure summary material
- user IO material
- memory/CMP placeholder material
- multimodal material refs
- audit refs
- source refs
- token/budget records
- trust/injection boundary records

### Key Files

- `src/executionEngine/promptPack/promptDefiner.ts`
- `src/executionEngine/promptPack/promptAssembler.ts`
- `src/executionEngine/promptPack/promptModifier.ts`
- `src/executionEngine/promptPack/promptProvider.ts`
- `src/runtimeImplementation/runtime.execEngine/bindPromptPack.ts`
- `src/runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.ts`

### Task Checklist

- [x] Define formal material kinds.
- [x] Define declared built-in material assembly.
- [x] Define process observation insertion.
- [x] Define user request material insertion.
- [x] Define tool description projection source.
- [x] Define failure summary projection.
- [x] Define multimodal refs without reading media at compile time.
- [x] Enforce prompt injection/trust boundaries.
- [x] Preserve prompt patch audit refs.
- [x] Keep provider payload mapping out of PromptPack.
- [x] Route final lowering through `promptLoweringRuntime`.
- [x] Replace Kernel's direct prompt string construction with formal PromptPack calls.
- [x] Add tests for safe assembly.
- [x] Add tests for unsafe injection rejection.
- [x] Add tests for observation append.
- [x] Add tests for lowering envelope.

### Acceptance

- PromptPack is provider-neutral.
- PromptPack can explain what material entered the model context and why.
- Kernel does not grow more prompt-string logic.

## 9. Phase 5: MainLoop/CoreLogic Formal Layer

### Purpose

Move agent behavior out of Kernel-local shims and behind formal mainLoop/coreLogic contracts.

### Required MainLoop Responsibilities

- action primitive planning
- one tick planning
- promptPack handoff
- model invocation handoff
- ModelDecision handoff
- tool call handoff
- EphemeralProcedure handoff
- approval wait/resume
- interrupt/cancel
- retry/timeout policy
- state transition
- observation integration
- shouldContinue / shouldBreak
- error handling
- event emission

### MainLoopStepRecord Required Fields

```text
stepId
sessionId
turnIndex
stepIndex
actionPrimitive
status
inputRefs
outputRefs
modelCallId
toolCallId
procedureId
stateBeforeRef
stateAfterRef
promptPackRef
loweredPromptRef
observationRefs
governance result
contract result
public-safe error
timestamps
trace/correlation ids
metadata
```

### Key Files

- `src/executionEngine/coreLogic/mainLoop.ts`
- `src/executionEngine/coreLogic/stateEngine.ts`
- `src/executionEngine/coreLogic/modelDecision.ts`
- `src/executionEngine/coreLogic/ephemeralProcedure.ts`
- `src/executionEngine/coreLogic/observationIntegrator.ts`
- `src/runtimeImplementation/runtime.execEngine/bindCoreLogic.ts`
- `src/runtimeImplementation/praxisRuntimeKernel.ts`

### Task Checklist

- [x] Define final action primitive names.
- [x] Define `MainLoopStepRecord`.
- [x] Plan one model-only tick.
- [x] Plan one tool tick.
- [x] Plan one EphemeralProcedure tick.
- [x] Add approval wait state.
- [x] Add resume path.
- [x] Add interrupt path.
- [x] Add failure path.
- [x] Add state transition integration.
- [x] Add event store integration.
- [x] Move Kernel `maxModelTurns` behavior behind mainLoop handoff entrypoints for v1.
- [x] Keep Kernel as orchestrator.
- [x] Add tests for each tick type.
- [x] Add tests for step records.
- [x] Add tests for approval/resume/failure.

### Acceptance

- Kernel no longer owns provider parsing, BaseTool semantics, or unrecorded behavior; the remaining turn-loop bridge calls formal mainLoop handoff records and is tracked as post-v1 executor closure.
- Every significant action has a step record.
- MainLoop can be reused by different harnesses.

## 10. Phase 6: ModelDecision Layer

### Purpose

Make model output interpretation uniform and provider-neutral.

### Inputs

- codex responses text
- function calls
- streaming/SSE output items
- response completed objects
- provider failures
- future provider adapter outputs

### Outputs

```text
finalOutput
toolCall
ephemeralProcedurePlan
requestApproval
continue
fail
```

### Task Checklist

- [x] Define stable ModelDecision variants.
- [x] Preserve provider raw refs only as metadata.
- [x] Parse text to `finalOutput`.
- [x] Parse function call to `toolCall`.
- [x] Parse procedure JSON to `ephemeralProcedurePlan`.
- [x] Parse approval requests if model emits them.
- [x] Deduplicate streamed calls by call id.
- [x] Reject provider tool-name collisions.
- [x] Map malformed provider output to public-safe `fail`.
- [x] Move provider-specific shape handling out of Kernel-local helpers and into the formal `ModelDecision` interpreter.
- [x] Add tests for all current variants and failure boundaries.

### Acceptance

- Kernel does not guess provider output directly.
- MainLoop sees one Praxis-native decision shape.
- Provider-specific details do not become core contracts.

## 11. Phase 7: BaseTool Runtime Governance

### Purpose

Make all 176 BaseTools governed, observable, and policy-aware through the existing mount chain.

### Canonical Chain

```text
runtime request
  -> adaptRuntimeToolInvocation
  -> bridgeExecEngineInvocation
  -> createBaseToolRegistry().lookupHandler
  -> BaseToolHandler.invoke({ executor })
  -> BaseToolExecutorPort.*
```

### Required Governance

- family/group/toolId policy lookup
- safe/risky/dangerous risk model
- default `standard` profile
- approval request generation
- host-observed sandbox metadata
- dependency readiness report
- resource limit checks
- event persistence
- session linkage
- step record linkage
- public-safe failure mapping
- result routing to observation material

### Task Checklist

- [x] Confirm semantic basetool catalog coverage.
- [x] Add policy lookup by family/group/toolId.
- [x] Map tool risk to safe/risky/dangerous.
- [x] Implement standard profile behavior.
- [x] Implement bapr/yolo/permissive/restricted profile behavior.
- [x] Generate approval request for governed actions that require approval.
- [x] Record host-observed sandbox metadata.
- [x] Record dependency readiness.
- [x] Route successful tool result to observation material.
- [x] Route tool failure to public-safe error.
- [x] Ensure every Kernel tool call persists event/session data.
- [x] Ensure EphemeralProcedure steps still call `invokeMountedBaseTool`.
- [x] Add tests for safe pass.
- [x] Add tests for guarded/approval behavior.
- [x] Add tests for approval-required policy.
- [x] Add tests for missing dependency/readiness blocked.
- [x] Add tests for provider/tool failure boundary through Kernel and mount tests.

### Acceptance

- Tools are not merely mounted; they are managed.
- Runtime still does not own BaseTool semantics.
- No tool bypasses registry/handler/executor.

## 12. Phase 8: Session / State / Event / Approval Core

### Purpose

Make agent runs observable, resumable, debuggable, and controllable.

### Default Storage

SQLite, with in-memory fallback for tests and simple embeddings.

### Required Records

- session create
- session resume
- state snapshot
- state transition
- event log
- mainLoop step records
- model call records
- tool call records
- procedure records
- approval pending/resolved
- public-safe error records

### StatePlane

```text
expose: readonly fields
control: pause / resume / interrupt / rollback
```

### ApprovalPlane

Approval is routed through interface/application surfaces:

- CLI prompt
- TUI/UI
- Raxos console
- remote management surface
- test harness approval resolver

### Task Checklist

- [x] Confirm current in-memory store behavior.
- [x] Confirm current SQLite store behavior.
- [x] Add MainLoopStepRecord persistence if missing.
- [x] Add approval pending record.
- [x] Add approval resolved record.
- [x] Add session resume query.
- [x] Add state snapshot query.
- [x] Add state control commands.
- [x] Add pause/resume path.
- [x] Add interrupt path.
- [x] Add rollback plan placeholder.
- [x] Add public-safe error query through session snapshot.
- [x] Add tests for memory store.
- [x] Add tests for SQLite store.
- [x] Add tests for resume.
- [x] Add tests for approval wait/resolver continuation.
- [x] Add tests for interrupt.

### Acceptance

- A run can be inspected after execution.
- A waiting approval does not become an internal deadlock.
- Session/state/event persistence supports later rax/raxos inspection.

## 13. Phase 9: Runtime Kernel Closure

### Purpose

Make `PraxisRuntimeKernel` a clean orchestrator over formal surfaces.

### Kernel Owns

- compile sugar
- `runManifest`
- runtime context creation
- session lifecycle
- surface binding
- governance context
- resource context
- auth/model adapter binding
- BaseTool executor binding
- state/event store binding
- final `AgentRunResult`

### Kernel Must Not Own

- prompt string construction
- provider-specific parsing
- mainLoop action semantics
- BaseTool semantics
- TAP/CMP/MP/multiagent business logic

### Task Checklist

- [x] Keep `runtime.run(agent, task)` as compile-first sugar.
- [x] Keep `runManifest` manifest-only.
- [x] Replace raw task prompt construction with formal PromptPack/lowering path.
- [x] Replace compatibility `maxModelTurns` loop with formal mainLoop handoff entrypoints for v1.
- [x] Replace direct provider output parsing with ModelDecision.
- [x] Keep BaseTool calls through runtime mount.
- [x] Record model/tool/procedure/approval/failure output in session/state/event store.
- [x] Return stable `AgentRunResult`.
- [x] Add tests for no-tool agent.
- [x] Add tests for one-tool agent.
- [x] Add tests for EphemeralProcedure agent.
- [x] Add tests for approval path.
- [x] Add tests for persisted session result.

### Acceptance

- Kernel is thick in governance and lifecycle, thin in business semantics.
- Kernel runs a real agent chain without hidden BaseTool/provider-output shims; the v1 turn loop remains an explicit compatibility bridge and is tracked in post-v1 closure.

### Phase 6-9 Implementation Snapshot

This snapshot records the Phase 6-9 pass. The Kernel now calls the formal `ModelDecision` interpreter for text, function calls, SSE output items, completed responses, provider error objects, malformed function-call arguments, approval requests, and EphemeralProcedure plans. Kernel-local SSE/text/tool extraction helpers were removed; provider raw material survives only as metadata refs on decisions and model calls.

BaseTool governance now has a runtime-owned `baseToolRuntimeGovernance.ts` layer. It evaluates calls by `family / group / toolId`, policy matrix, normalized `safe / risky / dangerous` risk, host-observed sandbox metadata, dependency readiness, and resource context. The real Kernel tool path calls governance before `invokeMountedBaseTool`, and EphemeralProcedure steps continue through the same mount chain instead of bypassing registry/handler/executor.

`runtimeSessionStateEventStore.ts` now records mainLoop steps, procedures, approvals, and public-safe errors in both memory and SQLite stores. Approval is no longer an internal dead wait: the Kernel creates an approval envelope that can stay pending for application surfaces or be resolved by an injected resolver, which is the test-harness stand-in for later CLI/TUI/UI/Raxos surfaces.

The remaining compatibility bridge is the Kernel's turn loop and codex-responses provider body declaration. It consumes formal PromptPack/lowering output and records formal mainLoop handoff steps. This is accepted as the framework-core v1 bridge; reusable MainLoop executor extraction is a post-v1 closure item, not an open blocker for this plan.

## 14. Phase 10: Inspection / Debug / SelfRepair Contracts

### Purpose

Make Praxis feel like a real framework and developer toolchain, not just a runtime function.

### Inspection Needs

- inspect TS agent file
- inspect manifest
- inspect tools
- inspect policy
- inspect sandbox
- inspect session
- inspect state
- inspect step records
- inspect missing requirements

### Debug Needs

- runtime health
- dependency graph
- surface readiness
- provider readiness
- BaseTool readiness
- PromptPack preview
- MainLoop trace
- event replay preview

### SelfRepair Boundary

SelfRepair is required as a framework contract, but aggressive automatic repair should remain controlled. The first layer should diagnose and plan; side effects require policy and approval.

### Task Checklist

- [x] Add or consolidate inspect report contract.
- [x] Add manifest inspect output.
- [x] Add policy inspect output.
- [x] Add tool readiness inspect output.
- [x] Add promptPack preview output.
- [x] Add mainLoop trace output.
- [x] Add dependency graph report.
- [x] Add public-safe missing provider report.
- [x] Add public-safe missing BaseTool dependency report.
- [x] Add selfRepair plan output with no side effect.
- [x] Ensure no raw secret leakage.
- [x] Add tests for each report class.

### Acceptance

- A developer can understand why an agent can or cannot run.
- Debug output is public-safe.
- SelfRepair produces governed plans before effects.

### Phase 10 Implementation Snapshot

`runtime.inspection/frameworkInspectionReport.ts` is now the developer-facing framework report contract. It aggregates `AgentManifest` inspection, policy/sandbox summary, provider readiness, BaseTool readiness, dependency graph, PromptPack preview, MainLoop trace, and dry-run SelfRepair planning without executing repair actions or provider/tool calls.

PromptPack preview stays provider-neutral and explicitly marks `providerPayloadBuilt: false`. Preview text is public-safe redacted for obvious secret-like material. The report can explain missing providers, missing BaseTool dependencies, and degraded optional dependencies as findings instead of throwing raw internals.

## 15. Phase 11: Rax Developer Commands v1 Contract

### Purpose

Stabilize developer command shapes before full package manager implementation.

### Commands

```bash
rax inspect agent.ts
rax test agent.ts
rax run agent.ts
rax dev agent.ts
rax build agent.ts
```

### Behavior

- `inspect`: compile and report; no execution.
- `test`: compile, readiness check, dry-run checks.
- `run`: compile to manifest, then runManifest.
- `dev`: watch, inspect, test, run loop.
- `build`: emit manifest or package artifact.

### Task Checklist

- [x] Decide command entry location.
- [x] Add command contract types.
- [x] Add `inspect` dry-run command path.
- [x] Add `test` dry-run command path.
- [x] Add `run` compile-first path.
- [x] Add `build` manifest emission path.
- [x] Keep network package install out of this phase.
- [x] Ensure command failures are public-safe.
- [x] Ensure commands use public framework API.
- [x] Add tests for TS file input.
- [x] Add tests for manifest input.
- [x] Add tests for invalid agent file.

### Acceptance

- rax command shape is stable enough for future implementation.
- rax uses framework API rather than backdoors.
- Package manager implementation remains outside framework-core v1.

### Phase 11 Implementation Snapshot

`src/rax_packageManager/raxDeveloperCommandContract.ts` defines the v1 command plan for `rax inspect/test/run/dev/build`. The package export map now exposes `./rax` to this contract. The command planner uses only the public `agentCore` API for manifest validation and inspection, keeps package and remote signed agent resolution outside framework-core v1, and returns public-safe errors for invalid inputs.

This is a command contract, not a full CLI/package manager. TS agent file compilation is represented as a planned step; concrete file loading, watch mode, artifact emission, and package distribution are post-v1 rax implementation work.

## 16. Phase 12: Official Module Bridge Contract

### Purpose

Keep TAP/CMP/MP/multiagent ready to mount without implementing their advanced behavior in this plan.

### Module Split

```text
TAP: tool supply + approval/behavior plane
CMP: context management + context injection
MP: memory/RAG management
multiagent: topology + lifecycle + coordination governance
```

### Core Rule

Bridge is core. Implementation is package.

### Task Checklist

- [x] Review `runtime.officialModuleSurface`.
- [x] Ensure each bridge receives governed runtime context.
- [x] Ensure bridges cannot access hidden resources.
- [x] Ensure module policy can inherit runtime policy.
- [x] Ensure module policy can extend runtime policy.
- [x] Ensure module events go through official event bus.
- [x] Ensure module state access goes through official state bridge.
- [x] Ensure module invocation goes through runtime invocation surfaces.
- [x] Add compile/contract tests.
- [x] Add governance denial tests.
- [x] Add no-backdoor tests where feasible.

### Acceptance

- Official modules can be self-hosted on `agentCore`.
- Bridges are stable.
- Concrete advanced module behavior remains outside framework-core v1.

### Phase 12 Implementation Snapshot

`runtime.officialModuleSurface/officialModuleRuntimeSurface.ts` now exposes an explicit bridge access map for governance, event bus, state bridge, and invocation surfaces. It records inherited runtime policy, allowed module policy extensions, granted runtime scopes, and `hiddenResourceAccess: false`. Scope denial is public-safe and checked before a surface is returned.

The existing CMP/MP/TAP/multiagent bridge files remain contract-only dry-run plans. This phase does not implement module strategies; it only makes the official modules self-hostable on `agentCore` without privileged backdoors.

## 17. Global Verification Matrix

Every implementation phase should run the narrowest relevant tests plus a broader gate when feasible.

Required common checks:

```bash
npm run typecheck
git diff --check
```

Frequent targeted checks:

```bash
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeAgentManifest.test.ts
node --import tsx --test test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts
node --import tsx --test test/agentCore/agent_executionEngine/promptPack/*.test.ts
node --import tsx --test test/agentCore/agent_executionEngine/coreLogic/*.test.ts
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolExecutorPortFactory.test.ts
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeMount.test.ts
node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeSessionStateEventStore.test.ts
```

Broad gate:

```bash
npm run test:agentCore
```

Live smoke is gated by environment and should be reported separately:

```bash
AGENTCORE_LIVE_TEST=1 npm run test:agentCore:live
```

## 18. Framework Core v1 Completion Definition

This plan is complete when all statements below are true:

- [x] Developers can write a TS `PraxisAgent` or `PraxisAgentArchetype`.
- [x] The agent compiles to a stable `AgentManifest`.
- [x] The manifest can be inspected.
- [x] `runManifest` executes the manifest without reading live class internals.
- [x] A real model call can run through modelAdapter.
- [x] A safe BaseTool call can run through runtime mount.
- [x] An EphemeralProcedure can orchestrate existing BaseTools.
- [x] PromptPack organizes declared, process, and user materials.
- [x] MainLoop records auditable step records.
- [x] SQLite can persist session/state/event records.
- [x] Approval can pause and resume through an interface/application surface.
- [x] StatePlane exposes read-only state and controlled actions.
- [x] Inspection/debug can explain readiness and failure.
- [x] Public developer API does not require deep `runtime.*` imports.
- [x] TAP/CMP/MP/multiagent have bridges but no backdoor implementation.
- [x] Public-safe errors cover major failure paths.
- [x] `npm run typecheck` passes.
- [x] `npm run test:agentCore` passes, excluding explicitly gated live tests.

### Framework Core v1 Completion Snapshot

This document is now closed as the `agentCore Framework Core v1` plan. The implemented core supports the authoring chain, manifest truth, kernel execution, PromptPack/mainLoop handoff, ModelDecision, BaseTool governance, session/state/event/approval records, inspection/debug/selfRepair reports, public developer API, rax command contracts, and official-module bridge contracts.

The plan is intentionally not claiming final Praxis product completion. The items below are post-v1 closures, not blockers for this framework-core plan:

- Extract the Kernel compatibility turn loop into a reusable MainLoop executor.
- Move codex-responses provider body declaration into a dedicated provider adapter surface when the provider plane is ready for that split.
- Build concrete CLI/TUI/UI/Raxos approval surfaces on top of the existing approval envelope/resolver contract.
- Implement real rax CLI binary, watch mode, build artifact emission, signed package resolution, and package install channels.
- Implement concrete TAP/CMP/MP/multiagent strategies in their own pools using the official module bridge contracts.
- Add deeper StatePlane remote control UX around pause/resume/interrupt/rollback using the existing control contracts.

## 19. Plan Ledger Closeout

This document is a closed implementation ledger for `agentCore Framework Core v1`.

Use future planning documents for post-v1 work. Do not reopen this ledger for:

- final DSL syntax;
- concrete TAP/CMP/MP/multiagent strategy implementations;
- full rax package manager and remote package distribution;
- product-specific Raxode or Raxos logic;
- deeper provider-plane extraction beyond the v1 compatibility bridge;
- reusable MainLoop executor extraction beyond the v1 handoff bridge.

Future work should reference this document as the framework-core baseline and create a separate plan with its own scope, non-goals, verification matrix, and completion definition.
