---
description: Delete an MCP resource through a runtime-owned MCP server provider.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"uri\":\"file:///workspace/old-note.md\",\"expectedRevision\":\"rev-1\"},\"reason\":\"cleanup\"}"
---

# mcp.deleteResource

## Use This Tool

Use `mcp.deleteResource` when a runtime-mounted MCP server should delete a resource through a fixed BaseTool contract. Runtime owns persistence, tombstones/conflicts, transport, and cleanup.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "uri": "file:///workspace/old-note.md",
    "expectedRevision": "rev-1"
  },
  "reason": "cleanup",
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "allowedUriPrefixes": ["file:///workspace/"],
    "grantedPermissions": ["mcp:connection:read", "mcp:resource:delete"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.uri`: resource URI to delete.

## Optional Inputs

- `target.expectedRevision`: runtime/server revision guard.
- `reason`: public-safe deletion reason.
- `context.allowedUriPrefixes`, `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned delete envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.deleteResource`. The baseTool never deletes files or owns server state.

## Returns

Returns a normalized delete envelope with planned or runtime state and provider metadata. Provider errors are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.deleteResource");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input,
  executor
});
```

## Avoid

- Do not create a hidden MCP client in this tool.
- Do not delete resources directly from baseTool.
- Do not skip URI scope checks.
- Do not dispatch without `dryRun:false` and an accepted guard.
