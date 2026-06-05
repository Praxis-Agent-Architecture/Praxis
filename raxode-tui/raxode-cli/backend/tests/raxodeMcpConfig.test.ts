import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadRaxodeMcpRuntimeOptions,
  mergeRaxodeMcpPlusRuntimeOptions,
} from "../application/mcpConfig.js";
import {
  ensureRaxodeHomeScaffold,
  loadRaxodeConfigFile,
  loadRaxodeMcpConfig,
} from "../../frontend/tui/config/raxode-config.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const praxisRoot = path.resolve(testDir, "../../../..");
const tenServerExamplePath = path.join(praxisRoot, "examples", "raxode-mcp-plus-ten-server.config.json");

test("loadRaxodeMcpRuntimeOptions maps enabled config servers to application runtime options", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-mcp-runtime-"));
  const previousHome = process.env.RAXODE_HOME;
  const raxodeHome = path.join(rootDir, ".raxode");
  process.env.RAXODE_HOME = raxodeHome;
  ensureRaxodeHomeScaffold(rootDir);

  try {
    const configPath = path.join(raxodeHome, "config.json");
    const config = loadRaxodeConfigFile(rootDir);
    config.mcp = {
      projectId: "project.raxode.test",
      reprofileConsecutiveIndexedCalls: 6,
      servers: [
        {
          serverId: "playwright",
          mode: "mcp-plus",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@playwright/mcp@latest"],
          title: "Playwright MCP+",
          summary: "Browser automation through Playwright MCP.",
          enabled: true,
          timeoutMs: 20_000,
          manifest: {
            server: {
              id: "playwright",
              title: "Playwright MCP+",
              summary: "Browser automation through Playwright MCP.",
            },
            exposure: {
              pinnedTools: ["browser_navigate", "browser_snapshot"],
              indexedTools: ["browser_network_requests"],
            },
          },
        },
        {
          serverId: "disabled-docs",
          mode: "native",
          transport: "http",
          url: "http://127.0.0.1:5000/mcp",
          enabled: false,
        },
      ],
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const options = loadRaxodeMcpRuntimeOptions(rootDir);

    assert.equal(options.mcpPlus?.projectId, "project.raxode.test");
    assert.equal(options.mcpPlus?.reprofileConsecutiveIndexedCalls, 6);
    assert.equal(options.mcpServers?.length, 1);
    assert.equal(options.mcpServers?.[0]?.serverId, "playwright");
    assert.equal(options.mcpServers?.[0]?.mode, "mcp-plus");
    assert.equal(options.mcpServers?.[0]?.transport, "stdio");
    assert.equal(options.mcpServers?.[0]?.metadata?.source, "raxode.config.mcp");
    assert.deepEqual(options.mcpServers?.[0]?.transport === "stdio" ? options.mcpServers[0].args : [], [
      "-y",
      "@playwright/mcp@latest",
    ]);
  } finally {
    if (previousHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousHome;
    }
  }
});

test("mergeRaxodeMcpPlusRuntimeOptions preserves configured project identity with explicit overrides", () => {
  const merged = mergeRaxodeMcpPlusRuntimeOptions(
    {
      projectId: "project.from-config",
      reprofileConsecutiveIndexedCalls: 6,
    },
    {
      reprofileConsecutiveIndexedCalls: 9,
    },
  );

  assert.equal(merged?.projectId, "project.from-config");
  assert.equal(merged?.reprofileConsecutiveIndexedCalls, 9);
});

test("Raxode MCP+ ten-server example is accepted by frontend config and backend runtime mapping", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-mcp-ten-server-"));
  const previousHome = process.env.RAXODE_HOME;
  const raxodeHome = path.join(rootDir, ".raxode");
  process.env.RAXODE_HOME = raxodeHome;
  ensureRaxodeHomeScaffold(rootDir);

  try {
    const example = JSON.parse(await readFile(tenServerExamplePath, "utf8")) as {
      mcp?: Record<string, unknown>;
    };
    assert.ok(example.mcp);

    const configPath = path.join(raxodeHome, "config.json");
    const config = loadRaxodeConfigFile(rootDir);
    config.mcp = example.mcp as typeof config.mcp;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const parsed = loadRaxodeMcpConfig(rootDir);
    const options = loadRaxodeMcpRuntimeOptions(rootDir);

    assert.equal(parsed.projectId, "project.raxode.local-mcp-plus");
    assert.equal(parsed.reprofileConsecutiveIndexedCalls, 6);
    assert.equal(parsed.servers.length, 10);
    assert.equal(parsed.servers.every((server) => server.mode === "mcp-plus"), true);
    assert.equal(parsed.servers.every((server) => server.enabled), true);
    assert.equal(parsed.servers.some((server) => server.serverId === "playwright" && server.manifest !== undefined), true);

    assert.equal(options.mcpPlus?.projectId, "project.raxode.local-mcp-plus");
    assert.equal(options.mcpPlus?.reprofileConsecutiveIndexedCalls, 6);
    assert.equal(options.mcpServers?.length, 10);
    assert.equal(options.mcpServers?.every((server) => server.mode === "mcp-plus"), true);
    assert.equal(options.mcpServers?.every((server) => server.metadata?.source === "raxode.config.mcp"), true);
    assert.equal(options.mcpServers?.some((server) => server.serverId === "playwright" && server.manifest !== undefined), true);
  } finally {
    if (previousHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousHome;
    }
  }
});
