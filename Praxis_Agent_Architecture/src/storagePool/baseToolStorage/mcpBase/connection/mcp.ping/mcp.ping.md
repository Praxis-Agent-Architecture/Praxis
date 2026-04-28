---
description: Ping a runtime-owned MCP server connection.
argument-hint: "{ target: { serverId, connectionId?, timeoutMs? }, context? }"
---

# mcp.ping

## Use This Tool
Probe whether a mounted MCP server connection is reachable.

## Call Shape
Call through `BaseToolHandler.invoke()` with `target.serverId`.

## Required Inputs
- `target.serverId`

## Optional Inputs
- `target.connectionId`
- `target.timeoutMs`

## Runtime Behavior
Dry-run returns a planned probe. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.ping`.

## Returns
`operationPreview` with healthy/status/latency information when runtime provides it.

## Example
`{ "target": { "serverId": "fs-mcp" }, "context": { "dryRun": false, "guard": { "accepted": true } } }`

## Avoid
Do not create sessions or retry policies inside this baseTool.
