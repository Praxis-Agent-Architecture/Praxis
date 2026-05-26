# Praxis Basetool Profile And Application Contract

This document records the new Praxis basetool direction.

Praxis now exposes a compact semantic tool surface for agents. Product-scale tools, optional plugins, GUI flows, and Raxode-specific behavior stay above Praxis and enter through application/runtime ports.

## Profiles

| Profile | Purpose | Default policy | Notes |
| --- | --- | --- | --- |
| `codingCore` | Code reading, searching, patching, shell diagnostics, web grounding, skills, and context. | `permissive` | Default for examples and ordinary coding agents. |
| `researchCore` | Web and local evidence gathering with minimal write capability. | `permissive` | Keeps write/shell actions deferred. |
| `workCore` | Documents, reports, spreadsheets, PDFs, data work, and helper scripts. | `permissive` | Uses coding-shaped primitives until application plugins register richer office/artifact tools. |
| `runtimeCore` | Runtime inspection, process handles, tool discovery, and diagnostics. | `permissive` | Intended for framework/runtime operators. |
| `agentCore` | Complete Praxis-designed agent core with project-local mesh tools. | `permissive` | For developers who want the standard Praxis core without product full mode. |
| `fullCore` | Application-owned full-open mode. | `permissive` | Raxode can use this after registering product plugins and application-specific ports. |

## Tool Facts

The compact semantic catalog currently contains 24 tools:

- `shell.run`
- `file.read`
- `file.search`
- `patch.apply`
- `web.search`
- `web.fetch`
- `plan.update`
- `user.ask`
- `skill.load`
- `context.load`
- `mcp.use`
- `mcp.resources`
- `process.wait`
- `process.kill`
- `tool.discover`
- `tool.describe`
- `agent.spawn`
- `agent.message`
- `agent.inbox`
- `agent.list`
- `agent.inspect`
- `agent.wait`
- `agent.stop`
- `agent.kill`

`src/basetool/profiles.ts` owns profile membership and profile-aware descriptions.
`src/basetool/catalog.ts` owns schemas and base definitions.
`src/basetool/factMatrix.ts` publishes the combined facts for policy, sandbox, readiness, profile exposure, and verification.
`src/basetool/registry.ts` mounts handlers from the same semantic definitions.

Plain-language rule: there should be one semantic tool truth, with different projections for model schema, registry dispatch, runtime policy, and application views.

## Public Authoring API

Use:

```ts
praxis.basetool.core.fileRead({ profileName: "codingCore" })
praxis.basetool.profile("codingCore")
praxis.basetool.byId("file.read")
```

Do not use the old `praxis.baseTools.code.*`, `praxis.baseTools.shell.*`, or `praxis.baseTools.search.*` helper families. Those names represented the previous 176-tool layer and are not part of the new public API.

## Application Thin Contract

The application layer may inject:

- `toolProfile`: one of the six basetool profiles.
- `permissionProfile`: one of `bapr`, `yolo`, `permissive`, `standard`, `restricted`.
- `approvalResolver`: human approval surface.
- `agentReviewResolver`: side-agent review surface.
- `contextArtifactAdapters`: `BaseToolExecutorPort.context` and `BaseToolExecutorPort.artifact` adapters.
- `baseToolAdapters`: other runtime-owned executor ports.
- `onApplicationToolEvent`: event observer for GUI, TUI, logs, or backend telemetry.

This is intentionally thin. Raxode backend, GUI/TUI workflows, product artifacts, and full plugin registration should be implemented above this contract.
