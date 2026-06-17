# Examples Scripts

Current packaged smoke scripts in this folder:

- `agentcore_smoke.ts`: core runtime construction smoke.
- `runtime_core_baseline.ts`: dry-run runtime/session baseline that reports
  session counts, retained state/event/mainLoop records, timing, and memory
  snapshots, with optional memory budget checks that fail the run when a
  configured RSS/heap delta limit is exceeded.
- `runtime_sandbox_shell_smoke.ts`: public runtime facade smoke for
  `shell.run -> sandbox command runner`, covering workspace rollback restore and
  an injected linux-bubblewrap/Raxcell-like provider path.
- `runtime_kernel_shell_tool_smoke.ts`: public `praxis` facade smoke for
  `PraxisRuntimeKernel.run -> model tool call -> shell.run -> sandbox ->
  session evidence`, using an injected provider caller and runtime-owned
  executor/store.
- `runtime_application_kernel_shell_smoke.ts`: public application facade smoke
  for `application.submitTurn -> model tool call -> shell.run -> sandbox ->
  application events/view`, using a temporary `rax.project.json` application
  and injected provider caller.
- `runtime_application_sandbox_smoke.ts`: public application facade smoke for
  `application.inspectSandboxMountMatrix -> praxis.application.sandboxMountMatrix`,
  proving upper applications can inspect SandboxSpec/provider/Raxcell readiness
  before command execution without importing runtime internals.
- `runtime_application_rollback_smoke.ts`: public application facade smoke for
  `application.submitTurn -> shell.run -> workspace rollback`, proving a failed
  workspace write is restored and the rollback evidence is visible in
  application events.
- `runtime_application_management_plane_smoke.ts`: public application facade
  smoke for `application.inspectManagementPlane ->
  praxis.application.managementPlane`, proving upper applications can inspect
  the mounted runtime control bundle, including access session, operator
  console, command router, policy gate, resource governor, mutation planner,
  rollback controller, and governance bridge, without submitting model turns or
  executing management commands.
- `runtime_application_approval_smoke.ts`: public application facade smoke for
  `application.submitTurn -> runtime approval request ->
  application.approvalDecision -> continued tool execution`, proving approval
  requests can be surfaced in the application view, decided through the
  application command surface, and inspected afterward through
  `application.inspectGovernance -> praxis.application.governanceReport` and
  `application.inspectToolCalls -> praxis.application.toolCallReport`.
- `runtime_application_timeline_smoke.ts`: public application facade smoke for
  `application.submitTurn -> application view/events retention + REST view +
  SSE event stream + WebSocket event messages`, proving upper application surfaces can query retained
  runtime events, subscribe to live events, and preserve modelFleet retry/
  fallback metadata across local view, REST view, SSE stream, and WebSocket
  messages. It also dispatches `application.inspectTimeline` and reads
  `praxis.application.timelineReport`, proving upper applications can inspect
  runtime event/invocation/mainLoop timeline facts and read-only replay policy
  without importing runtime internals.
- `runtime_application_execution_monitor_smoke.ts`: public application facade
  smoke that feeds retained application model events and cacheDebug into
  `ExecutionMonitor`, then feeds application provider-health modelFleet events
  into the same monitor surface, proving application diagnostics can consume
  runtime cache, retry, fallback, failure-code, and retryability facts without
  creating a product-local monitor path.
- `runtime_application_model_adapter_smoke.ts`: public application facade smoke
  for `application.submitTurn -> runtime.modelAdapter -> actualInvocationLayer`,
  proving OpenAI Responses and OpenAI Chat Completions routes can both be
  triggered through the upper application runtime with injected provider
  callers, provider-shaped bodies, usage, and final output. Upper applications
  read model-call inspection through `application.inspectModelCalls`; the
  command-level `praxis.application.modelCallReport` read is directly proven by
  the promptPack/cache application smoke.
