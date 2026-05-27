import assert from "node:assert/strict";
import test from "node:test";

import { isRaxodeBackendReadiness } from "./readiness.js";

function validReadiness(overrides: Record<string, unknown> = {}) {
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
      expectedCoreToolIds: ["shell.run", "file.read"],
      mountedToolIds: ["shell.run", "file.read"],
    },
    dependencies: [{
      dependencyId: "dependency.binary.node",
      kind: "binary",
      required: true,
      install: "manual",
      reason: "Node.js runtime",
      degrade: "block-backend-start",
      probe: {
        status: "ready",
        observedVersion: "v22.22.3",
        resolvedPath: "/usr/bin/node",
        message: "ok",
        source: "process.version",
      },
    }],
    policy: {
      permissionProfile: "permissive",
      defaultMode: "permissive",
      approvalSurface: "application-layer",
    },
    ports: {
      approvalResolver: "default-policy",
      agentReviewResolver: "not-configured",
      contextArtifactAdapters: "not-configured",
      baseToolAdapters: "not-configured",
      authStateProvider: "not-configured",
      foundationProject: "not-configured",
      liveProviderResolver: "raxode-default",
    },
    sandbox: {
      profile: "host-observed",
      isolation: "host-observed",
      defaultExecution: "host-observed",
      fallback: "workspace-rollback",
    },
    moduleInventory: {
      kind: "raxode.backendModuleInventory",
      schemaVersion: "raxode.backendModuleInventory.v1",
      generatedAt: "2026-05-10T00:00:00.000Z",
      applicationId: "application.raxode.coding",
      agentId: "agent.raxode.coding",
      modules: [{
        moduleId: "basetool",
        status: "ready",
        surface: "harness.tools",
        owner: "praxis",
        summary: "ready",
        evidence: [],
      }],
    },
    areas: [{
      area: "tools",
      status: "ready",
      owner: "basetool",
      phase: "implemented",
      severity: "ok",
      summary: "tools ready",
      evidence: ["mounted=2"],
      facts: { mountedToolCount: 2 },
    }],
    ...overrides,
  };
}

test("readiness bridge accepts the complete backend readiness contract", () => {
  assert.equal(isRaxodeBackendReadiness(validReadiness()), true);
});

test("readiness bridge rejects readiness without tool facts", () => {
  const readiness = validReadiness({ tools: undefined });
  assert.equal(isRaxodeBackendReadiness(readiness), false);
});

test("readiness bridge rejects malformed dependency probes", () => {
  const readiness = validReadiness({
    dependencies: [{
      dependencyId: "dependency.binary.node",
      kind: "binary",
      required: true,
      probe: { status: 200 },
    }],
  });
  assert.equal(isRaxodeBackendReadiness(readiness), false);
});

test("readiness bridge rejects unknown sandbox execution modes", () => {
  const readiness = validReadiness({
    sandbox: {
      profile: "host-observed",
      isolation: "host-observed",
      defaultExecution: "magic",
      fallback: "workspace-rollback",
    },
  });
  assert.equal(isRaxodeBackendReadiness(readiness), false);
});
