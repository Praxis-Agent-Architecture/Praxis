---
description: Check health through a runtime-owned MCP server.
argument-hint: "{ target: { serverId, includeCapabilities?, includeLatencyProbe? }, context? }"
---

# mcp.healthCheck

## Use This Tool
Inspect MCP server health and optional capability/latency information.

## Call Shape
Call through `BaseToolHandler.invoke()` with `target.serverId`.

## Required Inputs
- `target.serverId`

## Optional Inputs
- `target.connectionId`
- `target.timeoutMs`
- `target.includeCapabilities`
- `target.includeLatencyProbe`

## Runtime Behavior
Dry-run returns an unknown probe envelope. Real dispatch requires `dryRun:false` plus an accepted guard, then calls `BaseToolExecutorPort.mcp.checkHealth`.

## Returns
`probeEnvelope.status`, connection label, optional latency, capabilities, and provider metadata.

## Example
`{ "target": { "serverId": "fs-mcp", "includeCapabilities": true }, "context": { "dryRun": false, "guard": { "accepted": true } } }`

## Avoid
Do not manage server lifecycle, reconnect loops, or transport policy inside this baseTool.
