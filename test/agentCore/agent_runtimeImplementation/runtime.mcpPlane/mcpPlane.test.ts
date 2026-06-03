import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAgent,
  harness,
  loop,
  mcp,
  model,
  policy,
  session,
  storage,
  toolPolicies,
  type PraxisAgent,
} from "../../../../src/agentCore/index.js";
import {
  buildMcpServerProfilesFromManifest,
  planMcpHarnessExposure,
} from "../../../../src/runtimeImplementation/runtime.mcpPlane/index.js";
import type { NativeToolDeclaration } from "@praxis-ai/mcp-plus";

const nativeTools: NativeToolDeclaration[] = [
  {
    name: "browser.open",
    description: "Open a browser page.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "page.snapshot",
    description: "Read the current page accessibility snapshot.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "network.status",
    description: "Inspect browser network requests.",
    inputSchema: { type: "object", properties: {} },
  },
];

class McpHarnessAgent implements PraxisAgent {
  identity = "agent.test.mcpHarness";
  model = model("gpt-test");
  storage = storage.memory();
  session = session({ persistence: "memory" });
  toolPolicy = toolPolicies.yolo();
  harness = harness({
    modules: {
      mcp: mcp.module({
        servers: [
          mcp.stdio("browser-native", {
            command: "node",
            args: ["server.js"],
          }),
          mcp.stdio("browser-plus", {
            command: "node",
            args: ["server.js"],
            mode: "mcp-plus",
            manifest: {
              server: {
                id: "browser-plus",
                title: "Browser Plus",
                summary: "Browser MCP server with MCP+ exposure policy.",
              },
              exposure: {
                pinnedTools: ["browser.open", "page.snapshot"],
                indexedTools: ["network.status"],
                toolCards: {
                  "network.status": {
                    title: "Network status",
                    summary: "Inspect network only when diagnostics are needed.",
                    keywords: ["network", "requests"],
                  },
                },
              },
              skills: {
                chapters: [{
                  id: "page-inspection",
                  title: "Page inspection",
                  summary: "Open the page, snapshot it, then expand diagnostics if needed.",
                }],
              },
            },
          }),
        ],
      }),
    },
    tools: mcp.recommendedTools(),
    policy: policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list"],
    }),
    loop: loop.standard(),
  });
}

test("MCP harness module compiles into a declarative OAO manifest", () => {
  const compiled = compileAgent(McpHarnessAgent, {
    compiledAt: "2026-06-03T00:00:00.000Z",
    manifestId: "manifest.test.mcpHarness",
  });

  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const mcpModule = compiled.manifest.harness.modules.mcp;
  assert.equal(typeof mcpModule, "object");
  assert.deepEqual(compiled.manifest.harness.runtimeRequirements.includes("runtime.mcp"), true);
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "mcp.use"), true);
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "mcp.resources"), true);

  const profiles = buildMcpServerProfilesFromManifest(compiled.manifest);
  assert.deepEqual(profiles.map((profile) => profile.serverId), ["browser-native", "browser-plus"]);
  assert.equal(profiles[0]?.transport, "stdio");
});

test("MCP+ planning keeps native MCP tools compatible while folding recommended exposure", () => {
  const compiled = compileAgent(McpHarnessAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const planned = planMcpHarnessExposure(compiled.manifest, {
    "browser-plus": nativeTools,
  });

  const plus = planned.servers.find((server) => server.serverId === "browser-plus");
  assert.ok(plus);
  assert.equal(plus.mode, "mcp-plus");
  assert.deepEqual(plus.surface.tools.map((tool) => tool.name), ["browser.open", "page.snapshot", "mcp_plus.expand"]);
  assert.deepEqual(plus.surface.sidecar.toolIndex.map((entry) => entry.id), ["network.status"]);
  assert.deepEqual(plus.dynamicToolSpecs.map((tool) => tool.toolId), [
    "mcp.browser-plus.browser.open",
    "mcp.browser-plus.page.snapshot",
  ]);
  assert.equal(plus.dynamicToolSpecs[0]?.metadata?.toolProviderKind, "mcp-static");
});
