import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectSandboxRuntimeMountMatrix,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxMountMatrix.js";
import {
  sandbox,
  type SandboxSpec,
} from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";
import type {
  SandboxRuntimePrepareResult,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxRuntimeProvider.js";

function prepared(input: {
  sandbox: SandboxSpec;
  ready: boolean;
  status: SandboxRuntimePrepareResult["probe"]["status"];
  message: string;
  providerFamily?: SandboxRuntimePrepareResult["providerFamily"];
  metadata?: Readonly<Record<string, unknown>>;
}): SandboxRuntimePrepareResult {
  const providerFamily = input.providerFamily ?? input.sandbox.providerFamily ?? "host-observed";
  return {
    providerFamily,
    profile: input.sandbox.profile,
    ready: input.ready,
    probe: {
      providerFamily,
      profile: input.sandbox.profile,
      status: input.status,
      platform: process.platform,
      dependencyRefs: providerFamily === "linux-bubblewrap" ? ["dependency.binary.raxcell"] : [],
      availableDependencies: input.ready && providerFamily === "linux-bubblewrap" ? ["dependency.binary.raxcell"] : [],
      missingDependencies: input.ready || providerFamily !== "linux-bubblewrap" ? [] : ["dependency.binary.raxcell"],
      dependencyChecks: [],
      dependencyInstallEnvelopes: [],
      selfRepairHints: [],
      nextAction: input.ready ? "none" : "manualProviderSetup",
      publicSafeMessage: input.message,
      metadata: input.metadata ?? {},
    },
    events: [input.ready ? "runtime.sandboxPlane.provider.ready" : "runtime.sandboxPlane.provider.notReady"],
  };
}

test("sandbox runtime mount matrix treats injected Raxcell as execution evidence while Praxis owns policy", async () => {
  const spec = sandbox.linuxBubblewrapReadonly();
  const matrix = await inspectSandboxRuntimeMountMatrix({
    sandbox: spec,
    policyProfile: "standard",
    preparedSandbox: prepared({
      sandbox: spec,
      ready: true,
      status: "available",
      message: "Injected Raxcell provider is available",
      providerFamily: "linux-bubblewrap",
      metadata: { injectedProvider: true },
    }),
    sandboxProviderInjected: true,
    toolId: "shell.run",
  });

  assert.equal(matrix.surface, "runtime.sandboxPlane.mountMatrix");
  assert.equal(matrix.status, "ready");
  assert.equal(matrix.provider.evidenceStatus, "injected");
  assert.equal(matrix.raxcell.policyOwner, "praxis");
  assert.equal(matrix.raxcell.providerRole, "environment-and-execution");
  assert.equal(matrix.baseToolSandboxPlan.effectiveMode, "isolated");
  assert.equal(matrix.baseToolSandboxPlan.status, "ready");
  assert.equal(matrix.commandPlanPreview.providerFamily, "linux-bubblewrap");
  assert.equal(matrix.commandPlanPreview.executesCommand, false);
});

test("sandbox runtime mount matrix degrades missing Raxcell provider instead of reporting isolated ready", async () => {
  const spec = sandbox.linuxBubblewrapReadonly();
  const matrix = await inspectSandboxRuntimeMountMatrix({
    sandbox: spec,
    policyProfile: "standard",
    preparedSandbox: prepared({
      sandbox: spec,
      ready: false,
      status: "missingDependency",
      message: "Raxcell provider is missing",
      providerFamily: "linux-bubblewrap",
    }),
    toolId: "shell.run",
  });

  assert.equal(matrix.status, "degraded");
  assert.equal(matrix.provider.evidenceStatus, "missing");
  assert.equal(matrix.baseToolSandboxPlan.requestedMode, "isolated");
  assert.equal(matrix.baseToolSandboxPlan.effectiveMode, "workspace-rollback");
  assert.equal(matrix.baseToolSandboxPlan.status, "degraded");
  assert.equal(matrix.commandPlanPreview.providerFamily, "workspace-rollback");
  assert.equal(matrix.falseReadyGuards.strongSandboxRequiresReadyProvider, true);
});

test("sandbox runtime mount matrix reports host-observed as governed host mode, not isolation", async () => {
  const spec = sandbox.hostObserved();
  const matrix = await inspectSandboxRuntimeMountMatrix({
    sandbox: spec,
    policyProfile: "standard",
    toolId: "shell.run",
    preparedSandbox: prepared({
      sandbox: spec,
      ready: true,
      status: "available",
      message: "host observed is available",
      providerFamily: "host-observed",
    }),
  });

  assert.equal(matrix.status, "degraded");
  assert.equal(matrix.sandbox.hostObserved, true);
  assert.equal(matrix.sandbox.isolationEvidence, "governed-host-observation");
  assert.equal(matrix.baseToolSandboxPlan.effectiveMode, "workspace-rollback");
  assert.equal(matrix.commandPlanPreview.providerFamily, "workspace-rollback");
  assert.equal(matrix.falseReadyGuards.hostObservedNeverClaimsIsolation, true);
});
