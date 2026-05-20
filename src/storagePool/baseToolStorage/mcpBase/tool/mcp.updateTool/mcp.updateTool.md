---
description: Update a tool definition through a runtime-owned MCP server registry.
tool-id: mcp.updateTool
storage-group: tool
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"toolName\":\"dynamic_echo\",\"patch\":{\"description\":\"Updated tool\"}}}"
---

# mcp.updateTool

## Use This Tool

Use `mcp.updateTool` when a runtime-mounted MCP server should update an existing tool definition through a fixed BaseTool contract. Runtime owns the actual registry state, sessions, transport, conflict policy, versioning, and persistence.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "toolName": "dynamic_echo",
    "patch": {
      "description": "Updated echo tool",
      "metadata": { "owner": "tool-lab" }
    }
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "grantedPermissions": ["mcp:tool:read", "mcp:tool:write"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id, or supplied by `context.serverId`.
- `target.toolName`: existing MCP tool name.
- `target.patch`: JSON object describing the tool definition fields to update.

## Optional Inputs

- `target.patch.description`: replacement description.
- `target.patch.inputSchema`: replacement JSON object input schema.
- `target.patch.outputSchema`: replacement JSON object output schema.
- `target.patch.metadata`: replacement or merge metadata, according to runtime policy.
- `context.dryRun`, `context.guard`, `context.allowedServerIds`, scopes, and permissions.

## Runtime Behavior

Dry-run returns a planned update envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.updateTool`. The baseTool validates JSON, server scope, patch shape, permissions, audit metadata, and public-safe errors; runtime owns registry mutation and conflict handling.

## Returns

Returns a normalized update result with the server id, tool name, accepted patch summary, runtime status, and provider metadata. Provider failures are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.updateTool");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input,
  executor
});
```

## Avoid

- Do not use this as a generic `mcp.execute`.
- Do not create MCP clients, sessions, transports, or OAuth flows inside this baseTool.
- Do not mutate the registry directly from baseTool.
- Do not dispatch without `dryRun:false` and an accepted guard.
- Do not expose raw provider errors to users.
