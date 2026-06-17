# Praxis Runtime Surface Acceptance Plan

> 当前目标：把 Praxis 已有模块收束到中心化 runtime/session 基座，并用可重复实测证明每个 surface 能真实接入，而不是只在文档或类型上互相堆叠。

## Center Thesis

Praxis 的核心机不是一个新组件，而是一条统一运行链：

```text
PraxisAgent / AgentArchetype
  -> compileAgent(...)
  -> AgentManifest
  -> PraxisRuntimeKernel.runManifest(...)
  -> session-bound mount graph
  -> model / promptPack / BaseTool / sandbox / storage / memory / skill / mcp / multiagent
  -> event + checkpoint + inspection + application control surface
```

白话：开发者可以用 OAO 风格写 Agent，但 runtime 只执行 `AgentManifest`。每次运行都必须落在一个 session 上，session 持有本轮挂载图、状态、事件、工具端口、策略和回滚证据。

## Surface Acceptance Contract

每个 runtime surface 必须回答这八个问题，缺一项就不能算正式接入：

1. **Manifest declaration**：AgentManifest 里如何声明这个能力。
2. **Runtime mount**：`runManifest` 或 application layer 如何把真实实现挂进来。
3. **Policy gate**：由哪个 governance/policy/approval 面裁决。
4. **Event path**：成功、失败、拒绝、降级如何进入事件链。
5. **Checkpoint path**：状态和回滚点在哪里记录。
6. **Inspection path**：开发者如何在不执行副作用的情况下看到 readiness。
7. **Real smoke**：最小真实调用是什么，能否在 example/test 里跑通。
8. **Ownership boundary**：runtime 只治理挂载和生命周期，组件自身语义归原模块所有。

## Current Surface Map

| Surface | Current fact | Acceptance state | First gate |
| --- | --- | --- | --- |
| Agent/OAO authoring | `PraxisAgent` / `PraxisAgentArchetype` compile to manifest | usable | compile + validate tests |
| AgentManifest | Runtime truth object with harness/session/storage/sandbox/model/tool refs | usable | manifest validation |
| Runtime kernel | `PraxisRuntimeKernel.runManifest` owns run/session/store/model/tool/sandbox loop | usable | dry-run + live-adapter smoke |
| Application layer | `applicationRuntime` compiles manifest and calls `runManifest`, application events expose public-safe sandbox/tool result evidence, and application view/REST/SSE surfaces retain/query/stream those events | usable | application kernel shell + timeline/rewind smoke |
| Runtime management plane | `application.inspectManagementPlane` returns `praxis.application.managementPlane` over `praxis.runtime.createRuntimeManagementPlane` plus access session, operator console, command router, policy gate, resource governor, mutation planner, rollback controller, and governance bridge dry-run results. It is public-safe, read-only, does not submit model turns, and does not execute management commands | partial but application-inspection-ready | application management plane smoke |
| Approval/governance | Runtime approval requests are routed through `application.approvalDecision`, while `application.inspectGovernance` returns `praxis.application.governanceReport` over `praxis.runtime.createRuntimeGovernanceReport`, `createRuntimeGovernanceIndex`, and `queryRuntimeGovernance` without creating a second approval store. `application.inspectToolCalls` returns `praxis.application.toolCallReport` over `praxis.runtime.createRuntimeToolCallReport`, `createRuntimeToolCallIndex`, and `queryRuntimeToolCalls` so tool invocation, policy, dependency, approval, rollback, and sandbox facts can be inspected without creating a second BaseTool implementation | usable | application approval smoke |
| BaseTool | Semantics stay in catalog/registry; runtime owns `BaseToolExecutorPort` | usable with mounted ports | registry invoke smoke |
| Model adapter | Provider carriers exist; dry-run smoke exists, application.submitTurn can route OpenAI Responses plus Chat Completions through native actualInvocationLayer callers, manifest-declared auth profile refs can resolve through runtime.authPlane into provider calls, manifest-declared modelFleet `primaryRef` chooses the initial endpoint, provider-tool exposure can consume manifest-declared `capabilityMatrix.toolCalling` to choose a tool-capable endpoint, manifest-declared modelFleet fallback can complete the same turn after retryable primary failure, modelFleet retry budgets gate rate-limit/unavailable failures before fallback while non-retryable provider failures remain visible, and manifest-declared `probe.status = "unavailable"` can preselect the declared fallback before the first provider call. Application model events expose public-safe `modelFleetEndpointRef`, `fallbackFrom`, `modelFleetRetryAttempt`, `modelFleetMaxRetries`, `modelFleetCapabilitySelection`, `modelFleetAdaptiveSelection`, `modelFleetRequiredCapabilities`, `modelFailureCode`, and `modelFailureRetryable` metadata; `application.inspectModelCalls` returns `praxis.application.modelCallReport` over `praxis.runtime.createRuntimeModelCallReport`, `createRuntimeModelCallIndex`, and `queryRuntimeModelCalls` without creating a second provider adapter | partial | live provider health probing/adaptive scoring later |
| PromptPack | Turn prep/cache plan exists; application promptPack/cache smoke dispatches `application.inspectModelCalls` and reads `praxis.application.modelCallReport`, proving weighted cache hit rate, stable prompt cache key, stable-prefix comparison, and dynamic-payload comparison are available to upper applications as runtime inspection facts; final governance semantics still evolving | partial | prefix-cache and material tests |
| Sandbox/Raxcell | Policy/middleware/provider chain exists; sandbox mount matrix now distinguishes host-observed, missing provider, and Raxcell evidence; `application.inspectSandboxMountMatrix` returns `praxis.application.sandboxMountMatrix` so upper applications can inspect the same readiness surface before execution | partial but application-matrix-ready | application sandbox mount matrix now, Raxcell live smoke later |
| Storage/session/conversation | In-memory and SQLite-backed planes exist; application-declared durable sessions write/read runtime records through SQLite, application turns can write foundation turn checkpoints plus semantic conversation messages through `runtime.conversationPlane`, and `application.inspectSessionReport` returns `praxis.application.sessionReport` over `praxis.runtime.createRuntimeSessionReport` so public-safe session/fork/checkpoint coverage is available through the application surface | usable | application SQLite + foundation smoke |
| Memory | Passive memory plane and bridge surface exist; `context.load` is application-live proven through an application-owned context adapter, while `application.inspectOfficialAdapterMountMatrix` can read `context.load` mount readiness through the same runtime executor port before adapter execution; durable memory/RAG retrieval remains partial | partial | application context smoke + official adapter mount matrix + memory retrieval later |
| Official adapter composition | `context.load`, `mcp.resources`, and `skill.load` can be mounted together in one application runtime and one `application.submitTurn`, with each tool result fed back into the model loop; `application.inspectOfficialAdapterMountMatrix` returns `praxis.application.officialAdapterMountMatrix` over `runtime.officialAdapterPlane.mountMatrix` to prove context/MCP/skill ports are missing, declared-only, or executor-backed before execution | usable | application official adapters smoke + application official adapter mount matrix |
| Official adapter report | `application.inspectOfficialAdapters` returns a public-safe `praxis.application.officialAdapterReport` wrapper over `praxis.runtime.createRuntimeOfficialAdapterReport`, `createRuntimeOfficialAdapterIndex`, and `queryRuntimeOfficialAdapters`, reading execution-after-the-fact context/MCP/skill/MCP+ adapter evidence without creating a second adapter execution path. This remains separate from the mount matrix, which reads pre-execution readiness | partial | application context/MCP/skill/official-adapters/MCP+ smokes |
| Skill/MCP+ | Skill and MCP resource adapters are application-live proven through `skill.load` and `mcp.resources`; `application.inspectMcpMountMatrix` returns `praxis.application.mcpMountMatrix` over `runtime.mcpPlane.mountMatrix` as a read-only MCP readiness view; `application.inspectOfficialAdapterMountMatrix` reads `skill.load` and `mcp.resources` official-adapter mount readiness through the shared runtime executor port; MCP+ overlay refresh is application-live proven through `mcp_plus.init -> profileStore -> dynamic MCP+ tool` | usable with deeper governance still partial | application skill/MCP/MCP+/mount-matrix smoke |
| Multiagent | Official module/tool surface exists in pieces; `application.inspectMultiagent` returns `praxis.application.multiagentReport` over `praxis.runtime.createRuntimeMultiagentReport`, `createRuntimeMultiagentIndex`, and `queryRuntimeMultiagent`, reading public-safe bridge, agent.* BaseTool, mesh, application event, provider round-trip, and child background runtime evidence without creating a second orchestration path | partial | spawn/message/inbox harness smoke + application multiagent report/index/query |
| Cache/compaction | MainLoop cache plan and compaction executors exist | partial | prefix-cache economics smoke |
| Timeline | Application event retention is queryable through view/REST and live through SSE/WebSocket; `application.inspectTimeline` returns a public-safe `praxis.application.timelineReport` wrapper over `praxis.runtime.createRuntimeTimelineReport`, index/query, and read-only replay planning; modelFleet retry/fallback metadata is preserved across local view, REST view, SSE stream, and WebSocket events; runtime timeline can normalize reopened SQLite session snapshots and foundation checkpoint/session-fork facts; application rewind restores in-memory conversation checkpoints; executable replay policy remains later work | partial | application timeline + runtime timeline + rewind + SQLite smoke, framework timeline later |
| Surface registry/composition | Dry-run registry/composition root exists | contract ledger | resolve + required surface tests |

