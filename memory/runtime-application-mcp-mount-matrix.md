# Runtime Application MCP Mount Matrix

2026-06-09: `application.inspectMcpMountMatrix` is the application-facing read command for MCP mount readiness. It returns `praxis.application.mcpMountMatrix` as command `output`, wrapping `inspectMcpRuntimeMountMatrix` and the `runtime.mcpPlane.mountMatrix` surface.

Boundary:

- The command is read-only; it must not call MCP tools, refresh MCP+ profiles, or replace `runtime.mcpPlane`.
- Application-level `mcpServers`, `mcpPlusServers`, and `mcpModule` are merged into the manifest before inspection so the matrix sees the same runtime declaration surface as the application harness.
- Runtime profiles come from the merged manifest through `buildMcpServerProfilesFromManifest`, and BaseTool port evidence comes from the runtime `BaseToolExecutorPort` factory plus application-owned adapters.
- Native MCP tool inventories are caller-supplied evidence. Missing inventory should keep the matrix degraded instead of pretending readiness.
- `mcp.resources` readiness is no longer collapsed to the list operation. The matrix exposes `resourceOperations` for `resources/list -> mcp.listResources`, `resources/templates/list -> mcp.listResourceTemplates`, and `resources/read -> mcp.readResource`, with separate decision, evidenceStatus, and missing-port counts.
- `mcp.prompts` readiness is no longer collapsed to the list operation either. The matrix exposes `promptOperations` for `prompts/list -> mcp.listPrompts` and `prompts/get -> mcp.getPrompt`, with separate decision, evidenceStatus, and missing-port counts.
- `mcp.completions` now has an explicit `completionOperations` entry for `completion/complete -> mcp.complete`, with the same decision, evidenceStatus, and missing-port shape. This is still mount/readiness evidence, not proof that a smoke executed completion.
- `test/agentCore/agent_runtimeImplementation/runtime.mcpPlane/mcpPlane.test.ts` also pins the negative case: when `mcp.complete` is not executor-backed or declared in `implementedPortPaths`, the completion operation must report `decision = blocked`, `evidenceStatus = missing`, `missingPortPaths = ["mcp.complete"]`, and `completionOperationMissingPorts = 1`.
- A resource-only application smoke may show `mcpMountMatrix.status = degraded` while `resourceOperationsReady = true`; that is intentional because the full MCP plane also includes `mcp.use`, prompts, completions, skill, profiles, and native inventory evidence.
- The same resource-only smoke can still report `promptOperationsReady = true` and `completionOperationsReady = true`; this is mount/readiness evidence only, not proof that the smoke executed `mcp.prompts` or `mcp.completions`.
- MCP+ `skillStore` and project id are passed through only for read evidence such as skill note counts. Profile refresh, overlay policy, and dynamic tool execution stay owned by the MCP/MCP+ runtime path.
- `test/applicationLayer/applicationMcp.test.ts` is the direct command-level proof because it dispatches `application.inspectMcpMountMatrix`, then validates the application wrapper, runtime surface id, application-mounted MCP+ server, skillStore note count, native inventory evidence, executor-backed ports, resource operation evidence, prompt operation evidence, completion operation evidence, ready status, and public-safe output.
- `npm run smoke:application-mcp` is the direct upper-application proof for the resource path: it reads `mcpMountMatrix` before `application.submitTurn`, confirms resource, prompt, and completion operations are executor-backed, then executes `mcp.resources` through the application-owned adapter and checks provider round-trip evidence.
