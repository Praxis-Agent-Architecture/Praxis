import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  dependencySourceRegistryDescriptor,
  lookupDependencySource,
  planDependencyInstallation,
} from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.md",
  testFileUrl: import.meta.url,
});

test("trusted managed dependency creates a Praxis managed install plan without TAP approval", () => {
  const result = planDependencyInstallation({
    dependencyId: "lsp.server.typescript-language-server",
    env: { XDG_CACHE_HOME: "/tmp/cache" },
    homeDir: "/home/tester",
  });

  assert.equal(result.ok, true);
  assert.equal(dependencySourceRegistryDescriptor.tapBypassForTrustedManaged, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.safety, "trusted-managed");
  assert.equal(result.plan.target, "praxis-managed");
  assert.equal(result.plan.approvalRequired, false);
  assert.equal(result.plan.managedRoot, "/tmp/cache/praxis/tool-deps");
  assert.deepEqual(result.plan.steps[0]?.args, [
    "install",
    "--prefix",
    "/tmp/cache/praxis/tool-deps",
    "typescript-language-server",
    "typescript",
  ]);
});

test("C# dependency source uses a managed dotnet tool install recipe", () => {
  const result = planDependencyInstallation({
    dependencyId: "lsp.server.csharp-ls",
    managedRoot: "/tmp/praxis-tool-deps",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.packageManager, "dotnet-tool");
  assert.equal(result.plan.approvalRequired, false);
  assert.deepEqual(result.plan.steps[0]?.args, ["tool", "install", "csharp-ls", "--tool-path", "/tmp/praxis-tool-deps/bin"]);
});

test("unregistered and detect-only dependencies do not get silent automatic install plans", () => {
  const missing = lookupDependencySource("lsp.server.not-real");
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "DEPENDENCY_SOURCE_NOT_FOUND");
  }

  const detectOnly = planDependencyInstallation({
    dependencyId: "lsp.server.jdtls",
    managedRoot: "/tmp/praxis-tool-deps",
  });
  assert.equal(detectOnly.ok, false);
  if (!detectOnly.ok) {
    assert.equal(detectOnly.error.code, "INSTALL_RECIPE_UNAVAILABLE");
  }
});
