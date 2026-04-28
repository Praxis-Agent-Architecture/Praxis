---
description: Dispatch a raw MCP protocol method through the runtime-owned MCP manager.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"method\":\"tools/list\",\"params\":{}},\"context\":{\"dryRun\":false,\"guard\":{\"accepted\":true}}}"
---

# mcp.nativeExecute

## Use This Tool

Use `mcp.nativeExecute` only when a runtime-admin path must send a raw MCP protocol method that is not covered by a fixed MCP baseTool. Prefer `mcp.call`, `mcp.listTools`, `mcp.readResource`, resource mutation tools, connection tools, and subscription tools for normal agent work.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "method": "tools/list",
    "params": {},
    "protocolVersion": "2025-06-18",
    "idempotencyKey": "native-1"
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "requestedScopes": ["mcp:fs"],
    "allowedScopes": ["mcp:fs"],
    "grantedPermissions": ["mcp:native-execute", "mcp:raw"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.method`: raw MCP protocol method name.

## Optional Inputs

- `target.params`: JSON object passed to runtime as the raw method params.
- `target.protocolVersion`: protocol version hint for runtime validation.
- `target.idempotencyKey`: caller-supplied idempotency hint.
- `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned raw MCP envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.nativeExecute`. Runtime owns MCP clients, sessions, transport, OAuth, protocol compatibility, progress, cancellation, and provider-specific raw responses.

## Returns

Returns a normalized native envelope with method, params, server id, protocol version, execution state, optional runtime result, and provider metadata. Missing providers return `PROVIDER_UNAVAILABLE`; provider failures return public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.nativeExecute");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input,
  executor
});
```

## Avoid

- Do not use this as the normal way to call MCP tools.
- Do not bypass fixed MCP tools when one exists.
- Do not create a hidden MCP client in baseTool.
- Do not pass transport, endpoint, command, OAuth, or session ownership into baseTool.
- Do not dispatch without `dryRun:false` and an accepted guard.
- Do not expose raw provider errors to users.
