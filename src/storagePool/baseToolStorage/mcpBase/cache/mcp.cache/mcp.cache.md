---
description: Request runtime-owned MCP cache write for a mounted server.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"cacheKey\":\"resource:file:///workspace/README.md\",\"valueRef\":\"envelope://mcp/read/1\"},\"context\":{\"dryRun\":false,\"guard\":{\"accepted\":true}}}"
---

# mcp.cache

## Use This Tool

Use `mcp.cache` when a runtime-mounted MCP server should store a cache entry for a resource, tool list, or tool-call result. The cache value is referenced by `valueRef`; cache material itself stays in runtime.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "cacheKey": "resource:file:///workspace/README.md",
    "valueRef": "envelope://mcp/read/1",
    "ttlSeconds": 300,
    "tags": ["resource", "read"]
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "grantedPermissions": ["mcp:read", "mcp:write", "cache:write"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.cacheKey`: stable runtime cache key.
- `target.valueRef`: reference to runtime-owned cache material.

## Optional Inputs

- `target.ttlSeconds`: positive integer TTL.
- `target.tags`: string tags for runtime eviction/indexing.
- `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned cache envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.cache`. The baseTool validates key/ref/TTL/tags and never stores cache material directly.

## Returns

Returns a normalized cache envelope with planned or runtime state, TTL, tags, and provider metadata. Provider errors are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.cache");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input,
  executor
});
```

## Avoid

- Do not put cache value material directly in the baseTool input.
- Do not create a hidden cache store in storage core.
- Do not let runtime infer invalid cache keys from unvalidated input.
- Do not dispatch without `dryRun:false` and an accepted guard.