- `runtime_application_auth_profile_smoke.ts`: public application facade smoke
  for `AgentManifest providerProfileRef/modelEntryRef -> runtime.authPlane ->
  runtime.modelAdapter`, proving manifest-declared auth profile refs can select
  a resolver profile, pass private auth material only to the provider caller,
  and keep application view/events public-safe.
- `runtime_application_provider_capability_smoke.ts`: public application facade
  smoke for `AgentManifest modelFleet capabilityMatrix.toolCalling ->
  runtime.modelAdapter`, proving `application.submitTurn` can expose provider
  tools, skip a primary endpoint that explicitly declares `toolCalling = false`,
  complete through a tool-capable endpoint before the first provider call, and
  expose the selection reason in application model event metadata.
- `runtime_application_provider_probe_smoke.ts`: public application facade smoke
  for `AgentManifest modelFleet probe.status -> runtime.modelAdapter`, proving
  `application.submitTurn` can skip a primary endpoint whose declared probe is
  unavailable and complete through the declared available fallback before the
  first provider call while exposing the adaptive selection reason in
  application model event metadata.
- `runtime_application_provider_fleet_smoke.ts`: public application facade smoke
  for `AgentManifest modelFleet failurePolicy -> runtime.modelAdapter`, proving
  the runtime can record a primary provider failure, select the declared fallback
  endpoint, resolve that endpoint's auth profile, and finish the same
  application turn through the fallback caller while exposing endpoint,
  fallback, failure-code, and retryability metadata in application model events.
- `runtime_application_provider_health_smoke.ts`: public application facade
  smoke for `AgentManifest modelFleet maxRetries + retryable provider errors ->
  runtime.modelAdapter`, proving rate-limit/unavailable provider errors consume
  the declared retry budget before fallback, while non-retryable provider errors
  stay visible and are not hidden by fallback; retry/fallback/failure metadata
  remains visible to application event consumers.
  Kernel-level modelFleet primaryRef, declared probe, and declared capability
  candidate selection tests live in
  `test/agentCore/agent_runtimeImplementation/praxisRuntimeKernel.test.ts`.
- `runtime_application_rewind_smoke.ts`: public application facade smoke for
  `application.submitTurn x2 -> application.rewind -> application.submitTurn`,
  proving an in-memory application checkpoint can restore session conversation
  context before the next provider call.
- `runtime_application_context_smoke.ts`: public application facade smoke for
  `application.submitTurn -> model tool call -> context.load ->
  application-owned context adapter -> provider round trip`, proving contextual
  workspace material can enter the same runtime/application tool path. The same
  smoke feeds the evidence into `praxis.runtime.createRuntimeOfficialAdapterReport`.
- `runtime_application_mcp_smoke.ts`: public application facade smoke for
  `application.submitTurn -> model tool call -> mcp.resources ->
  application-owned MCP adapter -> provider round trip`, proving a mounted MCP
  resource surface can enter the same runtime/application tool path. The
  command-level mount inspection is covered by
  `application.inspectMcpMountMatrix -> praxis.application.mcpMountMatrix`,
  which wraps `inspectMcpRuntimeMountMatrix` as a read-only readiness view and
  reports `resourceOperations` for `resources/list`,
  `resources/templates/list`, and `resources/read` plus `promptOperations` for
  `prompts/list` and `prompts/get`, and `completionOperations` for
  `completion/complete` before the turn executes.
- `runtime_application_mcp_plus_smoke.ts`: public application facade smoke for
  `application.submitTurn -> MCP+ init -> profileStore refresh -> dynamic MCP+
  tool`, proving MCP+ overlay updates can be driven through the application
  runtime and an application-owned MCP adapter. The same smoke feeds profile
  refresh and dynamic-tool evidence into `praxis.runtime.createRuntimeOfficialAdapterReport`.
- `runtime_application_multiagent_smoke.ts`: public application facade smoke for
  `application.submitTurn -> model tool call -> agent.spawn -> project-local
  multiagent runtime -> child background runtime reply`, proving upper
  applications can drive the same multiagent port rather than duplicating
  orchestration logic. The same smoke feeds application events and provider
  round-trip facts into `praxis.runtime.createRuntimeMultiagentReport`,
  `createRuntimeMultiagentIndex`, and `queryRuntimeMultiagent`.
