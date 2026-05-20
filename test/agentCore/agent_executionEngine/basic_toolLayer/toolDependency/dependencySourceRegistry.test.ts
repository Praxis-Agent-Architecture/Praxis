import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";
import {
  dependencySourceRegistryDescriptor,
  lookupDependencySource,
  planDependencyInstallation,
} from "../../../../../src/agentCore_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.md",
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

test("managed dependency root falls back to the real user cache, not a literal project ~/ path", () => {
  const result = planDependencyInstallation({
    dependencyId: "lsp.server.typescript-language-server",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.managedRoot, `${os.homedir()}/.cache/praxis/tool-deps`);
  assert.equal(result.plan.managedRoot.startsWith("~"), false);
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

test("common BaseTool host dependencies are registered without silent system install", () => {
  const commonDependencyIds = [
    "runtime.binary.rg",
    "binary:bwrap",
    "runtime.binary.ffmpeg",
    "runtime.binary.imagemagick",
    "runtime.binary.xdotool",
    "runtime.binary.ydotool",
    "runtime.desktop.screenshotProvider.linux",
    "mcp.testServer.echo",
  ];

  for (const dependencyId of commonDependencyIds) {
    const source = lookupDependencySource(dependencyId);
    assert.equal(source.ok, true, `${dependencyId} should be registered`);
  }

  const bwrapPlan = planDependencyInstallation({
    dependencyId: "binary:bwrap",
    managedRoot: "/tmp/praxis-tool-deps",
  });
  assert.equal(bwrapPlan.ok, false);
  if (!bwrapPlan.ok) {
    assert.equal(bwrapPlan.error.code, "INSTALL_RECIPE_UNAVAILABLE");
  }

  const rgPlan = planDependencyInstallation({
    dependencyId: "runtime.binary.rg",
    managedRoot: "/tmp/praxis-tool-deps",
  });
  assert.equal(rgPlan.ok, false);
  if (!rgPlan.ok) {
    assert.equal(rgPlan.error.code, "INSTALL_RECIPE_UNAVAILABLE");
  }
});

test("Linux desktop screenshot provider is registered as a generic detect-only dependency", () => {
  const source = lookupDependencySource("runtime.desktop.screenshotProvider.linux");
  assert.equal(source.ok, true);
  if (!source.ok) {
    return;
  }

  assert.equal(source.source.safety, "trusted-detect-only");
  assert.equal(source.source.packageManager, "detect-only");
  assert.equal(source.source.executableName, "python3");
  assert.match(source.source.versionCommand?.args?.join(" ") ?? "", /gtk-launch/u);
  assert.match(source.source.versionCommand?.args?.join(" ") ?? "", /grim/u);
  assert.match(source.source.versionCommand?.args?.join(" ") ?? "", /gnome-screenshot/u);

  const plan = planDependencyInstallation({
    dependencyId: "runtime.desktop.screenshotProvider.linux",
    managedRoot: "/tmp/praxis-tool-deps",
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.error.code, "INSTALL_RECIPE_UNAVAILABLE");
  }
});
