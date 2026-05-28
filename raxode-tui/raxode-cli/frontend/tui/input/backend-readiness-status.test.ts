import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBackendModuleGapsLine,
  formatBackendModuleStatusLine,
  parseBackendReadinessDigestLine,
} from "./backend-readiness-status.js";

const runtimePorts = {
  approvalResolver: "default-policy",
  agentReviewResolver: "not-configured",
  contextArtifactAdapters: "not-configured",
  baseToolAdapters: "not-configured",
  authStateProvider: "not-configured",
  foundationProject: "not-configured",
  liveProviderResolver: "raxode-default",
};

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    kind: "raxode.backendReadiness",
    schemaVersion: "raxode.backendReadiness.v1",
    generatedAt: "2026-05-10T00:00:00.000Z",
    applicationId: "application.raxode.coding",
    agentId: "agent.raxode.coding",
    promptPackId: "promptpack.raxode.coding",
    permissionProfile: "permissive",
    toolProfile: "agentCore",
    sandboxProfile: "host-observed",
    sessionPersistence: "sqlite",
    storageKind: "sqlite",
    model: {
      provider: "openai",
      endpointShape: "responses",
      model: "gpt-5.5",
      providerRoute: "openai_responses",
    },
    tools: {
      expectedCoreToolIds: ["shell.run"],
      mountedToolIds: ["shell.run"],
    },
    dependencies: [{
      dependencyId: "dependency.binary.node",
      kind: "binary",
      required: true,
      install: "manual",
      reason: "node runtime",
      degrade: "block-backend-start",
    }],
    policy: {
      permissionProfile: "permissive",
      defaultMode: "permissive",
      approvalSurface: "application-layer",
    },
    ports: runtimePorts,
    sandbox: {
      profile: "host-observed",
      isolation: "host-observed",
      defaultExecution: "host-observed",
      fallback: "workspace-rollback",
    },
    areas: [],
    moduleInventory: {
      kind: "raxode.backendModuleInventory",
      schemaVersion: "raxode.backendModuleInventory.v1",
      generatedAt: "2026-05-10T00:00:00.000Z",
      applicationId: "application.raxode.coding",
      agentId: "agent.raxode.coding",
      modules: [],
    },
    ...overrides,
  };
}

test("backend readiness status helpers parse module inventory lines", () => {
  const digest = parseBackendReadinessDigestLine(`backend readiness: ${JSON.stringify(readiness({
    areas: [{
      area: "tools",
      status: "ready",
      owner: "basetool",
      phase: "implemented",
      severity: "ok",
      summary: "tools ready",
      evidence: [],
      facts: {},
    }],
    moduleInventory: {
      kind: "raxode.backendModuleInventory",
      schemaVersion: "raxode.backendModuleInventory.v1",
      generatedAt: "2026-05-10T00:00:00.000Z",
      applicationId: "application.raxode.coding",
      agentId: "agent.raxode.coding",
      modules: [
        {
          moduleId: "basetool",
          status: "ready",
          surface: "harness.tools",
          owner: "praxis",
          summary: "ready",
          evidence: [],
        },
        {
          moduleId: "context",
          status: "passive-ready",
          surface: "harness.context",
          owner: "raxode-application",
          summary: "passive",
          evidence: [],
        },
        {
          moduleId: "dependency",
          status: "contract-ready",
          surface: "manifest.dependencies",
          owner: "runtime",
          summary: "contract",
          evidence: [],
        },
      ],
    },
  }))}`);

  assert.ok(digest);
  assert.equal(formatBackendModuleStatusLine(digest), "modules=ready · ready=1 · passive=1 · contract=1");
  assert.equal(formatBackendModuleGapsLine(digest), "none");
});

test("backend readiness status helpers report module gaps", () => {
  const digest = parseBackendReadinessDigestLine(`backend readiness: ${JSON.stringify(readiness({
    areas: [{
      area: "dependency",
      status: "degraded",
      owner: "dependencyPlane",
      phase: "implemented",
      severity: "warning",
      summary: "dependency degraded",
      evidence: [],
      facts: {},
    }],
    moduleInventory: {
      kind: "raxode.backendModuleInventory",
      schemaVersion: "raxode.backendModuleInventory.v1",
      generatedAt: "2026-05-10T00:00:00.000Z",
      applicationId: "application.raxode.coding",
      agentId: "agent.raxode.coding",
      modules: [
        {
          moduleId: "dependency",
          status: "degraded",
          surface: "manifest.dependencies",
          owner: "runtime",
          summary: "degraded",
          evidence: [],
        },
        {
          moduleId: "sandbox",
          status: "missing",
          surface: "manifest.sandbox",
          owner: "runtime",
          summary: "missing",
          evidence: [],
        },
      ],
    },
  }))}`);

  assert.ok(digest);
  assert.equal(formatBackendModuleStatusLine(digest), "modules=blocked · ready=0 · passive=0 · contract=0");
  assert.equal(formatBackendModuleGapsLine(digest), "sandbox=missing, dependency=degraded");
});

test("backend readiness status helpers tolerate absent or malformed readiness", () => {
  assert.equal(parseBackendReadinessDigestLine("direct ready: test"), null);
  assert.equal(parseBackendReadinessDigestLine("backend readiness: nope"), null);
  assert.equal(parseBackendReadinessDigestLine(`backend readiness: ${JSON.stringify(readiness({
    ports: { ...runtimePorts, liveProviderResolver: "not-configured" },
    areas: [],
  }))}`), null);
  assert.equal(formatBackendModuleStatusLine(null), "not reported");
  assert.equal(formatBackendModuleGapsLine(null), "none reported");
});
