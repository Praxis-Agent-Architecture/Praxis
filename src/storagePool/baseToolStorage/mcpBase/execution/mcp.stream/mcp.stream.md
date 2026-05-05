---
description: Start or collect a runtime-owned MCP stream through a governed BaseTool contract.
argument-hint: "{\"target\":{\"serverId\":\"fs-mcp\",\"name\":\"read_file\",\"channel\":\"chunks\",\"arguments\":{\"path\":\"README.md\"},\"maxEvents\":3}}"
---

# mcp.stream

## Use This Tool

Use `mcp.stream` when a runtime-mounted MCP server should start or collect a streaming tool result and the caller needs a fixed BaseTool contract. The runtime owns the MCP client, stream id, progress, buffers, backpressure, and cancellation handle.

## Call Shape

```json
{
  "target": {
    "serverId": "fs-mcp",
    "name": "read_file",
    "channel": "chunks",
    "arguments": { "path": "README.md" },
    "maxEvents": 3
  },
  "context": {
    "dryRun": false,
    "guard": { "accepted": true },
    "allowedServerIds": ["fs-mcp"],
    "grantedPermissions": ["mcp:stream", "mcp:call"]
  }
}
```

## Required Inputs

- `target.serverId`: runtime MCP server id.
- `target.name`: MCP tool or streaming operation name.

## Optional Inputs

- `target.channel`: `events` or `chunks`; defaults to `events`.
- `target.arguments`: JSON object passed to the runtime MCP provider.
- `target.maxEvents`: positive integer limit for returned events/chunks when the runtime can honor it.
- `context.allowedServerIds`, `context.requestedScopes`, `context.allowedScopes`, and `context.grantedPermissions`: runtime governance facts.

## Runtime Behavior

Dry-run returns a planned stream envelope and never calls the provider. Real dispatch requires `context.dryRun:false`, an affirmative runtime guard, and an injected `BaseToolExecutorPort.mcp.streamTool` provider. The baseTool does not open transports, store stream handles, buffer server events, or perform cancellation itself.

## Returns

Returns a normalized `streamEnvelope` with `serverId`, `name`, `channel`, arguments, planned or runtime status, and optional runtime-owned `executionId`/`streamId`. Provider failures are mapped to public-safe `PROVIDER_REJECTED` errors.

## Example

```ts
const lookup = createBaseToolRegistry().lookupHandler("mcp.stream");
await lookup.handler.invoke({
  toolCallId: "call-1",
  runtimeId: "runtime-1",
  sessionId: "session-1",
  input: {
    target: { serverId: "fs-mcp", name: "read_file", channel: "chunks", arguments: { path: "README.md" } },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:stream", "mcp:call"] }
  },
  executor
});
```

## Avoid

- Do not create a hidden MCP client in this tool.
- Do not store stream handles or progress buffers in baseTool.
- Do not use `mcp.stream` as a generic native execution escape hatch.
- Do not run real dispatch without `dryRun:false` and an accepted guard.
