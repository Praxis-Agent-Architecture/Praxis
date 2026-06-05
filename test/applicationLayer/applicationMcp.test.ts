import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationProjectRuntime,
} from "../../src/applicationLayer/index.js";

const DOCTOR_PROJECT = "src/devdoctor";

test("application runtime accepts official MCP server options and reports them in the view", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-03T00:00:00.000Z",
    mcpServers: [{
      serverId: "browser-native",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    }],
    mcpPlusServers: [{
      serverId: "browser-plus",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      manifest: {
        server: {
          id: "browser-plus",
          title: "Browser Plus",
          summary: "Browser MCP server with MCP+ exposure policy.",
        },
        exposure: {
          pinnedTools: ["browser.open"],
          indexedTools: ["network.status"],
        },
      },
    }],
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const view = created.runtime.getView();
  assert.equal(view.mcp.servers.length, 2);
  assert.deepEqual(view.mcp.servers.map((server) => `${server.serverId}:${server.mode}`), [
    "browser-native:native",
    "browser-plus:mcp-plus",
  ]);
  assert.equal(view.mcp.servers[1]?.manifestPresent, true);
});

test("application runtime defaults manifest-backed MCP servers to MCP+ mode", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-06-03T00:00:00.000Z",
    mcpServers: [{
      serverId: "browser-plus-default",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      manifest: {
        server: {
          id: "browser-plus-default",
          title: "Browser Plus Default",
          summary: "Browser MCP server with MCP+ exposure policy.",
        },
        exposure: {
          pinnedTools: ["browser.open"],
          indexedTools: ["network.status"],
        },
      },
    }],
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;

  const view = created.runtime.getView();
  assert.deepEqual(view.mcp.servers.map((server) => `${server.serverId}:${server.mode}`), [
    "browser-plus-default:mcp-plus",
  ]);
  assert.equal(view.mcp.servers[0]?.manifestPresent, true);
});
