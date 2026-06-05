import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  createFileMcpPlusProfileStore,
  createFileMcpPlusSkillStore,
  createInMemoryMcpPlusOverlayStore,
  createInMemoryMcpPlusProfileStore,
  learnedProfileFromProposal,
  type McpPlusProfileProposal,
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
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list", "mcp:prompt:get", "mcp:completion"],
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
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "mcp.prompts"), true);
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "mcp.completions"), true);

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
  assert.deepEqual(plus.surface.tools.map((tool) => tool.name), [
    "browser.open",
    "page.snapshot",
    "mcp_plus.expand",
    "mcp_plus.skill_read",
    "mcp_plus.skill_write",
    "mcp_plus.finish",
  ]);
  assert.deepEqual(plus.surface.sidecar.toolIndex.map((entry) => entry.id), ["network.status"]);
  assert.deepEqual(plus.dynamicToolSpecs.map((tool) => tool.toolId), [
    "mcp.browser-plus.browser.open",
    "mcp.browser-plus.page.snapshot",
    "mcp.browser-plus.mcp_plus.expand",
    "mcp.browser-plus.mcp_plus.skill_read",
    "mcp.browser-plus.mcp_plus.skill_write",
    "mcp.browser-plus.mcp_plus.finish",
  ]);
  assert.equal(plus.dynamicToolSpecs[2]?.metadata?.toolProviderKind, "mcp-plus-control");
});

test("MCP+ native planning exposes init control tool when no manifest or learned profile exists", () => {
  const manifest = {
    harness: {
      modules: {
        mcp: mcp.module({
          servers: [
            mcp.stdio("browser-plus", {
              command: "node",
              args: ["server.js"],
              mode: "mcp-plus",
            }),
          ],
        }),
      },
    },
  };

  const planned = planMcpHarnessExposure(manifest, {
    "browser-plus": nativeTools,
  });

  const plus = planned.servers[0];
  assert.equal(plus?.mode, "mcp-plus");
  assert.deepEqual(plus?.surface.tools.map((tool) => tool.name), [
    "browser.open",
    "page.snapshot",
    "network.status",
    "mcp_plus.init",
    "mcp_plus.skill_read",
    "mcp_plus.skill_write",
    "mcp_plus.finish",
  ]);
  assert.equal(plus?.dynamicToolSpecs.find((tool) => tool.toolId.endsWith("mcp_plus.init"))?.metadata?.toolProviderKind, "mcp-plus-control");
});

test("MCP+ native planning omits empty expand control unless frozen wake-up is needed", () => {
  const manifest = {
    harness: {
      modules: {
        mcp: mcp.module({
          servers: [
            mcp.stdio("single-plus", {
              command: "node",
              args: ["server.js"],
              mode: "mcp-plus",
              manifest: {
                server: {
                  id: "single-plus",
                  title: "Single Plus",
                  summary: "Small MCP+ server with no folded tools.",
                },
                exposure: {
                  pinnedTools: ["browser.open"],
                  indexedTools: [],
                },
              },
            }),
          ],
        }),
      },
    },
  };

  const expanded = planMcpHarnessExposure(manifest, {
    "single-plus": [nativeTools[0]!],
  });
  assert.deepEqual(expanded.servers[0]?.surface.tools.map((tool) => tool.name), [
    "browser.open",
    "mcp_plus.skill_read",
    "mcp_plus.skill_write",
    "mcp_plus.finish",
  ]);

  const frozen = planMcpHarnessExposure(manifest, {
    "single-plus": [nativeTools[0]!],
  }, {
    "single-plus": { mode: "frozen" },
  });
  assert.deepEqual(frozen.servers[0]?.surface.tools.map((tool) => tool.name), [
    "mcp_plus.expand",
  ]);
});

test("MCP+ learned profile keeps schema version and rejects invalid proposals", () => {
  const accepted = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["browser.open"],
      indexedTools: ["network.status"],
      toolCards: {
        "network.status": {
          title: "Network status",
          summary: "Inspect network when page loading is suspicious.",
          keywords: ["network"],
        },
      },
      skillChapters: [{
        id: "browser-debug",
        title: "Browser debug",
        summary: "Snapshot first, expand network only when needed.",
      }],
      rationale: "browser.open is the common entrypoint.",
    },
  });

  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.profile.schemaVersion, "mcp-plus.profile.v1");
  assert.equal(accepted.profile.projectId, "project.raxode");
  assert.deepEqual(accepted.profile.exposure.pinnedTools, ["browser.open"]);
  assert.deepEqual(accepted.profile.skills?.chapters?.map((chapter) => chapter.id), ["browser-debug"]);

  const unknown = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["browser.missing"],
      indexedTools: [],
      toolCards: {},
    },
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error.code, "MCP_PLUS_PROFILE_UNKNOWN_TOOL");

  const alwaysIndexPinned = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["network.status"],
      indexedTools: [],
      alwaysIndexTools: ["network.status"],
      toolCards: {},
    },
  });
  assert.equal(alwaysIndexPinned.ok, false);
  if (!alwaysIndexPinned.ok) assert.equal(alwaysIndexPinned.error.code, "MCP_PLUS_PROFILE_ALWAYS_INDEX_PINNED");

  const modeHint = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["browser.open"],
      indexedTools: [],
      toolCards: {},
      modeHint: "expanded",
    } as unknown as McpPlusProfileProposal,
  });
  assert.equal(modeHint.ok, false);
  if (!modeHint.ok) assert.equal(modeHint.error.code, "MCP_PLUS_PROFILE_MODE_HINT_UNSUPPORTED");
});

