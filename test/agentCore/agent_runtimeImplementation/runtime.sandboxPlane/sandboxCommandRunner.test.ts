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
import type {
  SandboxExecutionProviderPort,
  SandboxProviderRunRequest,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxPolicyMiddleware.js";
import { sandbox } from "../../../../src/runtimeImplementation/runtimeAgentManifest.js";

async function tempWorkspace(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "praxis-sandbox-test-"));
}

test("sandbox command plan routes bapr through fallback sandbox and yolo on workspace rollback", async () => {
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
  assert.equal(bapr.mode, "isolated");
  assert.equal(bapr.providerFamily, "workspace-rollback");
  assert.equal(bapr.filesystem.protectSecrets, false);
  assert.ok(bapr.workspaceRollback);

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

test("linux bubblewrap plan delegates secret protection facts to the sandbox provider", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.equal(plan.program, "true");
  assert.deepEqual(plan.args, []);
  assert.deepEqual(plan.filesystem.secretGlobs, [".env", ".env.*"]);
});

test("linux bubblewrap plan preserves host cwd for Raxcell provider lowering", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.equal(plan.cwd, subdir);
  assert.equal(plan.program, "pwd");
  await plan.cleanup?.();
});

test("linux bubblewrap readonly plan sends readonly filesystem facts to provider", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.equal(plan.filesystem.workspaceRoot, workspace);
  assert.equal(plan.filesystem.readonlyRoot, true);
  assert.deepEqual(plan.filesystem.allowedWriteRoots.map((root) => path.relative(workspace, root)), [
    ".rax_workspace/sandbox",
    ".rax_workspace/artifacts",
  ]);
  await plan.cleanup?.();
});

test("linux bubblewrap plan preserves external allowed roots for provider lowering", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.deepEqual(plan.filesystem.allowedReadRoots, [workspace, readRoot].map((root) => path.resolve(root)));
  assert.deepEqual(plan.filesystem.allowedWriteRoots, [writeRoot].map((root) => path.resolve(root)));
  await plan.cleanup?.();
});

test("linux bubblewrap plan preserves cwd inside an external allowed read root", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.equal(plan.cwd, externalCwd);
  assert.deepEqual(plan.filesystem.allowedReadRoots, [workspace, readRoot].map((root) => path.resolve(root)));
  await plan.cleanup?.();
});

test("linux bubblewrap plan keeps duplicate read/write roots explicit for provider policy", async () => {
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  assert.equal(plan.providerFamily, "linux-bubblewrap");
  assert.deepEqual(plan.filesystem.allowedReadRoots, [workspace, sharedRoot].map((root) => path.resolve(root)));
  assert.deepEqual(plan.filesystem.allowedWriteRoots, [sharedRoot].map((root) => path.resolve(root)));
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: [],
        missingDependencies: ["dependency.binary.raxcell"],
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

test("linux bubblewrap isolated command executes through configured sandbox provider", async () => {
  const workspace = await tempWorkspace();
  const seen: SandboxProviderRunRequest[] = [];
  const sandboxProvider: SandboxExecutionProviderPort = {
    providerId: "test-raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      seen.push(request);
      return {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        filesystemLowering: {
          declaredRoots: request.filesystem.read.map((root) => ({ path: root, access: "read", source: "declared" })),
          runtimeRoots: [],
          policyGrants: request.policyGrants,
          warnings: [],
        },
        backendArtifacts: [],
        metadata: {},
      };
    },
    async run(request) {
      return {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: `provider:${request.command.argv.join(" ")}`,
        stderr: "",
        timedOut: false,
        filesystemLowering: null,
        metadata: {},
      };
    },
  };

  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-provider",
    toolId: "shell.run",
    command: "sh",
    args: ["-lc", "printf should-not-local-spawn"],
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
  }, { sandboxProvider });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.policy.profile, "standard");
  assert.equal(seen[0]?.filesystem.read.includes(workspace), true);
  assert.match(result.stdout, /^provider:sh -lc/);
  assert.equal(result.metadata.providerId, "test-raxcell");
});

