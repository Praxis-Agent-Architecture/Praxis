---
description: Unregister a tool definition through a runtime-owned MCP server registry.
tool-id: mcp.unregisterTool
storage-group: tool
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"toolName\":\"dynamic_echo\",\"keepAuditRecord\":true}}"
---

# mcp.unregisterTool

## Use This Tool

Use `mcp.unregisterTool` when a runtime-mounted MCP server should remove a tool definition from its runtime-owned registry through a fixed BaseTool contract. Runtime owns the actual MCP client, sessions, persistence, audit persistence, and deletion semantics.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "toolName": "dynamic_echo",
    "keepAuditRecord": true
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
- `target.toolName`: existing MCP tool name to remove.

## Optional Inputs

- `target.keepAuditRecord`: runtime hint to preserve a deletion audit record.
- `context.dryRun`, `context.guard`, `context.allowedServerIds`, scopes, and permissions.

## Runtime Behavior

Dry-run returns a planned unregister envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.unregisterTool`. The baseTool validates JSON, server scope, tool name, permissions, audit metadata, and public-safe errors; runtime owns registry mutation and deletion policy.

## Returns

Returns a normalized unregister result with the server id, tool name, audit-retention intent, runtime status, and provider metadata. Provider failures are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.unregisterTool");
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
- Do not delete runtime registry state directly from baseTool.
- Do not dispatch without `dryRun:false` and an accepted guard.
- Do not expose raw provider errors to users.
