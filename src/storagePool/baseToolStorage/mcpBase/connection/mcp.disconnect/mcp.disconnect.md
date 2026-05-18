---
description: Request a runtime-owned MCP manager to close or forget a server connection.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"connectionId\":\"fs-mcp:connection\"}}"
---

# mcp.disconnect

## Use This Tool

Use `mcp.disconnect` when the agent needs runtime to close, mark, or forget a managed MCP server connection.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "connectionId": "fs-mcp:connection",
    "reason": "caller finished MCP work",
    "force": false
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
- `target.reason`: public-safe disconnect reason, up to 256 characters.
- `target.force`: boolean runtime hint, default `false`.
- `context.allowedServerIds` and `grantedPermissions`: runtime governance material.

## Runtime Behavior

Dry-run returns a disconnect envelope and never calls the provider. Real dispatch requires `dryRun:false` plus `context.guard.accepted` or `context.guard.allowed`, then calls `BaseToolExecutorPort.mcp.disconnect`.

The baseTool owns validation, permission metadata, guard state, audit metadata, and public-safe errors. Runtime owns the active MCP client, transport close, pending reconnect timers, cancellation handles, and cleanup policy.

## Returns

The result includes `operationPreview`, `providerCalled`, `executionBlocked`, `permissionsRequired`, and runtime provider metadata when available.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "connectionId": "fs-mcp:connection"
  }
}
```

## Avoid

- Do not dispose MCP clients directly in baseTool.
- Do not implement reconnect or cleanup timers in baseTool.
- Do not leak raw runtime disconnect failures.
- Do not use this as a generic MCP admin command.
