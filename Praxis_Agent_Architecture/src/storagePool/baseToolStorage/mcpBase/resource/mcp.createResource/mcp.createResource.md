---
description: Create an MCP resource through a runtime-owned MCP server provider.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"uri\":\"file:///workspace/new-note.md\",\"resourceType\":\"document\",\"mimeType\":\"text/markdown\"},\"initialContent\":\"# note\"}"
---

# mcp.createResource

## Use This Tool

Use `mcp.createResource` when a runtime-mounted MCP server should create a resource through a fixed BaseTool contract. Runtime owns persistence, revision assignment, conflict behavior, transport, and cleanup.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "uri": "file:///workspace/new-note.md",
    "resourceType": "document",
    "mimeType": "text/markdown"
  },
  "initialContent": "# note",
  "metadata": { "owner": "tool-lab" },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "allowedUriPrefixes": ["file:///workspace/"],
    "grantedPermissions": ["mcp:connection:read", "mcp:resource:create"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.uri`: resource URI to create.

## Optional Inputs

- `target.resourceType`: runtime-facing resource type hint.
- `target.mimeType`: content MIME type hint.
- `initialContent`: JSON value passed to runtime.
- `metadata`: JSON object passed to runtime.
- `context.allowedUriPrefixes`, `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned creation envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.createResource`. The baseTool never writes files, opens MCP transports, or stores resource state.

## Returns

Returns a normalized resource envelope with planned or runtime state, content/metadata acceptance facts, optional revision, and provider metadata. Provider errors are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.createResource");
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
- Do not write resources directly from baseTool.
- Do not skip URI scope checks.
- Do not dispatch without `dryRun:false` and an accepted guard.
