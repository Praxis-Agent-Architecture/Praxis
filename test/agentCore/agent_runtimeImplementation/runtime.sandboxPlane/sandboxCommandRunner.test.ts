import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createLocalSandboxRemoteWorkerAdapter,
  createSandboxCommandPlan,
  runSandboxCommand,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxCommandRunner.js";
import {
  createWorkspaceRollbackSandboxPlan,
  createWorkspaceRollbackSnapshot,
  finalizeWorkspaceRollbackSnapshot,
  restoreWorkspaceRollbackSnapshot,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/workspaceRollbackSandbox.js";
import { sandbox } from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";

async function tempWorkspace(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "praxis-sandbox-test-"));
}

test("sandbox command plan keeps bapr on host-observed and yolo on workspace rollback", async () => {
  const workspace = await tempWorkspace();
  const bapr = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-1",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.hostObserved(),
    policyProfile: "bapr",
  });
  assert.equal(bapr.mode, "none");
  assert.equal(bapr.providerFamily, "host-observed");
  assert.equal(bapr.filesystem.protectSecrets, false);

  const yolo = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-2",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.hostObserved(),
    policyProfile: "yolo",
  });
  assert.equal(yolo.mode, "workspace-rollback");
  assert.equal(yolo.providerFamily, "workspace-rollback");
  assert.equal(yolo.filesystem.protectSecrets, false);
  assert.ok(yolo.workspaceRollback);
});

test("sandbox command plan protects secrets for standard isolated policy", async () => {
  const workspace = await tempWorkspace();
  await writeFile(path.join(workspace, ".env"), "TOKEN=root\n", "utf8");
  await writeFile(path.join(workspace, ".env.local"), "TOKEN=local\n", "utf8");
  await mkdir(path.join(workspace, "nested"), { recursive: true });
  await writeFile(path.join(workspace, "nested", ".env"), "TOKEN=nested\n", "utf8");
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-3",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
  });
  assert.equal(plan.mode, "isolated");
  assert.equal(plan.filesystem.protectSecrets, true);
  if (plan.providerFamily === "linux-bubblewrap") {
    const args = plan.args.join("\n");
    assert.match(args, /\/workspace\/\.env/u);
    assert.match(args, /\/workspace\/\.env\.local/u);
    assert.match(args, /\/workspace\/nested\/\.env/u);
  }
});

test("linux bubblewrap plan maps workspace subdirectory cwd into sandbox cwd", async () => {
  if (process.platform !== "linux") return;
  const workspace = await tempWorkspace();
  const subdir = path.join(workspace, "packages", "app");
  await mkdir(subdir, { recursive: true });
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-cwd",
    toolId: "shell.run",
    command: "pwd",
    cwd: subdir,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
    filesystem: { workspaceRoot: workspace },
  });
  const chdirIndex = plan.args.indexOf("--chdir");
  assert.notEqual(chdirIndex, -1);
  assert.equal(plan.args[chdirIndex + 1], "/workspace/packages/app");
  await plan.cleanup?.();
});

test("linux bubblewrap readonly plan does not remount workspace root writable", async () => {
  if (process.platform !== "linux") return;
  const workspace = await tempWorkspace();
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-readonly-root",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
    filesystem: { workspaceRoot: workspace },
  });
  const rootMountFlags = plan.args
    .map((arg, index) => arg === workspace && plan.args[index + 1] === "/workspace" ? String(plan.args[index - 1]) : "")
    .filter((flag) => flag.length > 0);
  assert.deepEqual(rootMountFlags, ["--ro-bind"]);
  await plan.cleanup?.();
});

test("linux bubblewrap plan mounts external allowed roots with the requested access", async () => {
  if (process.platform !== "linux") return;
  const workspace = await tempWorkspace();
  const readRoot = await tempWorkspace();
  const writeRoot = await tempWorkspace();
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-external-roots",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
    filesystem: {
      workspaceRoot: workspace,
      allowedReadRoots: [workspace, readRoot],
      allowedWriteRoots: [writeRoot],
    },
  });
  const readIndex = plan.args.findIndex((arg, index) => arg === "--ro-bind-try" && plan.args[index + 1] === readRoot && plan.args[index + 2] === readRoot);
  const writeIndex = plan.args.findIndex((arg, index) => arg === "--bind-try" && plan.args[index + 1] === writeRoot && plan.args[index + 2] === writeRoot);
  assert.notEqual(readIndex, -1);
  assert.notEqual(writeIndex, -1);
  assert.equal(plan.args.some((arg, index) => arg === "--bind-try" && plan.args[index + 1] === readRoot), false);
  await plan.cleanup?.();
});

