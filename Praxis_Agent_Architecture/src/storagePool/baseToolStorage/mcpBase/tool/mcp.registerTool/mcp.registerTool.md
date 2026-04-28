---
description: Register a tool definition through a runtime-owned MCP server registry.
tool-id: mcp.registerTool
storage-group: tool
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"tool\":{\"name\":\"dynamic_echo\",\"inputSchema\":{\"type\":\"object\"}},\"replaceExisting\":true}}"
---

# mcp.registerTool

## Use This Tool

Use `mcp.registerTool` when a runtime-mounted MCP server should register a tool definition through a fixed BaseTool contract. Runtime owns the MCP registry, sessions, persistence, conflict policy, transport, and cleanup.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "tool": {
      "name": "dynamic_echo",
      "description": "Echo input text through the MCP runtime",
      "inputSchema": {
        "type": "object",
        "properties": {
          "text": { "type": "string" }
        },
        "required": ["text"]
      }
    },
    "replaceExisting": true
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

- `target.serverId`: required MCP server id, or supplied by `context.serverId`.
- `target.tool.name`: required MCP tool name.

## Optional Inputs

- `target.tool.description`: optional description.
- `target.tool.inputSchema`: optional JSON object schema.
- `target.tool.outputSchema`: optional JSON object schema.
- `target.tool.metadata`: optional JSON object metadata.
- `target.replaceExisting`: optional boolean.
- `context.dryRun`, `context.guard`, `context.allowedServerIds`, scopes, and permissions.

## Runtime Behavior

Dry-run returns a planned registration envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.registerTool`. The baseTool validates JSON, server scope, tool definition shape, permissions, audit metadata, and public-safe errors, but it never creates an MCP client, opens a transport, or mutates runtime state by itself.

## Returns

Returns a normalized registration result with the server id, tool name, replacement intent, runtime status, optional revision/version metadata, and provider metadata. Provider failures are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.registerTool");
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
- Do not pass transport, endpoint, command, OAuth, or session ownership into baseTool.
- Do not mutate a tool registry directly from baseTool.
- Do not dispatch without `dryRun:false` and an accepted guard.
- Do not expose raw provider errors to users.