test("MCP+ profile and overlay stores are keyed by server/project and server/session", async () => {
  const profileStore = createInMemoryMcpPlusProfileStore();
  const overlayStore = createInMemoryMcpPlusOverlayStore();
  const accepted = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["browser.open"],
      indexedTools: ["network.status"],
      toolCards: {
        "network.status": {
          title: "Network status",
          summary: "Inspect network when page loading is suspicious.",
          keywords: ["network"],
        },
      },
    },
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;

  await profileStore.save({ projectId: "project.raxode", serverId: "browser-plus" }, accepted.profile);
  await overlayStore.save({
    sessionId: "session-a",
    serverId: "browser-plus",
  }, {
    serverId: "browser-plus",
    sessionId: "session-a",
    state: {
      mode: "expanded",
      activeTools: ["network.status"],
      pendingReprofile: true,
      counters: { consecutiveIndexedToolCalls: { "network.status": 6 } },
    },
    updatedAt: "2026-06-04T00:00:00.000Z",
  });

  assert.equal((await profileStore.load({ projectId: "project.raxode", serverId: "browser-plus" }))?.projectId, "project.raxode");
  assert.equal(await profileStore.load({ projectId: "project.docs", serverId: "browser-plus" }), undefined);
  assert.equal((await overlayStore.load({ sessionId: "session-a", serverId: "browser-plus" }))?.state.pendingReprofile, true);
  assert.equal(await overlayStore.load({ sessionId: "session-b", serverId: "browser-plus" }), undefined);
});

test("MCP+ file profile and skill stores persist server/project records", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-mcp-plus-store-"));
  try {
    const profileStore = createFileMcpPlusProfileStore(root);
    const skillStore = createFileMcpPlusSkillStore(root);
    const accepted = learnedProfileFromProposal({
      projectId: "project.raxode",
      now: "2026-06-04T00:00:00.000Z",
      nativeTools,
      proposal: {
        serverId: "browser-plus",
        pinnedTools: ["browser.open"],
        indexedTools: ["network.status"],
        toolCards: {
          "network.status": {
            title: "Network status",
            summary: "Inspect network when page loading is suspicious.",
            keywords: ["network"],
          },
        },
      },
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;

    await profileStore.save({ projectId: "project.raxode", serverId: "browser-plus" }, accepted.profile);
    await skillStore.write({ projectId: "project.raxode", serverId: "browser-plus" }, {
      chapter: "browser-debug",
      title: "Snapshot first",
      summary: "Read a snapshot before expanding diagnostics.",
    });

    const reloadedProfileStore = createFileMcpPlusProfileStore(root);
    const reloadedSkillStore = createFileMcpPlusSkillStore(root);
    assert.equal((await reloadedProfileStore.load({ projectId: "project.raxode", serverId: "browser-plus" }))?.schemaVersion, "mcp-plus.profile.v1");
    assert.equal((await reloadedProfileStore.load({ projectId: "project.docs", serverId: "browser-plus" })), undefined);
    assert.deepEqual((await reloadedSkillStore.list({ projectId: "project.raxode", serverId: "browser-plus" })).map((note) => note.title), ["Snapshot first"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP+ learned profile folds tool surface without asking for init again", () => {
  const accepted = learnedProfileFromProposal({
    projectId: "project.raxode",
    now: "2026-06-04T00:00:00.000Z",
    nativeTools,
    proposal: {
      serverId: "browser-plus",
      pinnedTools: ["browser.open"],
      indexedTools: ["page.snapshot", "network.status"],
      toolCards: {
        "page.snapshot": {
          title: "Page snapshot",
          summary: "Read semantic page state before interacting.",
          keywords: ["snapshot"],
        },
        "network.status": {
          title: "Network status",
          summary: "Inspect network when page loading is suspicious.",
          keywords: ["network"],
        },
      },
    },
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;

  const manifest = {
    harness: {
      modules: {
        mcp: mcp.module({
          servers: [
            mcp.stdio("browser-plus", {
              command: "node",
              args: ["server.js"],
              mode: "mcp-plus",
            }),
          ],
        }),
      },
    },
  };
  const planned = planMcpHarnessExposure(manifest, {
    "browser-plus": nativeTools,
  }, {}, {
    "browser-plus": accepted.profile,
  });

  const plus = planned.servers[0];
  assert.deepEqual(plus?.surface.tools.map((tool) => tool.name), [
    "browser.open",
    "mcp_plus.expand",
    "mcp_plus.skill_read",
    "mcp_plus.skill_write",
    "mcp_plus.finish",
  ]);
  assert.equal(plus?.surface.tools.some((tool) => tool.name === "mcp_plus.init"), false);
  assert.deepEqual([...plus?.surface.sidecar.toolIndex.map((entry) => entry.id) ?? []].sort(), ["network.status", "page.snapshot"]);
});
