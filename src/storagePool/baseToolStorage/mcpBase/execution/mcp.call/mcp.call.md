---
description: Call a tool on a runtime-owned MCP server.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"name\":\"read_file\",\"arguments\":{\"path\":\"README.md\"}}}"
---

# mcp.call

## Use This Tool

Use `mcp.call` when the agent needs to invoke a named tool exposed by an already configured MCP server.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "name": "read_file",
    "mode": "tool",
    "arguments": { "path": "README.md" },
    "timeoutMs": 30000
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.name` or `target.toolName`: MCP tool name.

## Optional Inputs

- `target.mode`: `tool` by default, or `service`.
- `target.arguments`: JSON object passed to the runtime MCP provider.
- `target.timeoutMs`: positive finite timeout in milliseconds.
- `context.allowedServerIds`, `requestedScopes`, `allowedScopes`, and `grantedPermissions`: runtime governance material.

## Runtime Behavior

Dry-run returns a normalized `requestEnvelope` and never calls the provider. Real dispatch requires `dryRun:false` plus `context.guard.accepted` or `context.guard.allowed`, then calls `BaseToolExecutorPort.mcp.callTool`.

The baseTool owns validation, scope checks, permission checks, audit metadata, and public-safe errors. Runtime owns the MCP client, connection, session, transport, OAuth, progress, timeout enforcement, and cancellation.

## Returns

The result includes `requestEnvelope`, `providerCalled`, `executionBlocked`, `permissionsRequired`, and `providerResult` when runtime dispatch succeeds.

Public errors include invalid JSON shape, rejected governance, missing provider, and provider failure without exposing raw runtime details.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "name": "read_file",
    "arguments": { "path": "README.md" }
  }
}
```

## Avoid

- Do not create, cache, or configure MCP clients in baseTool.
- Do not hide transport, OAuth, progress, timeout, or cancellation ownership in this tool.
- Do not use this as a generic `mcp.execute` or `mcp.nativeExecute`.
