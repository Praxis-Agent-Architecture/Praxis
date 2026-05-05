---
description: Ask runtime-owned MCP policy services to authorize a fixed MCP action.
argument-hint: '{"target":{"serverId":"fs-mcp","subjectId":"runtime:agent-1","action":"call-tool","toolName":"read_file"},"context":{"dryRun":false}}'
---

# mcp.authorize

## Use This Tool

Use `mcp.authorize` when the runtime or TAP needs a normalized policy decision for a specific MCP action.

## Call Shape

Call through `BaseToolHandler.invoke()` with:

```json
{
  "target": {
    "serverId": "fs-mcp",
    "subjectId": "runtime:agent-1",
    "action": "call-tool",
    "toolName": "read_file",
    "requestedScopes": ["tools:call"]
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true }
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.subjectId`: subject requesting access.
- `target.action`: `call-tool`, `read-resource`, `subscribe`, or `cache-access`.

## Optional Inputs

- `target.toolName`: MCP tool name when authorizing a tool call.
- `target.resourceUri`: MCP resource URI when authorizing resource access.
- `target.requestedScopes`: requested policy scopes.

## Runtime Behavior

Dry-run returns a policy input envelope and never calls the provider. Real dispatch requires `context.dryRun === false`, an accepted guard, and a runtime provider backed by `BaseToolExecutorPort.mcp.authorize`.

## Returns

Returns the normalized policy input, runtime decision, `authorizationGranted`, and provider metadata when runtime was called.

## Example

```json
{
  "target": {
    "serverId": "fs-mcp",
    "subjectId": "runtime:agent-1",
    "action": "read-resource",
    "resourceUri": "file:///workspace/README.md"
  }
}
```

## Avoid

- Do not make product policy in the baseTool.
- Do not inspect or store raw credential material.
- Do not use this as a generic `mcp.execute` replacement.
