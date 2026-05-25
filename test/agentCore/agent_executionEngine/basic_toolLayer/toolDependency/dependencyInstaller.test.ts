import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureDependencyAvailable } from "../../../../../src/executionEngine/basic_toolLayer/toolDependency/dependencyInstaller.js";
import { ensureDependencyAvailable as ensureRuntimeDependencyAvailable } from "../../../../../src/runtimeImplementation/runtime.dependencyPlane/dependencyInstaller.js";

test("runtime dependency installer writes project lock for already available managed dependencies", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-lock-existing-"));
  const binDir = path.join(managedRoot, "bin");
  const executableName = "existing-language-server";
  const executablePath = path.join(binDir, executableName);
  const lockPath = path.join(managedRoot, "workspace", "config", "dependency-lock.json");

  await mkdir(binDir, { recursive: true });
  await writeFile(
    executablePath,
    "#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('existing-language-server 3.0.0'); process.exit(0); }\n",
    { encoding: "utf8", mode: 0o755 },
  );
  await chmod(executablePath, 0o755);

  try {
    const result = await ensureRuntimeDependencyAvailable({
      dependencyId: "lsp.server.existing-language-server",
      allowInstall: true,
      context: {
        managedRoot,
        projectLockPath: lockPath,
      },
      source: {
        dependencyId: "lsp.server.existing-language-server",
        sourceId: "test:existing-language-server",
        displayName: "Existing language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName,
        versionCommand: { command: executableName, args: ["--version"] },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.status, "available");

    const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
      entries: Record<string, { lockedVersion?: string; resolvedPathRef?: string; sourceId?: string }>;
    };
    assert.equal(lock.entries["lsp.server.existing-language-server"]?.sourceId, "test:existing-language-server");
    assert.equal(lock.entries["lsp.server.existing-language-server"]?.lockedVersion, "existing-language-server 3.0.0");
    assert.equal(lock.entries["lsp.server.existing-language-server"]?.resolvedPathRef, executablePath);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("ensureDependencyAvailable installs a trusted managed dependency and writes managed state", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-"));
  const fakePackageManager = path.join(managedRoot, "fake-pm.js");
  const fakeExecutableName = "fake-language-server";

  await writeFile(
    fakePackageManager,
    `#!/usr/bin/env node
const fs = await import("node:fs/promises");
const path = await import("node:path");
const managedRoot = process.argv[2];
const binDir = process.argv[3];
const executableName = process.argv[4];
await fs.mkdir(binDir, { recursive: true });
await fs.writeFile(
  path.join(binDir, executableName),
  "#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('fake-language-server 1.2.3'); process.exit(0); }\\n",
  "utf8",
);
await fs.chmod(path.join(binDir, executableName), 0o755);
await fs.writeFile(path.join(managedRoot, "installed.txt"), "ok\\n", "utf8");
`,
    "utf8",
  );
  await chmod(fakePackageManager, 0o755);

  try {
    const result = await ensureDependencyAvailable({
      dependencyId: "lsp.server.fake-language-server",
      managedRoot,
      source: {
        dependencyId: "lsp.server.fake-language-server",
        sourceId: "test:fake-language-server",
        displayName: "Fake language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName: fakeExecutableName,
        versionCommand: { command: fakeExecutableName, args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: [fakePackageManager, "{managedRoot}", "{binDir}", fakeExecutableName],
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.availability.installedNow, true);
    assert.equal(result.availability.resolvedPath, path.join(managedRoot, "bin", fakeExecutableName));

    const state = JSON.parse(await readFile(path.join(managedRoot, "state.json"), "utf8")) as {
      records: Record<string, { resolvedPath?: string; status?: string }>;
    };
    assert.equal(state.records["lsp.server.fake-language-server"]?.resolvedPath, path.join(managedRoot, "bin", fakeExecutableName));
    assert.equal(state.records["lsp.server.fake-language-server"]?.status, "installed");
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("ensureDependencyAvailable probes npm --prefix executables from node_modules .bin", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-npm-"));
  const fakePackageManager = path.join(managedRoot, "fake-npm.js");
  const executableName = "fake-npm-language-server";

  await writeFile(
    fakePackageManager,
    `#!/usr/bin/env node
const fs = await import("node:fs/promises");
const path = await import("node:path");
const prefixIndex = process.argv.indexOf("--prefix");
const managedRoot = process.argv[prefixIndex + 1];
const binDir = path.join(managedRoot, "node_modules", ".bin");
await fs.mkdir(binDir, { recursive: true });
await fs.writeFile(
  path.join(binDir, "${executableName}"),
  "#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('fake-npm-language-server 2.0.0'); process.exit(0); }\\n",
  "utf8",
);
await fs.chmod(path.join(binDir, "${executableName}"), 0o755);
`,
    "utf8",
  );
  await chmod(fakePackageManager, 0o755);

  try {
    const result = await ensureDependencyAvailable({
      dependencyId: "lsp.server.fake-npm-language-server",
      managedRoot,
      source: {
        dependencyId: "lsp.server.fake-npm-language-server",
        sourceId: "test:fake-npm-language-server",
        displayName: "Fake npm language server",
        safety: "trusted-managed",
        packageManager: "npm",
        executableName,
        versionCommand: { command: executableName, args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: [fakePackageManager, "install", "--prefix", "{managedRoot}", "fake-npm-language-server"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.availability.installedNow, true);
    assert.equal(
      result.availability.resolvedPath,
      path.join(managedRoot, "node_modules", ".bin", executableName),
    );
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("ensureDependencyAvailable installs the official MCP echo managed binary", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-mcp-"));

  try {
    const result = await ensureDependencyAvailable({
      dependencyId: "mcp.testServer.echo",
      managedRoot,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.availability.installedNow, true);
    assert.equal(result.availability.resolvedPath, path.join(managedRoot, "bin", "praxis-mcp-echo"));
    assert.match(result.availability.version ?? "", /praxis-mcp-echo 0\.1\.0/u);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("runtime dependency installer merges install recipe env over context env", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-env-"));

  try {
    const result = await ensureRuntimeDependencyAvailable({
      dependencyId: "lsp.server.env-language-server",
      allowInstall: true,
      context: {
        managedRoot,
        env: { PRAXIS_INSTALL_TOKEN: "context-token" },
      },
      source: {
        dependencyId: "lsp.server.env-language-server",
        sourceId: "test:env-language-server",
        displayName: "Env language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName: "env-language-server",
        versionCommand: { command: "env-language-server", args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: [
            "-e",
            [
              "const fs=require('node:fs');",
              "const path=require('node:path');",
              "if (process.env.PRAXIS_INSTALL_TOKEN !== 'recipe-token') {",
              "  console.error(`bad token ${process.env.PRAXIS_INSTALL_TOKEN ?? '<missing>'}`);",
              "  process.exit(9);",
              "}",
              "const binDir=process.argv[1];",
              "fs.mkdirSync(binDir,{recursive:true});",
              "const target=path.join(binDir,'env-language-server');",
              "fs.writeFileSync(target,\"#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('env-language-server 1.0.0'); process.exit(0); }\\n\",{mode:0o755});",
            ].join(""),
            "{binDir}",
          ],
          env: { PRAXIS_INSTALL_TOKEN: "recipe-token" },
        },
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.installedNow, true);
    assert.equal(result.value.version, "env-language-server 1.0.0");
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("runtime dependency installer reports corrupt managed state as a public-safe error", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-corrupt-state-"));
  await writeFile(path.join(managedRoot, "state.json"), "{not-json", "utf8");

  try {
    const result = await ensureRuntimeDependencyAvailable({
      dependencyId: "lsp.server.corrupt-state-language-server",
      allowInstall: true,
      context: {
        managedRoot,
      },
      source: {
        dependencyId: "lsp.server.corrupt-state-language-server",
        sourceId: "test:corrupt-state-language-server",
        displayName: "Corrupt state language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName: "corrupt-state-language-server",
        versionCommand: { command: "corrupt-state-language-server", args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: [
            "-e",
            [
              "const fs=require('node:fs');",
              "const path=require('node:path');",
              "const binDir=process.argv[1];",
              "fs.mkdirSync(binDir,{recursive:true});",
              "const target=path.join(binDir,'corrupt-state-language-server');",
              "fs.writeFileSync(target,\"#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('corrupt-state-language-server 1.0.0'); process.exit(0); }\\n\",{mode:0o755});",
            ].join(""),
            "{binDir}",
          ],
        },
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "DEPENDENCY_STATE_WRITE_FAILED");
      assert.equal(result.error.publicSafe, true);
      assert.match(result.error.message, /Invalid JSON/u);
    }
    assert.equal(await readFile(path.join(managedRoot, "state.json"), "utf8"), "{not-json");
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("ensureDependencyAvailable honors allowInstall false on the compatibility wrapper", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-no-install-"));
  const marker = path.join(managedRoot, "should-not-install");

  try {
    const result = await ensureDependencyAvailable({
      dependencyId: "lsp.server.no-install-language-server",
      allowInstall: false,
      managedRoot,
      source: {
        dependencyId: "lsp.server.no-install-language-server",
        sourceId: "test:no-install-language-server",
        displayName: "No install language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName: "no-install-language-server",
        versionCommand: { command: "no-install-language-server", args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: ["-e", `await import("node:fs/promises").then((fs) => fs.writeFile(${JSON.stringify(marker)}, "installed"))`],
        },
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "DEPENDENCY_INSTALL_NOT_ALLOWED");
    }
    await assert.rejects(readFile(marker, "utf8"), /ENOENT/u);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("runtime dependency installer times out hung install steps", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-tool-deps-timeout-"));

  try {
    const started = Date.now();
    const result = await ensureRuntimeDependencyAvailable({
      dependencyId: "lsp.server.hanging-language-server",
      allowInstall: true,
      context: {
        managedRoot,
        installTimeoutMs: 25,
      },
      source: {
        dependencyId: "lsp.server.hanging-language-server",
        sourceId: "test:hanging-language-server",
        displayName: "Hanging language server",
        safety: "trusted-managed",
        packageManager: "manual",
        executableName: "hanging-language-server",
        versionCommand: { command: "hanging-language-server", args: ["--version"] },
        managedInstall: {
          command: process.execPath,
          args: ["-e", "setTimeout(() => {}, 10_000);"],
        },
      },
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "DEPENDENCY_INSTALL_FAILED");
      assert.match(result.error.message, /timed out/u);
    }
    assert.ok(Date.now() - started < 5_000);
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});
