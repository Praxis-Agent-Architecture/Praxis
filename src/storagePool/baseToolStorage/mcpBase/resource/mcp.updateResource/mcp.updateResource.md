---
description: Update an MCP resource through a runtime-owned MCP server provider.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"resourceUri\":\"file:///workspace/README.md\",\"content\":{\"mimeType\":\"text/markdown\",\"text\":\"# Updated\"}}}"
---

# mcp.updateResource

## Use This Tool

Use `mcp.updateResource` when a runtime-mounted MCP server should update a resource through a fixed BaseTool contract. Runtime owns persistence, revision conflict handling, transport, and cleanup.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "resourceUri": "file:///workspace/README.md",
    "expectedRevision": "rev-1",
    "content": { "mimeType": "text/markdown", "text": "# Updated" }
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "allowedUriPrefixes": ["file:///workspace/"],
    "grantedPermissions": ["mcp:resource:write"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.resourceUri`: resource URI to update.
- `target.content`: JSON object containing `text`, `bytesBase64`, or `metadata`.

## Optional Inputs

- `target.expectedRevision`: runtime/server revision guard.
- `target.content.mimeType`: MIME type hint.
- `context.allowedUriPrefixes`, `context.allowedServerIds`, scopes, permissions, and guard.

## Runtime Behavior

Dry-run returns a planned mutation envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative guard, and `BaseToolExecutorPort.mcp.updateResource`. The baseTool normalizes content kind and guard facts but never writes the resource itself.

## Returns

Returns a normalized mutation envelope with planned or runtime state, content kind, optional revision, and provider metadata. Provider errors are mapped to public-safe `PROVIDER_REJECTED`.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.updateResource");
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
- Do not let runtime infer unvalidated content shape.
- Do not dispatch without `dryRun:false` and an accepted guard.
