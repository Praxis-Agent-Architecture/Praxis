import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBaseToolContextUsage,
  createBaseToolContextTree,
  createBaseToolContextHeatState,
  baseToolContextFoldingDescriptor,
} from "../../../src/runtimeImplementation/runtime.execEngine/baseToolContextFolding.js";
import { tool } from "../../../src/runtimeImplementation/runtimeAgentManifest.js";

const sampleTools = [
  tool("file.read", { family: "coreBase", group: "filesystem", description: "Read files." }),
  tool("patch.apply", { family: "coreBase", group: "edit", description: "Apply patches." }),
  tool("shell.run", { family: "coreBase", group: "shell", description: "Run shell commands." }),
  tool("web.fetch", { family: "coreBase", group: "web", description: "Fetch web pages." }),
  tool("mcp.use", { family: "agentBase", group: "mcp", description: "Call an MCP tool." }),
];

test("createBaseToolContextTree defaults to intelligent stable summaries", () => {
  const tree = createBaseToolContextTree(sampleTools, { includeToolMarkdown: false });

  assert.equal(baseToolContextFoldingDescriptor.executesTools, false);
  assert.equal(baseToolContextFoldingDescriptor.defaultMode, "intelligent");
  assert.equal(tree.mode, "intelligent");
  assert.equal(tree.mountedToolCount, 5);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:family:coreBase"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:coreBase:filesystem"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:summary:tool:file.read"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:file.read"), false);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:manual:tool:mcp.use"), false);
  assert.equal(tree.foldedNodeIds.includes("tool:file.read"), true);
});

test("createBaseToolContextTree expands all tools when requested", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "allOpen",
    includeToolMarkdown: false,
  });

  assert.equal(tree.materials.some((material) => material.id === "tool:file.read"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:coreBase:filesystem"), true);
  assert.equal(tree.expandedNodeIds.includes("tool:shell.run"), true);
});

test("createBaseToolContextTree supports fine, coarse, semi-auto, and none modes", () => {
  const fine = createBaseToolContextTree(sampleTools, {
    mode: "manualFine",
    manual: { toolIds: ["file.read"] },
    includeToolMarkdown: false,
  });
  assert.equal(fine.materials.some((material) => material.id === "tool:file.read"), true);
  assert.equal(fine.materials.some((material) => material.id === "tool:patch.apply"), false);

  const coarse = createBaseToolContextTree(sampleTools, {
    mode: "manualCoarse",
    manual: { groups: ["coreBase/shell"] },
    includeToolMarkdown: false,
  });
  assert.equal(coarse.materials.some((material) => material.id === "baseTool:context:group:coreBase:shell"), true);
  assert.equal(coarse.materials.some((material) => material.id === "tool:shell.run"), true);

  const semi = createBaseToolContextTree(sampleTools, {
    mode: "semiAuto",
    manual: { groups: ["coreBase/edit"] },
    auto: { toolIds: ["web.fetch"] },
    includeToolMarkdown: false,
  });
  assert.equal(semi.materials.some((material) => material.id === "tool:patch.apply"), true);
  assert.equal(semi.materials.some((material) => material.id === "tool:web.fetch"), true);

  const none = createBaseToolContextTree(sampleTools, { mode: "none" });
  assert.deepEqual(none.materials, []);
});

test("createBaseToolContextTree intelligent mode keeps all tool summaries stable without expanding manuals", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "intelligent",
    includeToolMarkdown: false,
  });

  assert.equal(tree.mode, "intelligent");
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:index"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:coreBase:filesystem"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:summary:tool:file.read"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:summary:tool:shell.run"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:manual:tool:file.read"), false);
  assert.equal(tree.materials.some((material) => material.id === "tool:file.read"), false);
  assert.match(
    tree.materials.find((material) => material.id === "baseTool:summary:tool:file.read")?.text ?? "",
    /toolId=file\.read; purpose=Read files\.; input=/u,
  );
});

test("createBaseToolContextTree intelligent mode injects only one requested concrete manual", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "intelligent",
    manual: {
      groups: ["coreBase/filesystem"],
      toolIds: ["file.read"],
    },
    includeToolMarkdown: false,
  });

  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:coreBase:filesystem"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:manual:tool:file.read"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:manual:tool:patch.apply"), false);
  assert.equal(tree.materials.some((material) => material.id === "tool:patch.apply"), false);
  assert.match(
    tree.materials.find((material) => material.id === "baseTool:manual:tool:file.read")?.text ?? "",
    /Use this tool only when its family, group, and input contract match/u,
  );
});

test("createBaseToolContextTree intelligent mode does not turn heat into persistent manuals", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "intelligent",
    usage: [{ toolId: "shell.run", count: 100 }],
    keepExpandedScore: 15,
    includeToolMarkdown: false,
  });

  assert.equal(tree.materials.some((material) => material.id === "baseTool:summary:tool:shell.run"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:manual:tool:shell.run"), false);
});

test("createBaseToolContextTree keeps hot tools expanded in auto mode", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    includeToolMarkdown: false,
    usage: [
      { toolId: "shell.run", count: 5 },
    ],
    keepExpandedScore: 15,
  });

  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:coreBase:shell"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.run"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:file.read"), false);
});

test("createBaseToolContextTree expands requested auto groups", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    auto: { groups: ["coreBase/shell"] },
    includeToolMarkdown: false,
  });

  assert.equal(tree.expandedNodeIds.includes("group:coreBase/shell"), true);
  assert.equal(tree.expandedNodeIds.includes("tool:shell.run"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.run"), true);
});

test("BaseTool folded context keeps MCP as family summary until explicitly expanded", () => {
  const folded = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    includeToolMarkdown: false,
  });
  assert.equal(folded.materials.some((material) => material.id === "baseTool:context:family:agentBase"), true);
  assert.equal(folded.materials.some((material) => material.id === "baseTool:context:group:agentBase:mcp"), false);
  assert.equal(folded.materials.some((material) => material.id === "tool:mcp.use"), false);

  const expanded = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    auto: { groups: ["agentBase/mcp"] },
    includeToolMarkdown: false,
  });
  assert.equal(expanded.materials.some((material) => material.id === "baseTool:context:group:agentBase:mcp"), true);
  assert.equal(expanded.materials.some((material) => material.id === "tool:mcp.use"), true);
  assert.equal(
    expanded.materials.find((material) => material.id === "tool:mcp.use")?.promptSegmentKind,
    "toolDeclarations",
  );
});

test("BaseTool context heat state is maintained per agent", () => {
  const initial = createBaseToolContextHeatState({
    agentId: "agent.repo",
    sessionId: "session-1",
    usage: [{ toolId: "shell.run", count: 2 }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const updated = applyBaseToolContextUsage(
    initial,
    [{ toolId: "shell.run" }, { toolId: "file.read", count: 3 }],
    "2026-01-01T00:01:00.000Z",
  );

  assert.equal(updated.agentId, "agent.repo");
  assert.equal(updated.sessionId, "session-1");
  assert.deepEqual(updated.usage, [
    { toolId: "file.read", count: 3 },
    { toolId: "shell.run", count: 3 },
  ]);

  const tree = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    includeToolMarkdown: false,
    usage: updated.usage,
    keepExpandedScore: 15,
  });
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.run"), true);
});