test("linux bubblewrap plan maps cwd inside an external allowed read root", async () => {
  if (process.platform !== "linux") return;
  const workspace = await tempWorkspace();
  const readRoot = await tempWorkspace();
  const externalCwd = path.join(readRoot, "nested");
  await mkdir(externalCwd, { recursive: true });
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-external-cwd",
    toolId: "shell.run",
    command: "pwd",
    cwd: externalCwd,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
    filesystem: {
      workspaceRoot: workspace,
      allowedReadRoots: [workspace, readRoot],
      allowedWriteRoots: [],
    },
  });
  const chdirIndex = plan.args.indexOf("--chdir");
  assert.notEqual(chdirIndex, -1);
  assert.equal(plan.args[chdirIndex + 1], externalCwd);
  await plan.cleanup?.();
});

test("linux bubblewrap plan gives write roots precedence over duplicate read roots", async () => {
  if (process.platform !== "linux") return;
  const workspace = await tempWorkspace();
  const sharedRoot = await tempWorkspace();
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-duplicate-root",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: true,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "available",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: ["dependency.binary.bwrap"],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
    filesystem: {
      workspaceRoot: workspace,
      allowedReadRoots: [workspace, sharedRoot],
      allowedWriteRoots: [sharedRoot],
    },
  });
  assert.equal(plan.args.some((arg, index) => arg === "--ro-bind-try" && plan.args[index + 1] === sharedRoot), false);
  assert.ok(plan.args.some((arg, index) => arg === "--bind-try" && plan.args[index + 1] === sharedRoot && plan.args[index + 2] === sharedRoot));
  await plan.cleanup?.();
});

