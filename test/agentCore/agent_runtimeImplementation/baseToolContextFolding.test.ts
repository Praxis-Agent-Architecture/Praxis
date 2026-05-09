import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBaseToolContextUsage,
  createBaseToolContextTree,
  createBaseToolContextHeatState,
  baseToolContextFoldingDescriptor,
} from "../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolContextFolding.js";
import { tool } from "../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

const sampleTools = [
  tool("code.read", { family: "codeBase", group: "explore", description: "Read files." }),
  tool("code.modify", { family: "codeBase", group: "edit", description: "Modify files." }),
  tool("shell.commandExecution", { family: "shellBase", group: "shellExecution", description: "Run shell commands." }),
  tool("git.getRepositoryStatus", { family: "gitBase", group: "inspection", description: "Read git status." }),
  tool("mcp.callTool", { family: "mcpBase", group: "toolInvocation", description: "Call an MCP tool." }),
];

test("createBaseToolContextTree defaults to folded family-level context", () => {
  const tree = createBaseToolContextTree(sampleTools, { includeToolMarkdown: false });

  assert.equal(baseToolContextFoldingDescriptor.executesTools, false);
  assert.equal(tree.mode, "autoFolded");
  assert.equal(tree.mountedToolCount, 5);
  assert.deepEqual(tree.materials.map((material) => material.id), [
    "baseTool:context:index",
    "baseTool:context:family:codeBase",
    "baseTool:context:family:gitBase",
    "baseTool:context:family:mcpBase",
    "baseTool:context:family:shellBase",
  ]);
  assert.equal(tree.materials.some((material) => material.id === "tool:code.read"), false);
  assert.equal(tree.materials.some((material) => material.id === "tool:mcp.callTool"), false);
  assert.equal(tree.foldedNodeIds.includes("tool:code.read"), true);
});

test("createBaseToolContextTree expands all tools when requested", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "allOpen",
    includeToolMarkdown: false,
  });

  assert.equal(tree.materials.some((material) => material.id === "tool:code.read"), true);
  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:codeBase:explore"), true);
  assert.equal(tree.expandedNodeIds.includes("tool:shell.commandExecution"), true);
});

test("createBaseToolContextTree supports fine, coarse, semi-auto, and none modes", () => {
  const fine = createBaseToolContextTree(sampleTools, {
    mode: "manualFine",
    manual: { toolIds: ["code.read"] },
    includeToolMarkdown: false,
  });
  assert.equal(fine.materials.some((material) => material.id === "tool:code.read"), true);
  assert.equal(fine.materials.some((material) => material.id === "tool:code.modify"), false);

  const coarse = createBaseToolContextTree(sampleTools, {
    mode: "manualCoarse",
    manual: { families: ["shellBase"] },
    includeToolMarkdown: false,
  });
  assert.equal(coarse.materials.some((material) => material.id === "baseTool:context:group:shellBase:shellExecution"), true);
  assert.equal(coarse.materials.some((material) => material.id === "tool:shell.commandExecution"), true);

  const semi = createBaseToolContextTree(sampleTools, {
    mode: "semiAuto",
    manual: { families: ["codeBase"] },
    auto: { toolIds: ["git.getRepositoryStatus"] },
    includeToolMarkdown: false,
  });
  assert.equal(semi.materials.some((material) => material.id === "tool:code.modify"), true);
  assert.equal(semi.materials.some((material) => material.id === "tool:git.getRepositoryStatus"), true);

  const none = createBaseToolContextTree(sampleTools, { mode: "none" });
  assert.deepEqual(none.materials, []);
});

test("createBaseToolContextTree keeps hot tools expanded in auto mode", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    includeToolMarkdown: false,
    usage: [
      { toolId: "shell.commandExecution", count: 5 },
    ],
    keepExpandedScore: 15,
  });

  assert.equal(tree.materials.some((material) => material.id === "baseTool:context:group:shellBase:shellExecution"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.commandExecution"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:code.read"), false);
});

test("createBaseToolContextTree expands requested auto groups", () => {
  const tree = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    auto: { groups: ["shellBase/shellExecution"] },
    includeToolMarkdown: false,
  });

  assert.equal(tree.expandedNodeIds.includes("group:shellBase/shellExecution"), true);
  assert.equal(tree.expandedNodeIds.includes("tool:shell.commandExecution"), true);
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.commandExecution"), true);
});

test("BaseTool folded context keeps MCP as family summary until explicitly expanded", () => {
  const folded = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    includeToolMarkdown: false,
  });
  assert.equal(folded.materials.some((material) => material.id === "baseTool:context:family:mcpBase"), true);
  assert.equal(folded.materials.some((material) => material.id === "baseTool:context:group:mcpBase:toolInvocation"), false);
  assert.equal(folded.materials.some((material) => material.id === "tool:mcp.callTool"), false);

  const expanded = createBaseToolContextTree(sampleTools, {
    mode: "autoFolded",
    auto: { groups: ["mcpBase/toolInvocation"] },
    includeToolMarkdown: false,
  });
  assert.equal(expanded.materials.some((material) => material.id === "baseTool:context:group:mcpBase:toolInvocation"), true);
  assert.equal(expanded.materials.some((material) => material.id === "tool:mcp.callTool"), true);
  assert.equal(
    expanded.materials.find((material) => material.id === "tool:mcp.callTool")?.promptSegmentKind,
    "toolDeclarations",
  );
});

test("BaseTool context heat state is maintained per agent", () => {
  const initial = createBaseToolContextHeatState({
    agentId: "agent.repo",
    sessionId: "session-1",
    usage: [{ toolId: "shell.commandExecution", count: 2 }],
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const updated = applyBaseToolContextUsage(
    initial,
    [{ toolId: "shell.commandExecution" }, { toolId: "code.read", count: 3 }],
    "2026-01-01T00:01:00.000Z",
  );

  assert.equal(updated.agentId, "agent.repo");
  assert.equal(updated.sessionId, "session-1");
  assert.deepEqual(updated.usage, [
    { toolId: "code.read", count: 3 },
    { toolId: "shell.commandExecution", count: 3 },
  ]);

  const tree = createBaseToolContextTree(sampleTools, {
    includeToolMarkdown: false,
    usage: updated.usage,
    keepExpandedScore: 15,
  });
  assert.equal(tree.materials.some((material) => material.id === "tool:shell.commandExecution"), true);
});
