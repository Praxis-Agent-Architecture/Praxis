import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureDependencyAvailable } from "../../../../../src/executionEngine/basic_toolLayer/toolDependency/dependencyInstaller.js";

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