test("linux bubblewrap isolated command fails closed when provider is not ready", async () => {
  const workspace = await tempWorkspace();
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-bwrap-unready",
    toolId: "shell.run",
    command: process.execPath,
    args: ["-e", "process.stdout.write('should-not-run')"],
    cwd: workspace,
    sandbox: sandbox.linuxBubblewrapReadonly(),
    preparedSandbox: {
      providerFamily: "linux-bubblewrap",
      profile: "linux-bubblewrap",
      ready: false,
      probe: {
        providerFamily: "linux-bubblewrap",
        profile: "linux-bubblewrap",
        status: "missingDependency",
        platform: process.platform,
        dependencyRefs: ["dependency.binary.bwrap"],
        availableDependencies: [],
        missingDependencies: ["dependency.binary.bwrap"],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "installDependency",
        publicSafeMessage: "bwrap missing",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SANDBOX_COMMAND_FAILED");
  assert.match(result.error.message, /linux-bubblewrap sandbox is not ready/u);
  assert.equal(result.stdout, undefined);
});

test("remote-worker sandbox fails closed when no adapter is configured", async () => {
  const workspace = await tempWorkspace();
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-remote-missing",
    toolId: "shell.run",
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: workspace,
    sandbox: sandbox.remoteWorker(),
    preparedSandbox: {
      providerFamily: "remote-worker",
      profile: "remote-worker",
      ready: true,
      probe: {
        providerFamily: "remote-worker",
        profile: "remote-worker",
        status: "available",
        platform: process.platform,
        dependencyRefs: [],
        availableDependencies: [],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "ready",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SANDBOX_DENIED");
  assert.equal(result.error.denial?.code, "SANDBOX_PROVIDER_UNAVAILABLE");
});

test("sandbox command runner returns after timeout even when process ignores SIGTERM", async () => {
  const workspace = await tempWorkspace();
  const startedAt = Date.now();
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-timeout",
    toolId: "process.run",
    command: process.execPath,
    args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
    cwd: workspace,
    timeoutMs: 50,
    sandbox: sandbox.hostObserved(),
    policyProfile: "bapr",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.exitCode, 124);
  assert.equal(result.metadata.timedOut, true);
  assert.match(result.stderr, /timed out/u);
  assert.ok(Date.now() - startedAt < 2_000);
});

test("sandbox command runner truncates output by UTF-8 bytes", async () => {
  const workspace = await tempWorkspace();
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-truncate",
    toolId: "process.run",
    command: process.execPath,
    args: ["-e", "process.stdout.write('你好abcdef')"],
    cwd: workspace,
    maxOutputBytes: 4,
    sandbox: sandbox.hostObserved(),
    policyProfile: "bapr",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stdout, "你");
  assert.ok(Buffer.byteLength(result.stdout, "utf8") <= 4);
});

test("workspace rollback snapshots, diffs, and restores changed files", async () => {
  const workspace = await tempWorkspace();
  const target = path.join(workspace, "notes.txt");
  await writeFile(target, "before\n", "utf8");
  const plan = createWorkspaceRollbackSandboxPlan({
    workspaceRoot: workspace,
    sessionId: "session-1",
    invocationId: "call-rollback",
  });
  const snapshot = await createWorkspaceRollbackSnapshot(plan);
  await writeFile(target, "after\n", "utf8");
  await writeFile(path.join(workspace, "created.txt"), "created\n", "utf8");
  const diff = await finalizeWorkspaceRollbackSnapshot(snapshot);
  assert.equal(diff.changedFiles.length, 2);
  assert.ok(diff.changedFiles.some((file) => file.path === "notes.txt" && file.change === "modified" && file.restorable));
  assert.ok(diff.changedFiles.some((file) => file.path === "created.txt" && file.change === "created" && file.restorable));
  await restoreWorkspaceRollbackSnapshot(snapshot, diff);
  assert.equal(await readFile(target, "utf8"), "before\n");
  await assert.rejects(readFile(path.join(workspace, "created.txt"), "utf8"));
});

test("workspace rollback tracks ordinary generated workspace directories", async () => {
  const workspace = await tempWorkspace();
  const tracked = ["dist/out.txt", "build/out.txt", ".next/cache.txt", ".venv/state.txt"];
  for (const relative of tracked) {
    await mkdir(path.dirname(path.join(workspace, relative)), { recursive: true });
    await writeFile(path.join(workspace, relative), "before\n", "utf8");
  }
  const plan = createWorkspaceRollbackSandboxPlan({
    workspaceRoot: workspace,
    sessionId: "session-1",
    invocationId: "call-generated-dirs",
  });
  const snapshot = await createWorkspaceRollbackSnapshot(plan);
  for (const relative of tracked) {
    await writeFile(path.join(workspace, relative), "after\n", "utf8");
  }
  const diff = await finalizeWorkspaceRollbackSnapshot(snapshot);
  for (const relative of tracked) {
    assert.ok(diff.changedFiles.some((file) => file.path === relative && file.change === "modified"), `${relative} should be tracked`);
  }
  await restoreWorkspaceRollbackSnapshot(snapshot, diff);
  for (const relative of tracked) {
    assert.equal(await readFile(path.join(workspace, relative), "utf8"), "before\n");
  }
});

test("workspace rollback restores symlinks and removes created empty directories", async () => {
  const workspace = await tempWorkspace();
  const target = path.join(workspace, "target.txt");
  await writeFile(target, "target\n", "utf8");
  await symlink("target.txt", path.join(workspace, "link.txt"));
  const plan = createWorkspaceRollbackSandboxPlan({
    workspaceRoot: workspace,
    sessionId: "session-1",
    invocationId: "call-symlink-dir",
  });
  const snapshot = await createWorkspaceRollbackSnapshot(plan);
  await mkdir(path.join(workspace, "empty-created"), { recursive: true });
  await writeFile(path.join(workspace, "other.txt"), "other\n", "utf8");
  await symlink("other.txt", path.join(workspace, "created-link.txt"));
  await rm(path.join(workspace, "link.txt"));
  await writeFile(path.join(workspace, "link.txt"), "replaced regular file\n", "utf8");
  const diff = await finalizeWorkspaceRollbackSnapshot(snapshot);
  assert.ok(diff.changedFiles.some((file) => file.path === "empty-created" && file.change === "created"));
  assert.ok(diff.changedFiles.some((file) => file.path === "created-link.txt" && file.change === "created"));
  assert.ok(diff.changedFiles.some((file) => file.path === "link.txt" && file.change === "modified" && file.before?.fileType === "symlink"));
  await restoreWorkspaceRollbackSnapshot(snapshot, diff);
  await assert.rejects(lstat(path.join(workspace, "empty-created")));
  await assert.rejects(lstat(path.join(workspace, "created-link.txt")));
  assert.equal((await lstat(path.join(workspace, "link.txt"))).isSymbolicLink(), true);
  assert.equal(await readlink(path.join(workspace, "link.txt")), "target.txt");
});

test("workspace rollback restores a directory replaced by a file", async () => {
  const workspace = await tempWorkspace();
  await mkdir(path.join(workspace, "docs"), { recursive: true });
  const plan = createWorkspaceRollbackSandboxPlan({
    workspaceRoot: workspace,
    sessionId: "session-1",
    invocationId: "call-dir-replaced",
  });
  const snapshot = await createWorkspaceRollbackSnapshot(plan);
  await rm(path.join(workspace, "docs"), { recursive: true, force: true });
  await writeFile(path.join(workspace, "docs"), "file now\n", "utf8");
  const diff = await finalizeWorkspaceRollbackSnapshot(snapshot);
  assert.ok(diff.changedFiles.some((file) => file.path === "docs" && file.change === "modified" && file.before?.fileType === "directory"));
  await restoreWorkspaceRollbackSnapshot(snapshot, diff);
  assert.equal((await lstat(path.join(workspace, "docs"))).isDirectory(), true);
});

test("workspace rollback runner restores workspace after failed command", async () => {
  const workspace = await tempWorkspace();
  const target = path.join(workspace, "run.txt");
  await writeFile(target, "before\n", "utf8");
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-runner",
    toolId: "shell.run",
    command: "sh",
    args: ["-lc", "printf after > run.txt; exit 2"],
    cwd: workspace,
    sandbox: sandbox.hostObserved(),
    policyProfile: "yolo",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.exitCode, 2);
  assert.ok(result.rollback?.changedFiles.some((file) => file.path === "run.txt"));
  assert.equal(await readFile(target, "utf8"), "before\n");
});

test("macOS Seatbelt profile escapes workspace and write root paths", async () => {
  const workspace = path.join(await tempWorkspace(), "quote\"slash\\dir");
  const writeRoot = path.join(workspace, "write\"root\\child");
  await mkdir(writeRoot, { recursive: true });
  const plan = await createSandboxCommandPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-seatbelt",
    toolId: "shell.run",
    command: "true",
    cwd: workspace,
    sandbox: sandbox.macosContainerization(),
    policyProfile: "standard",
    filesystem: {
      workspaceRoot: workspace,
      allowedReadRoots: [workspace],
      allowedWriteRoots: [writeRoot],
    },
  });
  const profile = String(plan.metadata.seatbeltProfile ?? "");
  assert.match(profile, /quote\\"slash\\\\dir/u);
  assert.match(profile, /write\\"root\\\\child/u);
  assert.doesNotMatch(profile, /^\(allow file-read\*\)$/mu);
});

test("remote-worker sandbox provider uses injected adapter protocol", async () => {
  const workspace = await tempWorkspace();
  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-remote",
    toolId: "shell.run",
    command: process.execPath,
    args: ["-e", "process.stdout.write('remote-worker:isolated')"],
    cwd: workspace,
    sandbox: sandbox.remoteWorker(),
    preparedSandbox: {
      providerFamily: "remote-worker",
      profile: "remote-worker",
      ready: true,
      probe: {
        providerFamily: "remote-worker",
        profile: "remote-worker",
        status: "contractOnly",
        platform: process.platform,
        dependencyRefs: [],
        availableDependencies: [],
        missingDependencies: [],
        dependencyChecks: [],
        dependencyInstallEnvelopes: [],
        selfRepairHints: [],
        nextAction: "none",
        publicSafeMessage: "remote worker injected",
        metadata: {},
      },
      events: [],
    },
    policyProfile: "standard",
  }, {
    remoteWorker: createLocalSandboxRemoteWorkerAdapter({ workerId: "unit-local-worker" }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stdout, "remote-worker:isolated");
  assert.equal(result.metadata.workerId, "unit-local-worker");
  assert.ok(result.events.includes("runtime.sandboxPlane.remoteWorker.localAdapter.completed"));
});
