---
description: Request runtime-owned MCP cache invalidation for a mounted server.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"scope\":\"resources\",\"cacheKey\":\"resource:file:///workspace/README.md\"},\"context\":{\"dryRun\":false,\"guard\":{\"accepted\":true}}}"
---

# mcp.invalidateCache

## Use This Tool

Use `mcp.invalidateCache` when runtime should evict MCP cache entries for a server, resource set, tool set, or all MCP cache material for that server.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "scope": "resources",
    "cacheKey": "resource:file:///workspace/README.md",
    "reason": "resource changed"
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "grantedPermissions": ["mcp:cache:invalidate"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.scope`: `server`, `resources`, `tools`, or `all`.

## Optional Inputs

- `target.cacheKey`: narrow cache key to invalidate.
- `target.reason`: public-safe reason for audit.
- `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned invalidation envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.invalidateCache`. Runtime owns cache indexes, eviction fan-out, tenant boundaries, and stored values.

## Returns

Returns a normalized invalidation envelope with planned or runtime state, invalidation count when available, and provider metadata. Provider errors are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.invalidateCache");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input,
  executor
});
```

## Avoid

- Do not evict cache entries directly from baseTool code.
- Do not use this as a broad tool registry reset.
- Do not expose raw runtime cache values in public output.
- Do not dispatch without `dryRun:false` and an accepted guard.