## Current Verified Slice

This slice is intentionally small but real. It proves that the fullstack application can compile an Agent, mount runtime-owned BaseTool ports, inspect tool readiness from the same executor, expose runtime surface contracts, and run the manifest through the kernel.

Verified command set:

- `npm run typecheck`
- `node --import tsx --test test/agentCore/agentCorePublicApi.test.ts examples/fullstack/tests/repoInspector.compile.test.ts test/agentCore/agent_runtimeImplementation/runtimeSurfaceRegistry.test.ts test/agentCore/agent_runtimeImplementation/runtimeCompositionRoot.test.ts test/agentCore/agent_runtimeImplementation/runtime.inspection/runtimeSurfaceInspector.test.ts`
- `npm run example:fullstack`
- `npm run test:agentCore`
- `node --import tsx --test test/applicationLayer/*.test.ts`
- `npm run build`
- `npm run example:minimal`
- `node --import tsx --test examples/fullstack/tests/repoInspector.compile.test.ts test/agentCore/agentCorePublicApi.test.ts`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.mcpPlane/mcpPlane.test.ts test/applicationLayer/applicationMcp.test.ts`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.sandboxPlane/sandboxMountMatrix.test.ts test/applicationLayer/applicationMcp.test.ts examples/fullstack/tests/repoInspector.compile.test.ts`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeKernelShellToolSmokeScript.test.ts`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/runtimeSandboxShellSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationKernelShellSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationRollbackSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationSandbox.test.ts test/applicationLayer/applicationSandboxSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationApprovalSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationContextSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationMcpSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationMcpPlusSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationSkillSmokeScript.test.ts`
- `node --import tsx --test test/applicationLayer/applicationOfficialAdaptersSmokeScript.test.ts`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/runtime.officialAdapterPlane/officialAdapterReport.test.ts`
- `npm run example:fullstack -- --sandbox=linuxBubblewrap`
- `npm run smoke:application-kernel-shell`
- `npm run smoke:application-sandbox`
- `npm run smoke:application-rollback`
- `npm run smoke:application-rollback-plan`
- `npm run smoke:application-management-plane`
- `npm run smoke:application-approval`
- `npm run smoke:application-sqlite`
- `npm run smoke:application-foundation`
- `npm run smoke:application-foundation-lifecycle`
- `npm run smoke:application-foundation-rewind`
- `npm run smoke:application-timeline`
- `npm run smoke:runtime-timeline`
- `npm run smoke:application-execution-monitor`
- `npm run smoke:application-provider-capability`
- `npm run smoke:application-provider-probe`
- `npm run smoke:application-provider-health`
- `node --import tsx --test test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts --test-name-pattern "runtime decision tools as requiring toolCalling|tool-capable modelFleet endpoint|primaryRef even when another endpoint matches|preselects an available modelFleet endpoint|chat completions|Gemini generateContent"`
- `npm run smoke:application-rewind`
- `npm run smoke:application-context`
- `npm run smoke:application-mcp`
- `npm run smoke:application-mcp-plus`
- `npm run smoke:application-skill`
- `npm run smoke:application-official-adapters`
- `npm run smoke:application-promptpack-cache`
- `npm run smoke:kernel-shell`
- `npm run smoke:promptpack-cache`
- `npm run smoke:sandbox-shell`
- `npm run pack:dry-run`
- `git diff --check`
- `npm run baseline:runtime-core -- --sessions 1000 --concurrency 32`
- `npm run baseline:runtime-core -- --sessions 1000 --concurrency 16 --store sqlite --sqlite-path /tmp/praxis-runtime-core-baseline-size.sqlite`
- `npm run baseline:runtime-core -- --sessions 1000 --concurrency 32 --max-rss-delta-mb <budget> --max-heap-used-delta-mb <budget>`
- `npm run baseline:runtime-core -- --rounds 5 --sessions 1000 --concurrency 32 --max-total-rss-delta-mb <budget> --max-total-heap-used-delta-mb <budget>`
- `npm run baseline:application-core -- --rounds 2 --sessions 100 --concurrency 8 --max-total-rss-delta-mb <budget> --max-total-heap-used-delta-mb <budget>`
- `npm run acceptance:runtime-core -- --rounds 2 --sessions 100 --concurrency 8 --max-total-rss-delta-mb <budget> --max-total-heap-used-delta-mb <budget>`
- `npm run acceptance:runtime-surfaces`

Observed fullstack proof:

- BaseTool mount smoke: `file.read`, `file.search`, and `skill.load` all return `ok: true` through `BaseTool registry -> Runtime BaseToolExecutorPort`.
- Runtime MCP mount matrix: `mcp.use`, `mcp.resources`, `mcp.prompts`, `mcp.completions`, and `skill.load` all report `decision = allowed`, `activeReadiness = available`, `evidenceStatus = executor-backed`, and no missing ports when the runtime executor is supplied with MCP server profiles and an application-owned skill adapter. The same matrix exposes `resourceOperations` for `resources/list`, `resources/templates/list`, and `resources/read`, `promptOperations` for `prompts/list` and `prompts/get`, and `completionOperations` for `completion/complete`, with each operation tied to its concrete `BaseToolExecutorPort.mcp.*` port and evidence status.
- Runtime MCP/MCP+ servers: the fullstack example matrix reports one native MCP server and one MCP+ server, both with runtime profiles present and `nativeToolInventoryStatus = available`; MCP+ exposes dynamic tools, four MCP+ control tools, one skill note from the skill store, and `runtime.mcp` as an explicit requirement.
- Runtime MCP false-ready guard: matrix status degrades when BaseTool ports are only caller-declared strings (`declared-only`) or when a declared MCP server lacks native tool inventory evidence.
- Runtime sandbox mount matrix: the public runtime facade reports `runtime.sandboxPlane.mountMatrix` from a compiled fullstack manifest, includes provider probe evidence, BaseTool sandbox plan, command preview, Raxcell boundary, policy middleware boundary, and false-ready guards.
- Runtime sandbox host-observed guard: `host-observed` is reported as governed host observation with `status = degraded`, not as real OS isolation.
- Runtime sandbox Raxcell guard: injected `linux-bubblewrap`/Raxcell provider evidence can report `status = ready` while keeping `policyOwner = praxis` and `providerRole = environment-and-execution`; missing Raxcell dependency degrades isolated requests to workspace rollback.
- Runtime sandbox live binary proof: on the current Linux host, `npm run example:fullstack -- --sandbox=linuxBubblewrap` reports `status = ready`, `isolationEvidence = os-isolated`, `evidenceStatus = binary`, `providerMounted = true`, and a non-executing command preview for `linux-bubblewrap`.
- Runtime sandbox side-effect guard: command plans in the mount matrix are previews only; they set `executesCommand = false` and do not create rollback snapshots.
- Application sandbox mount matrix smoke: `npm run smoke:application-sandbox` proves the public application facade can load a temporary `rax.project.json` application, compile its `SandboxSpec`, dispatch `application.inspectSandboxMountMatrix`, prepare sandbox provider readiness without running the command preview, and read `praxis.application.sandboxMountMatrix` over `runtime.sandboxPlane.mountMatrix`. The smoke checks `providerFamily = linux-bubblewrap`, `providerPrepared = true`, `commandPreviewExecutesCommand = false`, `raxcellExpected = true`, `raxcellPolicyOwner = praxis`, `raxcellProviderRole = environment-and-execution`, `policyMiddlewareMounted = true`, and false-ready guards for strong sandbox readiness and non-executing command preview.
- Runtime sandbox shell execution smoke: `npm run smoke:sandbox-shell` proves the public runtime executor path can run `shell.run` through workspace rollback and restore a failed write, then run the linux-bubblewrap branch through an injected Raxcell-like provider with exactly one `prepareRun` and one `run` call.
- Runtime kernel shell tool smoke: `npm run smoke:kernel-shell` proves the public `praxis` facade can define an Agent, run it through `PraxisRuntimeKernel.run`, receive a model-emitted `shell.run` call from an injected provider caller, execute it through the runtime BaseTool executor/sandbox chain, and read back session evidence with `modelCalls = 2`, `providerCalls = 2`, `toolCalls.total = 1`, `shell.sandboxMode = workspace-rollback`, `shell.commandSandboxProviderFamily = workspace-rollback`, `shell.commandSandboxApplied = true`, `providerRoundTrip.toolOutputFedBack = true`, `runtime.sandboxPlane.prepared`, `runtime.baseTool.policy.adjudicated`, and `invokeBaseTool`.
- Application kernel shell smoke: `npm run smoke:application-kernel-shell` proves the public application facade can load a temporary `rax.project.json` application, dispatch `application.start` and `application.submitTurn`, compile the Agent to a manifest, expose `shell.run` to the first provider request as `praxis_tool_shell_run`, receive a model-emitted `shell.run` call, execute it through BaseTool and workspace rollback sandbox, publish an application-visible completed tool event, update the application view to `status = completed`, and confirm the tool output was fed into the second provider request. The smoke checks `providerCalls = 2`, `view.counters.modelCalls = 2`, `view.counters.toolCalls = 1`, `providerToolExposure.exposesExpectedTool = true`, `toolEvent.sandboxMode = workspace-rollback`, `toolEvent.commandSandboxProviderFamily = workspace-rollback`, `toolEvent.commandSandboxApplied = true`, `providerRoundTrip.toolOutputFedBack = true`, and `events` containing `tool:shell.run:completed` plus `final`.
- Application rollback smoke: `npm run smoke:application-rollback` proves the public application facade can execute a model-emitted `shell.run` that writes `state.txt` and exits non-zero, restore the workspace file through workspace rollback, expose the restored rollback diff in the application-visible tool event, and still feed the non-zero command result into the second provider request. The smoke checks `providerToolExposure.exposesExpectedTool = true`, `rollback.exitCode = 2`, `rollback.fileRestored = true`, `toolEvent.workspaceRollbackRequired = true`, `toolEvent.workspaceRollbackRestored = true`, `toolEvent.workspaceRollbackChangedFiles = 1`, `providerRoundTrip.toolOutputFedBack = true`, and `events` containing `tool:shell.run:completed` plus `final`.
- Application rollback plan smoke: `npm run smoke:application-rollback-plan` proves the public application facade can run two live no-tool turns, dispatch `application.inspectRollbackPlan`, and read `praxis.application.rollbackPlan` over `praxis.runtime.planRuntimeRollback`. The smoke checks a dry-run plan from revision `2` to checkpoint `turn.1`, `controller = runtime.managementPlane.rollbackController`, `dispatch = dry-run`, `unsafeSideEffects = false`, `reversible = true`, governance/contract audit flags, and a public-safe rejected result for a missing checkpoint without mutating conversation history or executing filesystem rollback.
- Application management plane smoke: `npm run smoke:application-management-plane` proves the public application facade can dispatch `application.inspectManagementPlane` and read `praxis.application.managementPlane` over `praxis.runtime.createRuntimeManagementPlane` plus access session, operator console, command router, policy gate, resource governor, mutation planner, rollback controller, and governance bridge dry-run results. The smoke checks `route = runtime.managementPlane`, `dryRun = true`, `unsafeSideEffects = false`, `publicSafe = true`, eight ready components, granted `runtime.read/runtime.inspect` scopes, `runtime.managementPlane.ready`, no model turn, and no management command execution.
- Application approval smoke: `npm run smoke:application-approval` proves a standard-policy `shell.run` request can enter `awaiting-approval`, appear in the public application view, resume through `application.approvalDecision`, complete through the same provider/tool round trip, and then dispatch `application.inspectGovernance` to read `praxis.application.governanceReport`. The smoke checks the pending approval feature/risk/scopes, the final decision, provider tool output feedback, completed `shell.run`, one approved runtime approval, one BaseTool policy decision, one interface approval envelope, governance query results, and public-safe redaction. It also dispatches `application.inspectToolCalls` to read `praxis.application.toolCallReport`, proving shell.run invocation, policy profile, dependency preflight, approval status, workspace rollback, and sandbox mode facts are readable without creating a second BaseTool implementation.
- Application SQLite smoke: `npm run smoke:application-sqlite` proves the public application facade can load a temporary `rax.project.json`, run an Agent that declares `session({ persistence: "sqlite" })` plus `storage.raxWorkspace()`, write the runtime session store to the application workspace SQLite file at `.raxode/sessions/praxis.sqlite`, close/reopen that store through the public runtime API, and read back durable runtime records. The smoke checks `view.status = completed`, `view.counters.modelCalls = 1`, `sqliteExists = true`, `sessionStatus = completed`, `storageWorkspaceRef = rax.workspace`, matching read-back/table counts for events, invocations, and mainLoop steps, `runtime.session.created`, `runtime.output.final`, model invocation, prompt-lowering step, and zero public-safe errors. It also feeds the reopened `RuntimeSessionSnapshot` into `praxis.runtime.createRuntimeTimelineReport` and verifies the resulting `praxis.runtime.timeline.report` covers SQLite runtime events, invocations, mainLoop steps, and matching timeline item counts.
- Runtime timeline smoke: `npm run smoke:runtime-timeline` reuses the application SQLite run instead of creating a second execution path, then verifies the reopened SQLite session snapshot can be normalized into a public-safe runtime timeline report with `sourceKind = sqlite`, matching timeline item counts, runtime events, model invocation, and prompt-lowering evidence. It also reuses the foundation rewind smoke and feeds the forked foundation session snapshot into `praxis.runtime.createRuntimeTimelineReport`, checking `sourceKind = foundation-memory`, `checkpointTurnIds = ["turn.1","turn.3"]`, `checkpointCount = 2`, `sessionForkCount = 1`, and `forkedFromTurnId = turn.1`. The same smoke now checks the lightweight runtime timeline read APIs: `createRuntimeTimelineIndex` returns a non-empty item index, `queryRuntimeTimeline` can select checkpoint and turn-linked items, and `createRuntimeTimelineReplayPlan` returns a `read-only-plan` with `execution = none`.
- Application foundation smoke: `npm run smoke:application-foundation` proves the public application facade can mount a `foundationProject`, dispatch a live `application.submitTurn` without a prior `application.start`, then read the shared foundation session snapshot containing a submitTurn-created session fact, `turn.1`, `checkpoint = true`, the user message, the assistant final message, and runtime ledger material stored as foundation `runtime-summary` conversation messages.
- Application foundation lifecycle smoke: `npm run smoke:application-foundation-lifecycle` proves `application.start` creates the mounted foundation session fact, `application.createSession` keeps that matching foundation session aligned, `application.renameSession` writes the session title through `runtime.sessionPlane`, `application.close` closes that session before releasing the mounted project lease, explicit `application.resume` restores the foundation session to `idle` while reading the session title back into the application view, and no-sessionId resume selects the candidate from `runtime.sessionPlane` instead of creating an unrelated application-default foundation session. It also dispatches `application.inspectSessionReport` and reads `praxis.application.sessionReport` over `praxis.runtime.createRuntimeSessionReport`, checking public-safe session status/title, project session count, released lease count, and session-binding consistency without adding an application-local session store.
- Application timeline smoke: `npm run smoke:application-timeline` proves the public application facade can run the same live `shell.run` turn while an upper application observes events through both query and stream surfaces: local `getView().events`, REST `GET /application/view`, SSE `GET /application/events`, and WebSocket `application.event` messages. The smoke checks retained event count equals local view and REST view counters, local and REST event ids are identical and ordered, timeline includes `turn.1.submitted`, `turn.1.manifest.ready`, model progress, completed `shell.run`, and final events, all final/tool events are public-safe, and the SSE stream sees the initial view frame plus submitted/tool/final events. The same smoke dispatches `application.inspectTimeline` and reads `praxis.application.timelineReport`, checking the application command wraps `praxis.runtime.createRuntimeTimelineReport`, index/query, and read-only replay planning over runtime event, invocation, and mainLoop evidence without importing runtime internals. The same smoke also reuses the application provider-health run with timeline artifacts enabled and verifies modelFleet endpoint, retryable failure, fallback, failure-code, and fallbackFrom metadata survives local events, REST view, SSE stream, and WebSocket events with matching model event ids. This is the live application event surface plus command-level runtime timeline read surface; the durable SQLite runtime read view is covered by `smoke:runtime-timeline`.
- Application execution monitor smoke: `npm run smoke:application-execution-monitor` proves retained application model events and cacheDebug can be observed by `ExecutionMonitor` directly. It reuses the application promptPack/cache run, feeds the public-safe application events and final view into an in-memory monitor, and checks one session, two model calls, complete cached-token telemetry coverage, weighted cache hit `160 / 450`, one dynamic-payload-changed call, no previous-response reuse, PromptPack `userTurn` and `recentConversation` segment visibility, and monitor findings for low cache hit plus large dynamic payload. The same smoke also feeds application provider health events into `ExecutionMonitor` and checks modelFleet retry, fallback, failure-code, and retryability diagnostics from application model event metadata. This is the diagnostic bridge before the final durable framework timeline plane.
- Application modelAdapter smoke: `npm run smoke:application-model-adapter` proves the public application facade can compile two temporary Agent projects and dispatch `application.submitTurn` through native `runtime.modelAdapter` actual invocation routes. It checks OpenAI Responses uses `/v1/responses`, OpenAI Chat Completions uses `/v1/chat/completions`, provider-shaped request bodies are preserved, application-visible completed model events carry adapter-specific usage sources, cached-token telemetry is surfaced, and final output is parsed from each provider's native response shape. Model-call inspection for upper applications is exposed by `application.inspectModelCalls`; the command-level report read is directly proven by the application promptPack/cache smoke. This proves upper application routing, not live provider fleet reliability.
- Application auth profile smoke: `npm run smoke:application-auth-profile` proves a temporary public application project can declare `providerProfileRef` and `modelEntryRef` on its Agent model, let `runtimeAuthSelectionForManifest` derive the resolver request, resolve that request through `runtime.authPlane`, use the profile base URL for `/v1/responses`, pass private authorization material only to the provider caller, and keep the application view, application events, and public resolver result free of the raw secret. This is the auth-profile handoff bridge before broader live provider fleet and retry/limit governance.
- Application provider capability smoke: `npm run smoke:application-provider-capability` proves a temporary public application project can declare a primary modelFleet endpoint with `capabilityMatrix.toolCalling = false`, expose provider tools through `application.submitTurn`, skip that endpoint before the first provider call, resolve the tool-capable endpoint's auth profile, complete through the tool-capable provider caller, and expose application model event metadata with `modelFleetCapabilitySelection = true` plus `modelFleetRequiredCapabilities = ["toolCalling"]`. This is declared capability selection through the application facade, not live provider probing.
- Application provider probe smoke: `npm run smoke:application-provider-probe` proves a temporary public application project can declare a primary modelFleet endpoint with `probe.status = "unavailable"` plus a declared fallback, submit one application turn, skip the primary before the first provider call, resolve the fallback endpoint's auth profile, complete through the fallback provider caller, and expose application model event metadata with `modelFleetAdaptiveSelection = true` plus the runtime-required provider tool capabilities. This is manifest-declared probe-state preselection through the application facade, not live provider health probing.
- Application provider fleet smoke: `npm run smoke:application-provider-fleet` proves a temporary public application project can declare primary and fallback modelFleet endpoints with endpoint-level auth refs and `failurePolicy.onUnavailable = "fallback"`, submit one application turn, observe the primary provider failure as a public-safe model event with endpoint/ref/failure/retryability metadata, resolve the fallback endpoint's auth profile, complete through the fallback provider caller with `fallbackFrom` metadata, and keep application view/events free of raw secrets. This is the runtime-managed fallback harness before broader adaptive fleet scoring.
- Application provider health smoke: `npm run smoke:application-provider-health` proves a temporary public application project can declare `modelFleet` endpoints with `maxRetries = 1`, route a retryable `429` provider failure through primary retry then declared fallback, and keep a non-retryable `400` provider failure visible without fallback. The smoke checks provider call order, auth profile selection per attempt, failed/completed application model events, public-safe secret handling, retry attempt/max retry metadata, fallback metadata, provider failure codes, retryability, and final application status. This proves retry/rate-limit gating through the application facade; live proactive provider health probing remains a later gate.
- Kernel modelFleet candidate tests: `PraxisRuntimeKernel.run starts from modelFleet primaryRef even when another endpoint matches manifest.model` proves runtime initial provider selection follows `modelFleet.primaryRef` rather than a loose manifest-model match. `PraxisRuntimeKernel.run selects a tool-capable modelFleet endpoint for tool-calling agents` proves a harness tool turn can skip an endpoint that explicitly declares `capabilityMatrix.toolCalling = false`, choose another endpoint that declares `toolCalling = true`, and retain `runtime.modelFleet.capabilitySelection.planned` evidence. `PraxisRuntimeKernel.run treats exposed runtime decision tools as requiring toolCalling capability` proves required modelFleet capabilities come from the actual provider tool bundle, including runtime decision tools, rather than only declared business tools. `PraxisRuntimeKernel.run preselects an available modelFleet endpoint when the primary probe is unavailable` proves the kernel can read manifest-declared endpoint probe facts, skip a primary endpoint whose `probe.status = "unavailable"`, call the declared fallback first, and retain `runtime.modelFleet.adaptiveSelection.planned` evidence. These are declared capability/health-state selections, not active live provider probing or broad health scoring.
- Application rewind smoke: `npm run smoke:application-rewind` proves the public application facade can run two live no-tool turns, dispatch `application.rewind` to the first turn checkpoint, then submit a third turn whose provider prompt still includes the first turn but no longer includes the removed second turn. The smoke checks `application.rewind.completed`, `targetTurnId = turn.1`, `removedTurnIds = ["turn.2"]`, `historyMessagesBefore = 6`, `historyMessagesAfter = 3`, `providerCalls = 3`, and `view.counters.turns = 3`.

- Application foundation rewind smoke: `npm run smoke:application-foundation-rewind` proves the same rewind path can mount a `foundationProject`, fork the original runtime session facts, copy conversation messages through `turn.1`, keep the original source session at `turn.1,turn.2`, continue the next turn inside the fork as `turn.1,turn.3` without leaking removed second-turn material into the provider prompt, and expose that fork/checkpoint evidence through `praxis.runtime.createRuntimeTimelineReport`. It also dispatches `application.inspectSessionReport` for the forked session and reads `praxis.application.sessionReport` over `praxis.runtime.createRuntimeSessionReport`, proving session, checkpoint, copied conversation, and fork relation facts are readable without adding a product-local session store.
- Application context smoke: `npm run smoke:application-context` proves the public application facade can load a temporary `rax.project.json` application, dispatch `application.start` and `application.submitTurn`, expose `context.load` to the first provider request as `praxis_tool_context_load`, receive a model-emitted `context.load` call, execute it through an application-owned `BaseToolExecutorPort.context.load` adapter, publish an application-visible completed context event, update the application view to `status = completed`, and confirm the returned workspace index material was fed into the second provider request. The smoke checks `providerCalls = 2`, `adapter.calls = 1`, `adapter.kind = workspaceIndex`, `adapter.query = runtime application context`, `view.counters.toolCalls = 1`, `providerToolExposure.exposesExpectedTool = true`, `toolEvent.contextKind = workspaceIndex`, `toolEvent.itemCount = 1`, `toolEvent.familyKey = context`, `providerRoundTrip.toolOutputFedBack = true`, `events` containing `tool:context.load:completed` plus `final`, and `praxis.runtime.createRuntimeOfficialAdapterReport`/index/query coverage for the same evidence.
- Application MCP smoke: `npm run smoke:application-mcp` proves the public application facade can load a temporary `rax.project.json` application, dispatch `application.start`, read `application.inspectMcpMountMatrix` before execution, then dispatch `application.submitTurn`, expose `mcp.resources` to the first provider request as `praxis_tool_mcp_resources`, receive a model-emitted `mcp.resources` call, execute it through an application-owned `BaseToolExecutorPort.mcp.listResources` adapter, publish an application-visible completed MCP resource event, update the application view to `status = completed`, and confirm the returned resource list was fed into the second provider request. The smoke checks `providerCalls = 2`, `adapter.calls = 1`, `adapter.serverId = app-mcp`, `view.counters.toolCalls = 1`, `providerToolExposure.exposesExpectedTool = true`, `mcpMountMatrix.resourceOperationsReady = true`, `mcpMountMatrix.resourceOperations = ["list:mcp.listResources:executor-backed","templates:mcp.listResourceTemplates:executor-backed","read:mcp.readResource:executor-backed"]`, `mcpMountMatrix.promptOperationsReady = true`, `mcpMountMatrix.promptOperations = ["list:mcp.listPrompts:executor-backed","get:mcp.getPrompt:executor-backed"]`, `mcpMountMatrix.completionOperationsReady = true`, `mcpMountMatrix.completionOperations = ["complete:mcp.complete:executor-backed"]`, `mcpMountMatrix.status = degraded` for the broader MCP plane, `toolEvent.resourceCount = 1`, `toolEvent.familyKey = mcp`, `providerRoundTrip.toolOutputFedBack = true`, and `events` containing `tool:mcp.resources:completed` plus `final`.
- Application MCP mount matrix: `test/applicationLayer/applicationMcp.test.ts` dispatches `application.inspectMcpMountMatrix` and reads `praxis.application.mcpMountMatrix` over `inspectMcpRuntimeMountMatrix`, proving application-mounted MCP/MCP+ server profiles, MCP+ skillStore notes, native inventory evidence, executor-backed MCP BaseTool ports, operation-level `resources/list`, `resources/templates/list`, `resources/read`, `prompts/list`, `prompts/get`, and `completion/complete` evidence can be inspected without calling MCP tools or creating a second MCP execution path.
- Application official adapter mount matrix: `test/applicationLayer/applicationMcp.test.ts` dispatches `application.inspectOfficialAdapterMountMatrix` and reads `praxis.application.officialAdapterMountMatrix` over `runtime.officialAdapterPlane.mountMatrix`, proving application-mounted `context.load`, `mcp.resources`, and `skill.load` ports are executor-backed before adapter execution. `npm run smoke:application-official-adapters` now also returns `officialAdapterMountMatrix` in the same smoke that executes all three adapters, with `inspectedBeforeSubmitTurn = true`, so the upper application proof includes both pre-execution mount readiness and execution-after-the-fact report evidence. The runtime plane test also proves missing vs declared-only vs executor-backed false-ready guards, while keeping the surface read-only and separate from the official adapter report.
- Application MCP+ smoke: `npm run smoke:application-mcp-plus` proves the public application facade can load a temporary `rax.project.json`, mount an MCP+ server through `mcpPlusServers`, pass an application-owned `McpPlusProfileStore` through `mcpPlus`, expose `mcp_plus.init` on the first provider call, persist the learned profile, hide `mcp_plus.init` on the next checkpoint, expose the learned pinned dynamic MCP+ tool, execute that tool through an application-owned MCP adapter, and feed both tool outputs back into the provider loop. The smoke checks `providerCalls = 3`, `view.counters.toolCalls = 2`, `profileSaved = true`, `schemaVersion = mcp-plus.profile.v1`, `firstCallExposesInit = true`, `secondCallExposesInit = false`, `secondCallExposesPinnedTool = true`, `calledToolName = browser.open`, `completedToolIds = ["mcp.browser-plus.mcp_plus.init","mcp.browser-plus.browser.open"]`, final event retention, and `praxis.runtime.createRuntimeOfficialAdapterReport` coverage for profile refresh plus dynamic tool exposure.
- Application skill smoke: `npm run smoke:application-skill` proves the public application facade can load a temporary `rax.project.json` application, dispatch `application.start` and `application.submitTurn`, expose `skill.load` to the first provider request as `praxis_tool_skill_load`, receive a model-emitted `skill.load` call, execute it through an application-owned `BaseToolExecutorPort.skill.load` adapter, publish an application-visible completed skill event, update the application view to `status = completed`, and confirm the returned skill material was fed into the second provider request. The smoke checks `providerCalls = 2`, `adapter.calls = 1`, `adapter.requestName = application.skill.runtimeMount`, `view.counters.toolCalls = 1`, `providerToolExposure.exposesExpectedTool = true`, `toolEvent.skillName = application.skill.runtimeMount`, `toolEvent.familyKey = skill`, `providerRoundTrip.toolOutputFedBack = true`, and `events` containing `tool:skill.load:completed` plus `final`.
- Application official adapters smoke: `npm run smoke:application-official-adapters` proves one public application runtime can mount `context.load`, `mcp.resources`, and `skill.load` together, expose all three provider tools in the first provider request, run one `application.submitTurn` through three sequential model-emitted tool calls, execute each call through its application-owned `BaseToolExecutorPort`, publish completed tool events for all three families, and feed each tool result back into the next provider request before the final assistant output. The smoke checks `providerCalls = 4`, `view.counters.toolCalls = 3`, `adapter.callOrder = ["context.load","mcp.resources","skill.load"]`, all three provider tool exposures, all three call ids, all three returned evidence strings, final event retention, `application.inspectOfficialAdapterMountMatrix` returning `status = ready`, `toolIds = ["context.load","mcp.resources","skill.load"]`, `evidenceStatuses = ["executor-backed",...]`, `inspectedBeforeSubmitTurn = true`, and `application.inspectOfficialAdapters` returning the same `praxis.runtime.createRuntimeOfficialAdapterReport` composition/index/query coverage through `praxis.application.officialAdapterReport`. The mount matrix and report remain read surfaces only; timeline retention, MCP+ governance, context retrieval strategy, and skill registry/package governance stay owned by their respective planes.
- Runtime promptPack/cache smoke: `npm run smoke:promptpack-cache` proves existing prompt assembly and model lowering can form a stable cacheable prefix without mixing in dynamic turn material. It checks `stableSystemCore`, `declaredRuntimeContext`, `projectContext`, `toolDeclarations`, and `sessionSummary` as `cacheable-prefix`, keeps `recentConversation`, `userTurn`, and `observations` as `dynamic-no-cache`, emits a stable prefix hash, reuses the provider tool cache hint plan, and verifies current user task material remains dynamic.
- Application promptPack/cache smoke: `npm run smoke:application-promptpack-cache` proves a temporary public application project can declare a `praxis.PromptPack`, run two live `application.submitTurn` calls, read `cacheDebug` from application model events, and compare cache facts across turns. It checks two provider calls, two cacheDebug model events, unchanged stable prefix and instructions hashes, changed dynamic payload and input hashes, stable `prompt_cache_key`, no `previous_response_id` in provider bodies, positive cacheable/dynamic token estimates, and `recentConversation` plus `userTurn` remaining dynamic. It also feeds the model events plus returned runtime snapshot into `praxis.runtime.createRuntimeModelCallReport`, `createRuntimeModelCallIndex`, and `queryRuntimeModelCalls`, proving two completed model calls, usage/cache telemetry coverage, weighted cache hit `160 / 450`, primary endpoint query, stable-prefix comparison, dynamic-payload comparison, and public-safe redaction without creating a second provider adapter. This proves application-facing observability, not final provider economic reuse policy.
- Runtime multiagent smoke: `npm run smoke:multiagent` proves the official multiagent bridge plans runtime-mediated `spawn/message/inbox/wait/stop/kill/list/inspect` access, then drives `agent.spawn`, `agent.inbox`, `agent.message`, `agent.wait`, `agent.list`, and `agent.inspect` through the baseTool registry into the project-local multiagent runtime port. It also checks reply correlation, project-local session listing, public-safe session reads, workspace escape rejection, and feeds those facts into `praxis.runtime.createRuntimeMultiagentReport`, `createRuntimeMultiagentIndex`, and `queryRuntimeMultiagent`.
- Application multiagent smoke: `npm run smoke:application-multiagent` proves an application project can call `application.submitTurn`, expose `agent.spawn` to the provider, invoke the application-owned multiagent adapter, schedule a child background runtime, and feed the `agent.spawn` result back into the parent provider round trip. It then dispatches `application.inspectMultiagent` and reads `praxis.application.multiagentReport` over `praxis.runtime.createRuntimeMultiagentReport`, `createRuntimeMultiagentIndex`, and `queryRuntimeMultiagent`, verifying parent final output, child provider call, spawned-session id, application events, active-agent view, report/index/query coverage, and public-safe readback without importing runtime internals.
- Framework inspection: `toolReadiness.ready = 3`, `missing = []`.
- Runtime surface registry: `runtime.applicationSurface`, `runtime.contractSurface`, `runtime.governancePlane`, `runtime.invocationMethod`, `runtime.execEngine`, `runtime.modelAdapter`, `runtime.interfaceAdapter`, and `runtime.inspection` are ready.
- Runtime surface inspection: `runtime.officialModuleSurface` is explicitly `degraded`, not hidden or pretended ready.
- Composition root: ready surfaces compose with required `runtime.contractSurface`, `runtime.governancePlane`, and `runtime.invocationMethod`, while remaining dry-run and side-effect-free.
- Runtime session store: an application-owned `createInMemorySessionStateEventStore()` can be injected into `runManifest`, then read back with `sessionStatus = completed`, non-empty state/event/mainLoop step records, and no public-safe errors for the dry-run path.
- Runtime core baseline: 1000 in-memory dry-run sessions at concurrency 32 completed with `ok = 1000`, `failed = 0`, `errors = 0`, `events = 28000`, `mainLoopSteps = 17000`, and recorded before/after RSS + heap snapshots. The baseline can now be promoted from measurement to regression gate with `--max-rss-delta-mb` and `--max-heap-used-delta-mb`; when a configured memory budget is exceeded, `memoryBudget.status = exceeded`, `status = failed`, and the command exits non-zero.
- Runtime SQLite baseline: 1000 dry-run sessions at concurrency 16 completed through `createSqliteSessionStateEventStore(...)` with `ok = 1000`, `failed = 0`, `errors = 0`, `events = 28000`, `mainLoopSteps = 17000`, explicit `databasePath = /tmp/praxis-runtime-core-baseline-size.sqlite`, and SQLite `storageBytes` reported after closing the store. The baseline run now uses a unique `runId`, so reusing the same SQLite file can retain historical runs without polluting the current run aggregate.
- Runtime leak-trend gate: the same baseline can now run repeated rounds in one process with `--rounds`. Each round still runs `compileAgent -> AgentManifest -> PraxisRuntimeKernel.runManifest -> session store`; the series result reports per-round results plus whole-series memory delta. `--max-total-rss-delta-mb` and `--max-total-heap-used-delta-mb` fail the whole command when cross-round growth exceeds budget.
- Application core baseline: `npm run baseline:application-core` now proves upper application surfaces can drive the same core path through repeated `createApplicationProjectRuntime -> application.start -> application.submitTurn` workers. The result reports rounds, sessions, provider calls, application event counters, and whole-run memory budget status. It intentionally runs multiple application runtime workers instead of concurrently mutating one `PraxisApplicationRuntime` instance, because the current application runtime is a stateful command surface rather than a shared concurrent session scheduler.
- Runtime core acceptance suite: `npm run acceptance:runtime-core` combines the runtime kernel/store baseline and the application facade baseline into one JSON evidence bundle. The suite does not introduce another execution path; it delegates to the two proven baselines and fails if either section fails or exceeds its configured memory budget.
- Runtime surface acceptance matrix: `npm run acceptance:runtime-surfaces` emits a machine-readable ledger of usable, partial, and future runtime/application surfaces. Each entry records the public entrypoint, owner, dependency surfaces, package scripts, script files, notes, and eight acceptance-contract coverage fields. It intentionally verifies only that the ledger points to real scripts/files; the real behavior still belongs to the linked smoke/baseline commands.

## High-Concurrency Development Program

Use waves, not one uncontrolled swarm. With the current session limit, run 3-4 active subagents per wave here; the user can open more Codex threads for the larger fan-out. The controller keeps the merge order and evidence ledger.

### Wave 0: Baseline And Fact Audit

Goal: freeze live facts before edits.

Subagents:

- `W0-01 runtime-kernel-map`: map `runManifest` lifecycle, store, sandbox, model, tool, events.
- `W0-02 manifest-oao-map`: map OAO authoring to AgentManifest fields.
- `W0-03 basetool-port-map`: map semantic tools to executor ports and readiness.
- `W0-04 application-map`: map fullstack/application layer to runtime kernel.
- `W0-05 storage-session-map`: map project/session/conversation/store/checkpoint.
- `W0-06 perf-baseline`: run dry-run memory/perf smoke and record heap/RSS.

Exit gate: every report includes file/line references, no edits, and at least one command or code path that proves the claim.

### Wave 1: Contract Surfaces

Goal: make the central runtime semantics inspectable.

Subagents:

- `W1-01 surface-registry-review`: verify registry dry-run contract and missing public docs.
- `W1-02 composition-root-review`: verify required surfaces, gates, and missing runtime tie-ins.
- `W1-03 inspection-report-review`: verify framework inspection can consume actual readiness.
- `W1-04 event-contract-review`: verify runtime event contract names and gaps.
- `W1-05 checkpoint-contract-review`: verify session state and rollback evidence.
- `W1-06 policy-approval-review`: verify BaseTool/sandbox approval routing.

Exit gate: each contract surface has status `usable`, `partial`, or `future`, plus the exact reason.

### Wave 2: Runtime Mount Proofs

Goal: convert declarations into real mount smoke tests without changing component semantics.

Subagents:

- `W2-01 basetool-file-smoke`: prove `file.read` and `file.search` through registry -> executor.
- `W2-02 basetool-skill-smoke`: prove `skill.load` through application-owned adapter.
- `W2-03 shell-sandbox-smoke`: prove `shell.run` policy path under host-observed workspace rollback and injected Raxcell provider.
- `W2-04 mcp-mount-smoke`: prove MCP server profile enters executor and lists tools/resources.
- `W2-05 model-dryrun-smoke`: prove dry-run and provider injection are separate paths.
- `W2-06 storage-sqlite-smoke`: prove session/event/invocation persistence.
- `W2-07 promptpack-cache-smoke`: prove stable prefix plan and dynamic turn split.
- `W2-08 compact-smoke`: prove compaction executor and pre-compact governance path.

Exit gate: every smoke has a runnable command, expected output shape, and failure mode.

### Wave 3: Application And Framework Surfaces

Goal: make application developers use Praxis through one coherent facade.

Subagents:

- `W3-01 public-api-review`: verify no deep runtime imports are required for examples.
- `W3-02 fullstack-example-review`: verify fullstack output shows manifest, readiness, mount smoke, runtime result.
- `W3-03 minimal-example-review`: verify minimal example remains small and teachable.
- `W3-04 application-backend-review`: verify transport/session/approval surfaces do not duplicate runtime logic.
- `W3-05 harness-authoring-review`: verify OAO authoring helpers cover current manifest fields.
- `W3-06 docs-developer-path`: write developer path from Agent file to runtime session.

Exit gate: a new user can compile, inspect, mount BaseTools, and dry-run without importing runtime internals.

### Wave 4: Official Module Bridges

Goal: prove official modules mount through governance, not private shortcuts.

Subagents:

- `W4-01 memory-bridge-smoke`
- `W4-02 skill-bridge-smoke`
- `W4-03 mcp-plus-overlay-smoke`
- `W4-04 multiagent-tool-smoke`: run `npm run smoke:multiagent` and `npm run smoke:application-multiagent`; verify the official bridge plus `agent.*` baseTools share the same project-local runtime port, that application.submitTurn can schedule a child background runtime through that port, and that application.inspectMultiagent returns the public-safe report/index/query wrapper. Do not claim durable event/checkpoint orchestration is complete from these smokes alone.
- `W4-05 context-material-bridge-smoke`
- `W4-06 artifact-bridge-smoke`

Exit gate: each bridge has a manifest declaration, runtime mount input, event output, and negative test.

### Wave 5: Performance And Retention

Goal: keep the core stable enough for 1k to 10k agent targets.

Subagents:

- `W5-01 dryrun-1k-sequential`
- `W5-02 dryrun-1k-concurrent`
- `W5-03 retained-session-size`
- `W5-04 event-retention-policy`
- `W5-05 tool-output-truncation`
- `W5-06 promptpack-material-retention`
- `W5-07 sqlite-write-pattern`
- `W5-08 mcp-skill-cache-pressure`

Exit gate: each test reports heap, RSS, retained object counts, and the likely owner of growth.

### Wave 6: Release Harness

Goal: make the framework shippable.

Subagents:

- `W6-01 package-export-audit`
- `W6-02 npm-pack-audit`
- `W6-03 example-matrix`
- `W6-04 devdoctor-surface`
- `W6-05 docs-index`
- `W6-06 migration-notes`

Exit gate: `npm run build`, targeted tests, examples, `npm pack --dry-run --json`, and `git diff --check` are recorded.

## Per-Subagent Task Card

Every subagent receives this shape:

```text
Current unique target:
- repo: /home/proview/Desktop/Praxis_series/development/Praxis
- surface: <runtime surface name>
- task type: audit | implementation | spec-review | quality-review | realworld-smoke

