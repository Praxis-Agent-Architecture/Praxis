import assert from "node:assert/strict";
import test from "node:test";

import {
  createBaseToolFactMatrixSnapshot,
  semanticBaseToolCatalog,
} from "../../../../src/basetool/index.js";

const coreToolIds = [
  "shell.run",
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "plan.update",
  "user.ask",
  "skill.load",
  "context.load",
  "mcp.use",
  "mcp.resources",
  "process.wait",
  "process.kill",
  "tool.discover",
  "tool.describe",
] as const;

test("baseTool fact matrix covers the single-agent core catalog without runtime decisions", () => {
  const matrix = createBaseToolFactMatrixSnapshot();

  assert.equal(matrix.surface, "basetool.factMatrix");
  assert.equal(matrix.version, "praxis.basetool.factMatrix.v1");
  assert.equal(matrix.total, 16);
  assert.deepEqual(matrix.profiles.map((row) => row.name), [
    "codingCore",
    "researchCore",
    "workCore",
    "runtimeCore",
    "agentCore",
    "fullCore",
  ]);
  assert.equal(matrix.profiles.find((row) => row.name === "workCore")?.extensionSlots.includes("pdf"), true);
  assert.deepEqual(matrix.catalog.map((row) => row.toolId), semanticBaseToolCatalog.map((tool) => tool.toolId));
  assert.deepEqual(matrix.catalog.map((row) => row.toolId), [...coreToolIds]);
  assert.equal(matrix.boundaries.oaoAuthoring.includes("does not execute side effects"), true);
  assert.equal(matrix.boundaries.runtime.includes("owns approvals and live resources"), true);
  assert.equal(matrix.boundaries.policy.includes("does not mutate tool contracts"), true);
});

test("baseTool fact matrix records OAO exposure separately from runtime-only facts", () => {
  const matrix = createBaseToolFactMatrixSnapshot();
  const codingVisible = matrix.exposure
    .filter((row) => row.profiles.includes("codingCore"))
    .map((row) => row.toolId);
  const runtimeOnly = matrix.exposure
    .filter((row) => row.runtimeOnly)
    .map((row) => row.toolId);

  assert.deepEqual(codingVisible, [
    "shell.run",
    "file.read",
    "file.search",
    "patch.apply",
    "web.search",
    "web.fetch",
    "plan.update",
    "user.ask",
    "skill.load",
    "context.load",
  ]);
  assert.deepEqual(runtimeOnly, ["process.wait", "process.kill", "tool.discover", "tool.describe"]);
});

test("baseTool fact matrix exposes runtime ports and sandbox hints as facts", () => {
  const matrix = createBaseToolFactMatrixSnapshot();
  const byToolId = new Map(matrix.runtimePorts.map((row) => [row.toolId, row]));
  const riskByToolId = new Map(matrix.risk.map((row) => [row.toolId, row]));

  assert.deepEqual(byToolId.get("file.read")?.runtimePorts, ["filesystem.readText"]);
  assert.deepEqual(byToolId.get("mcp.resources")?.runtimePorts, ["mcp.listResources", "mcp.readResource"]);
  assert.equal(riskByToolId.get("file.read")?.sandboxHint.filesystem, "read");
  assert.equal(riskByToolId.get("patch.apply")?.sandboxHint.filesystem, "write");
  assert.equal(riskByToolId.get("web.search")?.sandboxHint.network, "egress");
  assert.equal(riskByToolId.get("shell.run")?.sandboxHint.process, "spawn");
  assert.equal(riskByToolId.get("process.kill")?.sandboxHint.process, "control");
});

test("baseTool fact matrix can record live evidence without baking provider policy into tools", () => {
  const matrix = createBaseToolFactMatrixSnapshot({
    liveProvenToolIds: ["file.read", "tool.describe"],
  });
  const byToolId = new Map(matrix.verification.map((row) => [row.toolId, row]));

  assert.equal(byToolId.get("file.read")?.currentEvidence.liveToolCall, "manual-live-proven");
  assert.equal(byToolId.get("tool.describe")?.currentEvidence.liveToolCall, "manual-live-proven");
  assert.equal(byToolId.get("shell.run")?.currentEvidence.liveToolCall, "not-recorded");
  assert.equal(byToolId.get("process.kill")?.liveToolCallRequired, false);
});
