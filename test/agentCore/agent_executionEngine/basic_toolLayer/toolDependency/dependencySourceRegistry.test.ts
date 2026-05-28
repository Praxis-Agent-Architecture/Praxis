import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  dependencySourceRegistryDescriptor,
  lookupDependencySource,
  planDependencyInstallation,
} from "../../../../../src/executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.js";
import { officialRuntimeComponents } from "../../../../../src/runtimeImplementation/runtime.componentPlane/runtimeComponentRegistry.js";
import { probeDependency } from "../../../../../src/runtimeImplementation/runtime.dependencyPlane/dependencyProbeRunner.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.ts",
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
  assert.equal(result.plan.managedRoot, "/home/tester/.rax/tool-deps");
  assert.deepEqual(result.plan.steps[0]?.args, [
    "install",
    "--prefix",
    "/home/tester/.rax/tool-deps",
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

  assert.equal(result.plan.managedRoot, `${os.homedir()}/.rax/tool-deps`);
  assert.equal(result.plan.managedRoot.startsWith("~"), false);
});

test("managed dependency root ignores blank Praxis env before falling back", () => {
  const raxHome = planDependencyInstallation({
    dependencyId: "lsp.server.typescript-language-server",
    env: { PRAXIS_HOME: "", RAX_HOME: "/tmp/rax-home" },
    homeDir: "/tmp/ignored-home",
  });
  assert.equal(raxHome.ok, true);
  if (raxHome.ok) {
    assert.equal(raxHome.plan.managedRoot, "/tmp/rax-home/tool-deps");
  }

  const homeDir = planDependencyInstallation({
    dependencyId: "lsp.server.typescript-language-server",
    env: { PRAXIS_HOME: "", RAX_HOME: "" },
    homeDir: "/tmp/fallback-home",
  });
  assert.equal(homeDir.ok, true);
  if (homeDir.ok) {
    assert.equal(homeDir.plan.managedRoot, "/tmp/fallback-home/.rax/tool-deps");
  }
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

test("official runtime component dependencies are registered in the source registry", () => {
  for (const component of officialRuntimeComponents) {
    for (const dependency of component.dependencies) {
      const source = lookupDependencySource(dependency.dependencyId);
      assert.equal(source.ok, true, `${component.componentId} dependency ${dependency.dependencyId} should be registered`);
    }
  }
});

test("Playwright dependency source uses a managed npm install recipe", () => {
  const result = planDependencyInstallation({
    dependencyId: "dependency.npm.playwright",
    managedRoot: "/tmp/praxis-tool-deps",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.safety, "trusted-managed");
  assert.equal(result.plan.packageManager, "npm");
  assert.deepEqual(result.plan.steps[0]?.args, ["install", "--prefix", "/tmp/praxis-tool-deps", "playwright"]);
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
  assert.equal(source.source.executableName, "sh");
  assert.match(source.source.versionCommand?.args?.join(" ") ?? "", /xdg-desktop-portal/u);
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

test("probeDependency treats a failed version command as unavailable", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-probe-failed-version-"));
  const binDir = path.join(managedRoot, "bin");
  const executable = path.join(binDir, "fake-provider");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(executable, "#!/usr/bin/env sh\necho nope >&2\nexit 7\n", "utf8");
    await chmod(executable, 0o755);

    const result = await probeDependency({
      dependencyId: "dependency.runtime.fakeProvider",
      context: { managedRoot },
      source: {
        dependencyId: "dependency.runtime.fakeProvider",
        sourceId: "test:fake-provider",
        kind: "runtime",
        safety: "trusted-detect-only",
        packageManager: "detect-only",
        executableName: "fake-provider",
        versionCommand: { command: "fake-provider", args: ["--version"] },
      },
    });

    assert.equal(result.available, false);
    assert.equal(result.status, "missing");
    assert.equal(result.resolvedPath, executable);
    assert.match(result.message ?? "", /nope/u);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("probeDependency falls back after a failed managed candidate", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-probe-fallback-managed-"));
  const pathRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-probe-fallback-path-"));
  const brokenBinDir = path.join(managedRoot, "bin");
  const broken = path.join(brokenBinDir, "fake-provider");
  const working = path.join(pathRoot, "fake-provider");

  try {
    await mkdir(brokenBinDir, { recursive: true });
    await writeFile(broken, "#!/bin/sh\necho broken >&2\nexit 7\n", "utf8");
    await writeFile(working, "#!/bin/sh\necho fake-provider 1.2.3\n", "utf8");
    await chmod(broken, 0o755);
    await chmod(working, 0o755);

    const result = await probeDependency({
      dependencyId: "dependency.runtime.fakeProvider",
      context: {
        managedRoot,
        env: {
          PATH: pathRoot,
        },
      },
      source: {
        dependencyId: "dependency.runtime.fakeProvider",
        sourceId: "test:fake-provider",
        kind: "runtime",
        safety: "trusted-detect-only",
        packageManager: "detect-only",
        executableName: "fake-provider",
        versionCommand: { command: "fake-provider", args: ["--version"] },
      },
    });

    assert.equal(result.available, true);
    assert.equal(result.status, "available");
    assert.equal(result.resolvedPath, working);
    assert.equal(result.version, "fake-provider 1.2.3");
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
    await rm(pathRoot, { recursive: true, force: true });
  }
});

test("probeDependency runs source probe commands without requiring an executable name", async () => {
  const result = await probeDependency({
    dependencyId: "dependency.runtime.customProbeOnly",
    source: {
      dependencyId: "dependency.runtime.customProbeOnly",
      sourceId: "test:custom-probe-only",
      kind: "runtime",
      safety: "trusted-detect-only",
      packageManager: "detect-only",
      probe: {
        command: process.execPath,
        args: [
          "-e",
          "if (process.env.PRAXIS_PROBE_TOKEN !== 'ok') process.exit(9); console.log('probe ok');",
        ],
        env: { PRAXIS_PROBE_TOKEN: "ok" },
      },
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.status, "available");
  assert.equal(result.version, undefined);
});

test("probeDependency does not execute a candidate binary for probe-only sources", async () => {
  const managedRoot = await mkdtemp(path.join(os.tmpdir(), "praxis-probe-source-command-"));
  const binDir = path.join(managedRoot, "bin");
  const executable = path.join(binDir, "probe-target");
  const marker = path.join(managedRoot, "candidate-ran");

  try {
    await mkdir(binDir, { recursive: true });
    await writeFile(
      executable,
      `#!/usr/bin/env sh\ntouch ${JSON.stringify(marker)}\necho candidate should not run >&2\nexit 9\n`,
      "utf8",
    );
    await chmod(executable, 0o755);

    const result = await probeDependency({
      dependencyId: "dependency.runtime.customProbeWithExecutable",
      context: { managedRoot },
      source: {
        dependencyId: "dependency.runtime.customProbeWithExecutable",
        sourceId: "test:custom-probe-with-executable",
        kind: "runtime",
        safety: "trusted-detect-only",
        packageManager: "detect-only",
        executableName: "probe-target",
        probe: {
          command: process.execPath,
          args: ["-e", "console.log('probe ok');"],
        },
      },
    });

    assert.equal(result.available, true);
    assert.equal(result.status, "available");
    await assert.rejects(access(marker), /ENOENT/u);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});