Scope:
- files to read:
- files allowed to edit:
- files forbidden to edit:

Required facts:
- manifest declaration:
- runtime mount:
- policy gate:
- event/checkpoint path:
- inspection path:
- real smoke command:

Acceptance:
- code compiles:
- test added or updated:
- command run:
- expected output:
- residual risk:

Report format:
- status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- changed files:
- verification:
- findings:
```

## Review Ladder

Each implementation task goes through four checks:

1. **Spec compliance review**：只问是否满足 task card，不评价品味。
2. **Code quality review**：检查边界、重复、类型、错误处理、可维护性。
3. **Realworld effect check**：运行 example/smoke，确认用户路径能走通。
4. **Controller merge gate**：主控只合入单一意图，记录剩余风险。

## Merge Gates

Before any runtime/framework claim:

- `npm run typecheck`
- targeted `node --import tsx --test ...`
- relevant `npm run example:*`
- for package/docs/example structure changes: `npm run build`, `npm run pack:dry-run`, `git diff --check`

Before declaring a surface accepted:

- At least one positive smoke.
- At least one negative or degraded readiness case.
- Inspection output matches real mount state.
- No product-specific logic is added to Praxis core.
- No weak component semantics are rewritten just to pass the harness.

## Controller Rule

The controller owns direction and integration. Subagents own evidence. If a module is incomplete, mark it `partial` and add an application/runtime adapter or inspection gate around it. Do not hide incompleteness by changing the component's meaning.