test("linux bubblewrap grants approved outside-path write gaps to the sandbox provider", async () => {
  const workspace = await tempWorkspace();
  const seen: SandboxProviderRunRequest[] = [];
  const sandboxProvider: SandboxExecutionProviderPort = {
    providerId: "test-raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      seen.push(request);
      if (request.policyGrants.length === 0) {
        return {
          kind: "runtime.sandboxPlane.provider.prepareRunResult",
          ok: false,
          providerFamily: "linux-bubblewrap",
          environmentGap: {
            reason: "path-outside-declared-roots",
            path: "/home/proview/helloRax.txt",
            required: ["write"],
            publicSafeMessage: "outside path write requires upper runtime grant",
          },
          denial: null,
          filesystemLowering: null,
          backendArtifacts: [],
          metadata: {},
        };
      }
      return {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        filesystemLowering: {
          declaredRoots: [],
          runtimeRoots: [],
          policyGrants: request.policyGrants,
          warnings: [],
        },
        backendArtifacts: [],
        metadata: {},
      };
    },
    async run(request) {
      const firstGrant = request.policyGrants[0];
      const grantedAccess = firstGrant?.access?.join(",") ?? "none";
      return {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: `provider:${grantedAccess}`,
        stderr: "",
        timedOut: false,
        filesystemLowering: null,
        metadata: {},
      };
    },
  };

  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-provider-write-gap",
    toolId: "shell.run",
    command: "sh",
    args: ["-lc", "printf ok > /home/proview/helloRax.txt"],
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
    approval: {
      accepted: true,
      grantedBy: "praxis-human-approval",
    },
  }, { sandboxProvider });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1]?.policyGrants, [{
    reason: "path-outside-declared-roots",
    path: "/home/proview/helloRax.txt",
    access: ["write"],
    grantedBy: "praxis-human-approval",
  }]);
  assert.equal(result.stdout, "provider:write");
});

test("linux bubblewrap rewrites approved HOME shell dynamic path gaps before provider lowering", async () => {
  const workspace = await tempWorkspace();
  const home = path.join(workspace, "home");
  const expectedPath = path.join(home, "raxcell_dynamic_test.txt");
  const seen: SandboxProviderRunRequest[] = [];
  const sandboxProvider: SandboxExecutionProviderPort = {
    providerId: "test-raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      seen.push(request);
      if (request.policyGrants.length === 0) {
        return {
          kind: "runtime.sandboxPlane.provider.prepareRunResult",
          ok: false,
          providerFamily: "linux-bubblewrap",
          environmentGap: {
            reason: "shell-dynamic-path-unresolved",
            path: "$HOME/raxcell_dynamic_test.txt",
            required: ["write"],
            publicSafeMessage: "dynamic shell path requires upper runtime handling",
          },
          denial: null,
          filesystemLowering: {
            declaredRoots: [],
            runtimeRoots: [],
            policyGrants: [],
            warnings: [{ code: "SHELL_DYNAMIC_PATH_UNRESOLVED", message: "cannot statically resolve $HOME/raxcell_dynamic_test.txt" }],
            effects: [{
              rawToken: "$HOME/raxcell_dynamic_test.txt",
              access: "write",
              command: "printf",
              reason: "shell-redirection",
              confidence: "medium",
              warning: "shell-dynamic-path-unresolved",
            }],
          },
          backendArtifacts: [],
          metadata: {},
        };
      }
      return {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        filesystemLowering: {
          declaredRoots: [],
          runtimeRoots: [],
          policyGrants: request.policyGrants,
          warnings: [],
        },
        backendArtifacts: [],
        metadata: {},
      };
    },
    async run(request) {
      return {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: request.command.argv.join(" "),
        stderr: "",
        timedOut: false,
        filesystemLowering: null,
        metadata: {},
      };
    },
  };

  const result = await runSandboxCommand({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    invocationId: "call-provider-dynamic-home",
    toolId: "shell.run",
    command: "sh",
    args: ["-lc", "printf ok > $HOME/raxcell_dynamic_test.txt"],
    cwd: workspace,
    env: { HOME: home },
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
        dependencyRefs: ["dependency.binary.raxcell"],
        availableDependencies: ["dependency.binary.raxcell"],
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
    approval: {
      accepted: true,
      grantedBy: "praxis-human-approval",
    },
  }, { sandboxProvider });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(seen.length, 2);
  assert.equal(seen[1]?.command.argv[2], `printf ok > ${expectedPath}`);
  assert.deepEqual(seen[1]?.policyGrants, [{
    reason: "shell-dynamic-path-unresolved",
    path: expectedPath,
    access: ["write"],
    grantedBy: "praxis-human-approval",
  }]);
  assert.equal(result.stdout, `sh -lc printf ok > ${expectedPath}`);
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
  assert.equal(result.rollback?.restored, true);
  assert.equal((result.metadata.workspaceRollbackDiff as { restored?: boolean } | undefined)?.restored, true);
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