- `runtime_application_skill_smoke.ts`: public application facade smoke for
  `application.submitTurn -> model tool call -> skill.load ->
  application-owned skill adapter -> provider round trip`, proving skill
  material can enter the same runtime/application tool path. The same smoke
  feeds the evidence into `praxis.runtime.createRuntimeOfficialAdapterReport`.
- `runtime_application_official_adapters_smoke.ts`: public application facade
  smoke for one `application.submitTurn` that mounts context, MCP, and skill
  adapters together, proving the upper application can compose official adapter
  ports through one runtime harness instead of driving three unrelated paths.
  The same smoke feeds composition order, provider exposure, completed tool
  events, and provider round-trip facts through `application.inspectOfficialAdapters`
  into `praxis.application.officialAdapterReport` over
  `praxis.runtime.createRuntimeOfficialAdapterReport`,
  `createRuntimeOfficialAdapterIndex`, and `queryRuntimeOfficialAdapters`.
  Command-level pre-execution mount readiness is covered by
  `application.inspectOfficialAdapterMountMatrix ->
  praxis.application.officialAdapterMountMatrix`, which wraps
  `runtime.officialAdapterPlane.mountMatrix` and distinguishes missing,
  declared-only, and executor-backed context/MCP/skill ports without calling
  the adapters. The smoke output now includes both `officialAdapterMountMatrix`
  and `officialAdapterReport`, with `inspectedBeforeSubmitTurn = true`, so one
  command proves pre-execution readiness and execution-after-the-fact evidence.
- `runtime_application_promptpack_cache_smoke.ts`: public application facade
  smoke for two `application.submitTurn` calls that read model cacheDebug from
  application events, proving the stable PromptPack prefix stays fixed while
  dynamic provider input changes across turns. The same smoke dispatches
  `application.inspectModelCalls` and reads `praxis.application.modelCallReport`,
  proving model-call usage, cache telemetry, endpoint, and public-safe
  inspection facts without importing runtime internals.
- `runtime_application_sqlite_smoke.ts`: public application facade smoke for
  `application.submitTurn -> sqlite session storage -> reopened runtime store`,
  proving an application-declared durable session writes runtime events, states,
  invocations, and mainLoop steps to the application workspace SQLite file, and
  that the reopened snapshot can feed `praxis.runtime.createRuntimeTimelineReport`.
- `runtime_application_foundation_lifecycle_smoke.ts`: public application
  facade smoke for `application.start/createSession/renameSession/close/resume`
  over a mounted `foundationProject`, proving ordinary session title/status,
  project session counts, and released lease facts are readable through
  `application.inspectSessionReport -> praxis.application.sessionReport` over
  `praxis.runtime.createRuntimeSessionReport`.
- `runtime_timeline_smoke.ts`: runtime durable timeline smoke that reuses the
  application SQLite run, reopens the runtime store, and verifies the resulting
  `praxis.runtime.timeline.report` covers runtime events, model invocations,
  mainLoop steps, and matching timeline item counts. It also reuses the
  foundation rewind smoke and verifies the same report surface can read
  foundation checkpoint turn ids and session-fork facts, build a lightweight
  public-safe index, query checkpoint/turn/ref-linked items, and produce a
  read-only replay plan that does not execute rollback or replay.
- `runtime_application_foundation_rewind_smoke.ts`: public application facade
  smoke for `foundationProject + application.rewind`, proving the source
  session keeps later turns while the forked session continues from the selected
  checkpoint, and that the forked foundation snapshot can feed both
  `praxis.runtime.createRuntimeTimelineReport` and
  `application.inspectSessionReport -> praxis.application.sessionReport` over
  `praxis.runtime.createRuntimeSessionReport` without creating a product-local
  session store.
