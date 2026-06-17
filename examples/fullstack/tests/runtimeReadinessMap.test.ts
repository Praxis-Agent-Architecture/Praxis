import assert from "node:assert/strict";
import test from "node:test";

import { buildRuntimeReadinessMap } from "../application/runtimeReadinessMap.js";

test("runtime readiness map turns repo inspector evidence into business-facing gaps", () => {
  const report = buildRuntimeReadinessMap({
    surfaceInspectionStatus: "ready",
    missingRequiredSurfaceIds: [],
    degradedSurfaceIds: [],
    mcpMountStatus: "ready",
    mcpMissingPortCount: 0,
    sandboxMountStatus: "ready",
    sandboxProviderPrepared: true,
    toolFindingCount: 0,
    promptCacheWarningCount: 0,
    sessionStatus: "completed",
    runtimeResultOk: true,
  });

  assert.equal(report.kind, "praxis.runtime.readinessMap.v1");
  assert.equal(report.status, "ready");
  assert.equal(report.summary.ready, 5);
  assert.equal(report.summary.evidenceGap, 0);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.highestRisk, "low");
  assert.deepEqual(
    report.gaps.map((gap) => gap.surface),
    [
      "application management plane",
      "MCP and MCP+ runtime adapter",
      "sandbox and execution substrate",
      "skill plane and BaseTool readiness",
      "runtime smoke evidence",
    ],
  );
  assert.ok(report.gaps.every((gap) => gap.evidence.length > 0));
  assert.ok(report.gaps.every((gap) => gap.nextAction.length > 0));
});

test("runtime readiness map highlights blocked business readiness when smoke evidence fails", () => {
  const report = buildRuntimeReadinessMap({
    surfaceInspectionStatus: "degraded",
    missingRequiredSurfaceIds: ["runtime.applicationSurface"],
    degradedSurfaceIds: ["runtime.officialModuleSurface"],
    mcpMountStatus: "degraded",
    mcpMissingPortCount: 2,
    sandboxMountStatus: "ready",
    sandboxProviderPrepared: true,
    toolFindingCount: 1,
    promptCacheWarningCount: 1,
    sessionStatus: "failed",
    runtimeResultOk: false,
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.summary.blocked, 3);
  assert.equal(report.summary.highestRisk, "high");
  assert.equal(report.gaps[0]?.status, "blocked");
  assert.equal(report.gaps[1]?.status, "blocked");
  assert.equal(report.gaps[4]?.status, "blocked");
  assert.match(report.gaps[0]?.nextAction ?? "", /business-scenario management-plane smoke/);
});
