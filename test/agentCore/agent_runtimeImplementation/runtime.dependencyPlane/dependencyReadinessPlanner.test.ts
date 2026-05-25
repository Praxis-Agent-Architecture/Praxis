import assert from "node:assert/strict";
import test from "node:test";

import { planDependencyReadiness } from "../../../../src/runtimeImplementation/runtime.dependencyPlane/dependencyReadinessPlanner.js";
import type { DependencySourceRegistry } from "../../../../src/runtimeImplementation/runtime.dependencyPlane/dependencySourceRegistry.js";

const versionedRegistry: DependencySourceRegistry = {
  sources: [{
    dependencyId: "dependency.binary.versioned",
    sourceId: "test:versioned",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    versionCommand: {
      command: process.execPath,
      args: ["-e", "console.log('versioned 1.0.0')"],
    },
  }],
  warnings: [],
};

test("planDependencyReadiness defaults to observe mode for trusted managed dependencies", async () => {
  const result = await planDependencyReadiness({
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-observe",
      env: {
        PATH: "",
      },
    },
  });

  assert.equal(result.status, "requiresApproval");
  assert.deepEqual(result.installableDependencies, ["dependency.mcp.testServer.echo"]);
  assert.deepEqual(result.approvalRequiredDependencies, ["dependency.mcp.testServer.echo"]);
  assert.equal(result.steps[0]?.action, "approve");
  assert.equal(result.steps[0]?.approvalRequired, true);
});

test("planDependencyReadiness emits install only when prepareTrusted is explicit", async () => {
  const result = await planDependencyReadiness({
    mode: "prepareTrusted",
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-prepare",
      env: {
        PATH: "",
      },
    },
  });

  assert.equal(result.status, "installable");
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.equal(result.steps[0]?.action, "install");
  assert.equal(result.steps[0]?.approvalRequired, false);
});

test("planDependencyReadiness blocks required dependencies with unacceptable observed versions", async () => {
  const result = await planDependencyReadiness({
    declarations: [{
      dependencyId: "dependency.binary.versioned",
      kind: "binary",
      required: true,
      acceptedVersions: ["versioned 2.0.0"],
    }],
    registry: versionedRegistry,
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.missingDependencies, ["dependency.binary.versioned"]);
  assert.equal(result.steps[0]?.status, "blocked");
  assert.match(result.steps[0]?.reason ?? "", /versioned 1\.0\.0/u);
});

test("planDependencyReadiness honors disabled install policy for required dependencies", async () => {
  const result = await planDependencyReadiness({
    mode: "prepareTrusted",
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      install: "disabled",
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-disabled",
      env: {
        PATH: "",
      },
    },
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.installableDependencies, []);
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, ["dependency.mcp.testServer.echo"]);
  assert.equal(result.steps[0]?.action, "probe");
  assert.equal(result.steps[0]?.status, "blocked");
});

test("planDependencyReadiness requires approval for manual install policy even in prepareTrusted mode", async () => {
  const result = await planDependencyReadiness({
    mode: "prepareTrusted",
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      install: "manual",
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-manual",
      env: {
        PATH: "",
      },
    },
  });

  assert.equal(result.status, "requiresApproval");
  assert.deepEqual(result.installableDependencies, ["dependency.mcp.testServer.echo"]);
  assert.deepEqual(result.approvalRequiredDependencies, ["dependency.mcp.testServer.echo"]);
  assert.deepEqual(result.missingDependencies, []);
  assert.equal(result.steps[0]?.action, "approve");
  assert.equal(result.steps[0]?.approvalRequired, true);
});

test("planDependencyReadiness blocks dependency work when explicit allowed scopes omit required scopes", async () => {
  const result = await planDependencyReadiness({
    mode: "prepareTrusted",
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: true,
      requiredScopes: ["dependency.install.echo"],
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-scope",
      env: {
        PATH: "",
      },
      allowedScopes: [],
    },
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.installableDependencies, []);
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, ["dependency.mcp.testServer.echo"]);
  assert.equal(result.steps[0]?.action, "probe");
  assert.equal(result.steps[0]?.status, "blocked");
  assert.match(result.steps[0]?.reason ?? "", /dependency.install.echo/u);
});

test("planDependencyReadiness reports optional trusted managed dependencies without blocking readiness", async () => {
  const result = await planDependencyReadiness({
    declarations: [{
      dependencyId: "dependency.mcp.testServer.echo",
      kind: "mcp-server",
      required: false,
    }],
    context: {
      managedRoot: "/tmp/praxis-readiness-optional",
      env: {
        PATH: "",
      },
    },
  });

  assert.equal(result.status, "available");
  assert.deepEqual(result.installableDependencies, ["dependency.mcp.testServer.echo"]);
  assert.deepEqual(result.approvalRequiredDependencies, []);
  assert.deepEqual(result.missingDependencies, []);
  assert.deepEqual(result.unknownDependencies, []);
  assert.equal(result.steps[0]?.action, "none");
  assert.equal(result.steps[0]?.approvalRequired, false);
  assert.equal(result.steps[0]?.status, "installable");
});

test("planDependencyReadiness records optional unknown dependencies without changing readiness status", async () => {
  const result = await planDependencyReadiness({
    declarations: [{
      dependencyId: "dependency.optional.notRegistered",
      kind: "custom",
      required: false,
    }],
  });

  assert.equal(result.status, "available");
  assert.deepEqual(result.unknownDependencies, []);
  assert.equal(result.steps[0]?.status, "unknown");
  assert.equal(result.steps[0]?.approvalRequired, false);
});