- `runtime_application_foundation_smoke.ts`: public application facade smoke for
  `foundationProject + application.submitTurn -> runtime.conversationPlane`,
  proving application turns write foundation turn checkpoints and semantic
  conversation messages through the shared project/session/conversation plane.
- `runtime_application_core_baseline_smoke.ts`: public application facade
  baseline for repeated `createApplicationProjectRuntime ->
  application.start -> application.submitTurn` workers, reporting application
  session counts, provider calls, event counters, and whole-run memory budget
  status.
- `runtime_core_acceptance_suite.ts`: combined core-machine acceptance suite
  that runs both `runtime_core_baseline.ts` and
  `runtime_application_core_baseline_smoke.ts`, then returns one JSON result
  with runtime/application section status and summary counts.
- `runtime_promptpack_cache_smoke.ts`: runtime promptPack/cache smoke that
  assembles PromptPack materials, lowers provider tools/cache hints, and proves
  stable prefix segments stay separate from dynamic user turn and observation
  material.
- `runtime_multiagent_smoke.ts`: runtime multiagent smoke that proves the
  official module bridge is runtime-mediated and the `agent.*` baseTools invoke
  the project-local multiagent runtime port for spawn/message/inbox/list/
  inspect/wait. It also feeds bridge, BaseTool, mesh, reply-correlation, and
  guardrail facts into the public-safe `praxis.runtime.multiagent.report`,
  index, and query read surface.
- `runtime_surface_acceptance_matrix.ts`: machine-readable runtime surface
  ledger that maps each usable/partial/future surface to its public entry,
  package script, smoke file, ownership boundary, and eight acceptance-contract
  coverage fields.
- `modelAdapter_smoke.ts`: model adapter lowering smoke.
- `mcp-plus-native-smoke.ts`: live MCP vs MCP+ native comparison across a
  representative multi-server MCP set, with devdoctor cache diagnostics.

The other scripts in this directory are archived migration references from the
old fine-grained tool layer. They still mention historical ids such as
`code.read`, `shell.commandExecution`, and `git.getRepositoryStatus`; do not use
them as evidence for the current semantic basetool contract.

