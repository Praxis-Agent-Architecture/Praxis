# Runtime Application Official Adapter Mount Matrix

2026-06-09: `application.inspectOfficialAdapterMountMatrix` is the application-facing read command for official adapter mount readiness. It returns `praxis.application.officialAdapterMountMatrix` as command `output`, wrapping `inspectRuntimeOfficialAdapterMountMatrix` and the `runtime.officialAdapterPlane.mountMatrix` surface.

Boundary:

- The command is read-only; it must not call `context.load`, MCP, or `skill.load` adapters.
- It is a pre-execution mount/readiness matrix, not a replacement for `application.inspectOfficialAdapters` or `praxis.runtime.createRuntimeOfficialAdapterReport`.
- The report surface reads execution-after-the-fact provider exposure, completed tool events, composition order, MCP+ profile refresh, and provider round-trip evidence.
- The mount matrix reads only BaseTool runtime readiness plus executor-port evidence for `context.load`, `mcp.resources`, and `skill.load`.
- Evidence status must distinguish `missing`, `declared-only`, and `executor-backed`. Declared strings alone should keep the matrix degraded.
- Application-level `mcpServers`, `mcpPlusServers`, and `mcpModule` are merged into the manifest before inspection so MCP readiness sees the same application harness declaration.
- Application-owned `contextArtifactAdapters` and `baseToolAdapters` are mounted through `createRuntimeBaseToolExecutorPort`, and implemented ports come from `listRuntimeBaseToolImplementedPortPaths`.
- Runtime guardrails must stay explicit: no adapter execution, no context retrieval strategy ownership, no skill registry governance ownership, and no MCP policy governance ownership.
- `test/agentCore/agent_runtimeImplementation/runtime.officialAdapterPlane/officialAdapterReport.test.ts` is the direct runtime proof for executor-backed, missing, and declared-only cases.
- `test/applicationLayer/applicationMcp.test.ts` is the direct application command-level proof because it dispatches `application.inspectOfficialAdapterMountMatrix`, then validates the application wrapper, runtime surface id, context/MCP/skill adapters, executor-backed evidence, ready status, and public-safe output.
- `npm run smoke:application-official-adapters` is the direct upper-application proof for composition: it reads `officialAdapterMountMatrix` from `application.inspectOfficialAdapterMountMatrix` before `application.submitTurn`, then executes `context.load`, `mcp.resources`, and `skill.load` through one `application.submitTurn`, then returns `officialAdapterReport` from `application.inspectOfficialAdapters`.
