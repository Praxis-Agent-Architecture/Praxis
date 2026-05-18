---
description: Request a runtime-owned MCP manager to establish or reuse a server connection.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"transportHint\":\"stdio\"}}"
---

# mcp.connect

## Use This Tool

Use `mcp.connect` when the agent needs runtime to establish or reuse a configured MCP server connection.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "connectionId": "fs-mcp:connection",
    "transportHint": "stdio",
    "timeoutMs": 30000
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: configured MCP server id.

## Optional Inputs

- `target.connectionId`: runtime connection handle hint.
- `target.transportHint`: `stdio`, `http`, or `sse` hint for runtime.
- `target.timeoutMs`: timeout in milliseconds, default `30000`.
- Legacy dry-run preview fields: `target.transport`, `target.endpoint`, and `target.command`.
- `context.allowedServerIds` and `grantedPermissions`: runtime governance material.

## Runtime Behavior

Dry-run returns a planned connection envelope and never calls the provider. Real dispatch requires `dryRun:false` plus `context.guard.accepted` or `context.guard.allowed`, then calls `BaseToolExecutorPort.mcp.connect`.

The baseTool validates input, permission metadata, guard state, audit metadata, and public-safe errors. Runtime owns the MCP client, active session, transport, OAuth, reconnect, timers, progress, and cancellation.

## Returns

The result includes `operationPreview`, `providerCalled`, `executionBlocked`, `permissionsRequired`, and runtime provider metadata when available.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "transportHint": "stdio"
  }
}
```

## Avoid

- Do not build a hidden MCP client in this tool.
- Do not spawn stdio servers or open network sockets from baseTool.
- Do not put OAuth, progress, cancellation, reconnect, or transport lifecycle in baseTool.
- Do not use this as a generic MCP admin command.