Current examples should enter through `examples/minimal`, `examples/fullstack`,
`npm run smoke:agentCore`, `npm run smoke:modelAdapter`, or
`npm run smoke:mcp-plus-native`. For sandbox execution-chain checks, use
`npm run smoke:sandbox-shell`; for the application-facing sandbox mount matrix,
use `npm run smoke:application-sandbox`; for the full kernel main-loop tool
path, use `npm run smoke:kernel-shell`; for the same path through the
application layer, use `npm run smoke:application-kernel-shell`; for application model adapter
route and auth-profile handoff, use `npm run smoke:application-model-adapter`
and `npm run smoke:application-auth-profile`; for application provider capability
selection, use `npm run smoke:application-provider-capability`; for application
provider declared probe preselection, use `npm run smoke:application-provider-probe`;
for application provider fleet fallback, use `npm run smoke:application-provider-fleet`; for provider retry
budget and non-retryable error gating, use `npm run smoke:application-provider-health`; for application
rollback evidence, use `npm run smoke:application-rollback`; for governed application rollback
dry-run planning, use `npm run smoke:application-rollback-plan`; for the
application-facing runtime management/control bundle, use
`npm run smoke:application-management-plane`; for application event/timeline
retention and modelFleet metadata parity across local/REST/SSE/WebSocket event
surfaces, use `npm run smoke:application-timeline`; for application event
diagnostics over retained cacheDebug and modelFleet retry/fallback facts, use
`npm run smoke:application-execution-monitor`;
for application conversation checkpoint restore, use `npm run smoke:application-rewind`. For
foundation-backed fork-as-rewind evidence, use
`npm run smoke:application-foundation-rewind`. For
application-mounted MCP and skill adapter checks, use `npm run smoke:application-context`,
`npm run smoke:application-mcp`, and `npm run smoke:application-skill`. For
application MCP mount readiness, use `test/applicationLayer/applicationMcp.test.ts`
and its `application.inspectMcpMountMatrix` dispatch. For application-facing
MCP+ overlay refresh, use `npm run smoke:application-mcp-plus`.
To prove these official adapter ports compose in one runtime harness, use
`npm run smoke:application-official-adapters`; that smoke also calls
`application.inspectOfficialAdapterMountMatrix` and
`application.inspectOfficialAdapters`, proving the same context/MCP/skill
surface has executor-backed pre-execution readiness plus public-safe
execution-after-the-fact report evidence. For lower-level command-only mount
readiness, use `test/applicationLayer/applicationMcp.test.ts` and its
`application.inspectOfficialAdapterMountMatrix` dispatch. For broader
single-adapter and MCP+ coverage, use the context/MCP/skill/MCP+ smokes. For the
application facade multiagent path, use `npm run smoke:application-multiagent`.
For application durable session persistence, use `npm run smoke:application-sqlite`.
For the durable runtime timeline read view over SQLite evidence plus
foundation checkpoint/fork evidence, lightweight query/index evidence, and
read-only replay planning, use `npm run smoke:runtime-timeline`.
For the shared project/session/conversation foundation, use
`npm run smoke:application-foundation` to prove direct submitTurn lazy session
creation and conversation persistence; for foundation lifecycle start/create/
close/release and explicit/no-sessionId resume evidence, use
`npm run smoke:application-foundation-lifecycle`, which also reads the same
foundation snapshot through `application.inspectSessionReport`.
For promptPack/cache split evidence, use `npm run smoke:promptpack-cache`; to
verify the same cache facts through the public application facade and the
`praxis.runtime.createRuntimeModelCallReport` read surface, use
`npm run smoke:application-promptpack-cache`. For project-local multiagent
runtime-port evidence and the public-safe `praxis.runtime.multiagent.report`
over runtime smoke facts, use `npm run smoke:multiagent`; for the application
facade path and the same multiagent report over application events, use
`npm run smoke:application-multiagent`.

For runtime stability work, start with `npm run baseline:runtime-core --
--sessions 100 --concurrency 8` and record the JSON output before changing
runtime/session retention behavior. Add `--store sqlite --sqlite-path
/tmp/praxis-runtime-core-baseline.sqlite` when the baseline must prove durable
session/event persistence rather than in-memory retention. Each run gets a
unique `runId` by default; pass `--run-id <id>` when comparing multiple runs in
the same SQLite file. To turn the baseline into a memory regression gate, pass
limits such as `--max-rss-delta-mb 512 --max-heap-used-delta-mb 256`; the JSON
result includes `memoryBudget`, and the command exits non-zero when any
configured limit is exceeded. Use `--rounds 5` for leak-trend checks in one
process; per-round limits still use `--max-*`, while whole-series growth limits
use `--max-total-rss-delta-mb` and `--max-total-heap-used-delta-mb`.

Use `npm run baseline:application-core -- --rounds 2 --sessions 20
--concurrency 4` when the question is whether upper applications can drive the
same core path through the public application facade. This baseline runs
multiple application runtime workers rather than sharing one mutable
application runtime instance; that keeps the check aligned with the current
application state-machine contract while still exercising the framework entry
used by real products.

Use `npm run acceptance:runtime-core -- --rounds 2 --sessions 20
--concurrency 4` when you want one command that proves both the runtime kernel
baseline and the application facade baseline. Shared flags apply to both
sections; use `--runtime-sessions`, `--application-sessions`, and matching
`--*-concurrency` flags when the two sections need different sizes.

Use `npm run acceptance:runtime-surfaces` before assigning broad runtime work to
subagents. It does not replace real smokes; it verifies that the current
surface ledger still points to existing package scripts and packaged script
files, and marks each surface as `usable`, `partial`, or `future` against the
eight acceptance questions in `docs/runtime/runtimeSurfaceAcceptance.md`.
