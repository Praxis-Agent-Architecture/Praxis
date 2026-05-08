/*
 * 文件定位：Agent 运行态实现层 / 沙箱运行面。
 * 核心目的：把 SandboxSpec 从声明扩展为可探测、可解释、可 smoke 的 provider adapter。
 * 边界：本文件不替代 BaseTool 语义；工具执行仍然必须走 registry/handler/executor。
 */

import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  SandboxProviderFamily,
  SandboxSpec,
} from "../runtimeAgentManifest.js";

const execFileAsync = promisify(execFile);

export type SandboxRuntimeProviderStatus =
  | "available"
  | "missingDependency"
  | "contractOnly"
  | "unsupportedPlatform"
  | "smokeFailed";

export type SandboxRuntimeProviderAction =
  | "none"
  | "installDependency"
  | "chooseDifferentProfile"
  | "routeRemoteWorker"
  | "manualProviderSetup";

export type SandboxRuntimeProviderProbe = {
  providerFamily: SandboxProviderFamily;
  profile: SandboxSpec["profile"];
  status: SandboxRuntimeProviderStatus;
  platform: NodeJS.Platform;
  dependencyRefs: readonly string[];
  availableDependencies: readonly string[];
  missingDependencies: readonly string[];
  dependencyChecks: readonly SandboxRuntimeDependencyCheck[];
  dependencyInstallEnvelopes: readonly SandboxRuntimeDependencyInstallEnvelope[];
  selfRepairHints: readonly SandboxRuntimeSelfRepairHint[];
  nextAction: SandboxRuntimeProviderAction;
  publicSafeMessage: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxRuntimeDependencyInstallEnvelope = {
  envelopeId: string;
  dependencyId: string;
  providerFamily: SandboxProviderFamily;
  action: "installDependency";
  installTarget: "system-global" | "provider-managed" | "manual";
  commandPreview: readonly string[];
  requiresApproval: true;
  approvalSurface: "interface/application";
  publicSafe: true;
  message: string;
};

export type SandboxRuntimeDependencyCheck = {
  dependencyId: string;
  required: boolean;
  status: "available" | "missing" | "unknown" | "contractOnly";
  source: "binary" | "kernel" | "linux-security" | "container-runtime" | "platform" | "remote" | "custom";
  installTarget: "system-global" | "provider-managed" | "manual" | "none";
  publicSafeMessage: string;
};

export type SandboxRuntimeSelfRepairHint = {
  hintId: string;
  severity: "info" | "warning" | "error";
  action: SandboxRuntimeProviderAction;
  message: string;
  commandPreview?: readonly string[];
  requiresApproval: boolean;
};

export type SandboxRuntimeSmokeResult = {
  providerFamily: SandboxProviderFamily;
  profile: SandboxSpec["profile"];
  status: "passed" | "skipped" | "failed";
  commandPreview: readonly string[];
  checks?: readonly SandboxRuntimeSmokeCheck[];
  stdout?: string;
  stderr?: string;
  publicSafeMessage: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxRuntimeSmokeCheck = {
  checkId: string;
  status: "passed" | "failed" | "skipped";
  publicSafeMessage: string;
};

export type SandboxRuntimePrepareResult = {
  providerFamily: SandboxProviderFamily;
  profile: SandboxSpec["profile"];
  ready: boolean;
  probe: SandboxRuntimeProviderProbe;
  smoke?: SandboxRuntimeSmokeResult;
  events: readonly string[];
};

export type SandboxRuntimeProvider = {
  providerFamily: SandboxProviderFamily;
  probe(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe>;
  prepare(spec: SandboxSpec, input?: { cwd?: string; runSmoke?: boolean }): Promise<SandboxRuntimePrepareResult>;
  runSmoke(spec: SandboxSpec, input?: { cwd?: string }): Promise<SandboxRuntimeSmokeResult>;
  explainUnavailable(probe: SandboxRuntimeProviderProbe): string;
};

export const sandboxRuntimeProviderDescriptor = {
  surface: "runtime.sandboxPlane",
  capability: "sandboxRuntimeProvider",
  purpose: "probe, prepare, and smoke-test SandboxSpec providers without bypassing runtime governance",
  linuxLiveProvider: "linux-bubblewrap",
  unsafeSideEffects: false,
} as const;

function providerFamilyFor(spec: SandboxSpec): SandboxProviderFamily {
  if (spec.providerFamily !== undefined) return spec.providerFamily;
  if (spec.profile === "host-observed") return "host-observed";
  if (spec.profile === "workspace-only" || spec.profile === "workspace") return "workspace-policy";
  return spec.profile;
}

function dependencyRefsFor(spec: SandboxSpec): readonly string[] {
  const refs = spec.dependencyRefs ?? [];
  if (providerFamilyFor(spec) === "linux-bubblewrap" && refs.length === 0) {
    return ["binary:bwrap"];
  }
  return refs;
}

function dependencyBinary(ref: string): string | undefined {
  if (!ref.startsWith("binary:")) return undefined;
  return ref.slice("binary:".length).split("|")[0]?.trim() || undefined;
}

async function binaryAvailable(binary: string): Promise<boolean> {
  try {
    await execFileAsync(binary, ["--version"], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

async function binaryCheck(ref: string, required = true): Promise<SandboxRuntimeDependencyCheck> {
  const binary = dependencyBinary(ref);
  if (binary === undefined) {
    return {
      dependencyId: ref,
      required,
      status: "unknown",
      source: "custom",
      installTarget: "manual",
      publicSafeMessage: `${ref} is not a binary dependency ref`,
    };
  }
  const available = await binaryAvailable(binary);
  return {
    dependencyId: ref,
    required,
    status: available ? "available" : "missing",
    source: "binary",
    installTarget: "system-global",
    publicSafeMessage: available ? `${binary} is available` : `${binary} is missing`,
  };
}

async function readTrimmed(filePath: string): Promise<string | undefined> {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    return undefined;
  }
}

async function linuxOptionalChecks(): Promise<readonly SandboxRuntimeDependencyCheck[]> {
  if (process.platform !== "linux") return [];

  const userns = await readTrimmed("/proc/sys/kernel/unprivileged_userns_clone");
  const seccompStatus = await readTrimmed("/proc/self/status");
  const cgroupControllers = await readTrimmed("/sys/fs/cgroup/cgroup.controllers");
  const appArmorProfile = await readTrimmed("/sys/kernel/security/apparmor/profiles");
  const selinuxEnforce = await readTrimmed("/sys/fs/selinux/enforce");

  return [
    {
      dependencyId: "kernel:userns",
      required: false,
      status: userns === undefined ? "unknown" : userns === "1" ? "available" : "missing",
      source: "kernel",
      installTarget: "manual",
      publicSafeMessage: userns === "1" ? "unprivileged user namespaces appear enabled" : "unprivileged user namespace status is not confirmed",
    },
    {
      dependencyId: "kernel:seccomp",
      required: false,
      status: seccompStatus?.includes("\nSeccomp:") || seccompStatus?.startsWith("Seccomp:") ? "available" : "unknown",
      source: "kernel",
      installTarget: "manual",
      publicSafeMessage: "seccomp availability is reported as an optional sandbox hardening signal",
    },
    {
      dependencyId: "kernel:cgroup2",
      required: false,
      status: cgroupControllers === undefined ? "unknown" : "available",
      source: "kernel",
      installTarget: "manual",
      publicSafeMessage: cgroupControllers === undefined ? "cgroup v2 controller list is not visible" : "cgroup v2 controllers are visible",
    },
    {
      dependencyId: "linux-security:apparmor",
      required: false,
      status: appArmorProfile === undefined ? "unknown" : "available",
      source: "linux-security",
      installTarget: "manual",
      publicSafeMessage: appArmorProfile === undefined ? "AppArmor profile list is not visible" : "AppArmor profiles are visible",
    },
    {
      dependencyId: "linux-security:selinux",
      required: false,
      status: selinuxEnforce === undefined ? "unknown" : "available",
      source: "linux-security",
      installTarget: "manual",
      publicSafeMessage: selinuxEnforce === undefined ? "SELinux enforcement state is not visible" : "SELinux enforcement state is visible",
    },
  ];
}

function repairHints(input: {
  providerFamily: SandboxProviderFamily;
  missingDependencies: readonly string[];
  status: SandboxRuntimeProviderStatus;
}): readonly SandboxRuntimeSelfRepairHint[] {
  if (input.status === "available") {
    return [{
      hintId: `${input.providerFamily}:ready`,
      severity: "info",
      action: "none",
      message: `${input.providerFamily} sandbox is ready`,
      requiresApproval: false,
    }];
  }
  if (input.missingDependencies.includes("binary:bwrap")) {
    return [{
      hintId: "linux-bubblewrap:install-bwrap",
      severity: "warning",
      action: "installDependency",
      message: "Install bubblewrap through the system package manager, then rerun rax test.",
      commandPreview: ["apt install bubblewrap", "dnf install bubblewrap", "pacman -S bubblewrap"],
      requiresApproval: true,
    }];
  }
  return [{
    hintId: `${input.providerFamily}:manual-setup`,
    severity: input.status === "contractOnly" ? "info" : "warning",
    action: input.status === "contractOnly" ? "manualProviderSetup" : "chooseDifferentProfile",
    message: `${input.providerFamily} requires a provider adapter or a different sandbox profile`,
    requiresApproval: false,
  }];
}

function dependencyInstallEnvelopes(input: {
  providerFamily: SandboxProviderFamily;
  missingDependencies: readonly string[];
}): readonly SandboxRuntimeDependencyInstallEnvelope[] {
  return input.missingDependencies.map((dependencyId) => ({
    envelopeId: `${input.providerFamily}:${dependencyId}:install`,
    dependencyId,
    providerFamily: input.providerFamily,
    action: "installDependency",
    installTarget: dependencyId === "binary:bwrap" ? "system-global" : "manual",
    commandPreview: dependencyId === "binary:bwrap"
      ? ["apt install bubblewrap", "dnf install bubblewrap", "pacman -S bubblewrap"]
      : [],
    requiresApproval: true,
    approvalSurface: "interface/application",
    publicSafe: true,
    message: `${dependencyId} requires external approval before installation`,
  }));
}

async function dependencyAvailability(refs: readonly string[]): Promise<{
  available: readonly string[];
  missing: readonly string[];
}> {
  const available: string[] = [];
  const missing: string[] = [];

  for (const ref of refs) {
    const binary = dependencyBinary(ref);
    if (binary === undefined) {
      missing.push(ref);
      continue;
    }
    if (await binaryAvailable(binary)) {
      available.push(ref);
    } else {
      missing.push(ref);
    }
  }

  return { available, missing };
}

function unsupported(providerFamily: SandboxProviderFamily, spec: SandboxSpec, message: string): SandboxRuntimeProviderProbe {
  const dependencyRefs = dependencyRefsFor(spec);
  return {
    providerFamily,
    profile: spec.profile,
    status: "unsupportedPlatform",
    platform: process.platform,
    dependencyRefs,
    availableDependencies: [],
    missingDependencies: dependencyRefs,
    dependencyChecks: dependencyRefs.map((dependencyId) => ({
      dependencyId,
      required: true,
      status: "missing",
      source: "platform",
      installTarget: "none",
      publicSafeMessage: message,
    })),
    dependencyInstallEnvelopes: [],
    selfRepairHints: repairHints({ providerFamily, missingDependencies: dependencyRefs, status: "unsupportedPlatform" }),
    nextAction: "chooseDifferentProfile",
    publicSafeMessage: message,
    metadata: {
      sandboxId: spec.sandboxId,
      isolationLevel: spec.isolationLevel ?? "custom",
    },
  };
}

async function probeHostObserved(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
  return {
    providerFamily: providerFamilyFor(spec),
    profile: spec.profile,
    status: "available",
    platform: process.platform,
    dependencyRefs: [],
    availableDependencies: [],
    missingDependencies: [],
    dependencyChecks: [],
    dependencyInstallEnvelopes: [],
    selfRepairHints: repairHints({ providerFamily: providerFamilyFor(spec), missingDependencies: [], status: "available" }),
    nextAction: "none",
    publicSafeMessage: "host-observed sandbox is available; it observes and governs but does not isolate execution",
    metadata: {
      sandboxId: spec.sandboxId,
      isolationLevel: spec.isolationLevel ?? "none",
    },
  };
}

async function probeContractOnly(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
  const providerFamily = providerFamilyFor(spec);
  const dependencyRefs = dependencyRefsFor(spec);
  return {
    providerFamily,
    profile: spec.profile,
    status: "contractOnly",
    platform: process.platform,
    dependencyRefs,
    availableDependencies: [],
    missingDependencies: dependencyRefs,
    dependencyChecks: dependencyRefs.map((dependencyId) => ({
      dependencyId,
      required: true,
      status: "contractOnly",
      source: providerFamily === "rootless-container" ? "container-runtime" : providerFamily === "remote-worker" ? "remote" : "platform",
      installTarget: "manual",
      publicSafeMessage: `${providerFamily} dependency is contract-only in this runtime build`,
    })),
    dependencyInstallEnvelopes: dependencyInstallEnvelopes({ providerFamily, missingDependencies: dependencyRefs }),
    selfRepairHints: repairHints({ providerFamily, missingDependencies: dependencyRefs, status: "contractOnly" }),
    nextAction: providerFamily === "remote-worker" ? "routeRemoteWorker" : "manualProviderSetup",
    publicSafeMessage: `${providerFamily} sandbox is contract-only in this runtime build`,
    metadata: {
      sandboxId: spec.sandboxId,
      isolationLevel: spec.isolationLevel ?? "custom",
      platformSupport: spec.platformSupport ?? {},
    },
  };
}

async function probeLinuxBubblewrap(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
  const providerFamily = providerFamilyFor(spec);
  if (process.platform !== "linux") {
    return unsupported(providerFamily, spec, "linux-bubblewrap sandbox only runs on Linux");
  }

  const dependencyRefs = dependencyRefsFor(spec);
  const dependencies = await dependencyAvailability(dependencyRefs);
  const dependencyChecks = [
    ...(await Promise.all(dependencyRefs.map((ref) => binaryCheck(ref, true)))),
    ...(await linuxOptionalChecks()),
  ];
  if (dependencies.missing.length > 0) {
    return {
      providerFamily,
      profile: spec.profile,
      status: "missingDependency",
      platform: process.platform,
      dependencyRefs,
      availableDependencies: dependencies.available,
      missingDependencies: dependencies.missing,
      dependencyChecks,
      dependencyInstallEnvelopes: dependencyInstallEnvelopes({ providerFamily, missingDependencies: dependencies.missing }),
      selfRepairHints: repairHints({
        providerFamily,
        missingDependencies: dependencies.missing,
        status: "missingDependency",
      }),
      nextAction: "installDependency",
      publicSafeMessage: "linux-bubblewrap sandbox requires the bwrap binary before it can run",
      metadata: {
        installHint: "Install bubblewrap through the system package manager, then rerun rax test.",
        sandboxId: spec.sandboxId,
      },
    };
  }

  return {
    providerFamily,
    profile: spec.profile,
    status: "available",
    platform: process.platform,
    dependencyRefs,
    availableDependencies: dependencies.available,
    missingDependencies: [],
    dependencyChecks,
    dependencyInstallEnvelopes: [],
    selfRepairHints: repairHints({ providerFamily, missingDependencies: [], status: "available" }),
    nextAction: "none",
    publicSafeMessage: "linux-bubblewrap sandbox dependencies are available",
    metadata: {
      sandboxId: spec.sandboxId,
      isolationLevel: spec.isolationLevel ?? "process-namespace",
    },
  };
}

type LinuxBubblewrapSandboxPaths = {
  workspace: string;
  raxWorkspace: string;
  sandboxRoot: string;
  home: string;
  tmp: string;
  artifacts: string;
};

async function ensureLinuxBubblewrapPaths(cwd: string): Promise<LinuxBubblewrapSandboxPaths> {
  const workspace = path.resolve(cwd);
  const raxWorkspace = path.join(workspace, ".rax_workspace");
  const sandboxRoot = path.join(raxWorkspace, "sandbox");
  const home = path.join(sandboxRoot, "home");
  const tmp = path.join(sandboxRoot, "tmp");
  const artifacts = path.join(sandboxRoot, "artifacts");
  await Promise.all([
    mkdir(home, { recursive: true }),
    mkdir(tmp, { recursive: true }),
    mkdir(artifacts, { recursive: true }),
  ]);
  return { workspace, raxWorkspace, sandboxRoot, home, tmp, artifacts };
}

function linuxBubblewrapSystemMounts(): readonly string[] {
  const args: string[] = [];
  for (const dir of ["/usr", "/bin", "/lib", "/lib64", "/etc", "/opt", "/nix"]) {
    args.push("--ro-bind-try", dir, dir);
  }
  return args;
}

function minimalDeviceMounts(): readonly string[] {
  return [
    "--dir",
    "/dev",
    "--dev-bind",
    "/dev/null",
    "/dev/null",
    "--dev-bind",
    "/dev/zero",
    "/dev/zero",
    "--dev-bind",
    "/dev/random",
    "/dev/random",
    "--dev-bind",
    "/dev/urandom",
    "/dev/urandom",
  ];
}

function smokeScript(): string {
  return [
    "test \"$(pwd)\" = /workspace",
    "test \"$HOME\" = /sandbox-home",
    "test -d /workspace",
    "test -r /workspace",
    "test -w /workspace/.rax_workspace/sandbox",
    "test -w /tmp",
    "test -w /artifacts",
    "echo praxis-smoke >/workspace/.rax_workspace/sandbox/tmp/praxis-bwrap-smoke.txt",
    "test ! -e /home/proview/.ssh",
    "test ! -e /host-home",
    "test -d /proc",
    "echo check:cwd",
    "echo check:home",
    "echo check:workspace",
    "echo check:scratch",
    "echo check:tmp",
    "echo check:artifacts",
    "echo check:host-home-hidden",
    "echo check:proc",
  ].join(" && ");
}

function smokeCommand(paths: LinuxBubblewrapSandboxPaths): readonly string[] {
  return [
    "bwrap",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-net",
    "--die-with-parent",
    ...linuxBubblewrapSystemMounts(),
    "--proc",
    "/proc",
    ...minimalDeviceMounts(),
    "--ro-bind",
    paths.workspace,
    "/workspace",
    "--bind",
    paths.raxWorkspace,
    "/workspace/.rax_workspace",
    "--bind",
    paths.home,
    "/sandbox-home",
    "--bind",
    paths.tmp,
    "/tmp",
    "--bind",
    paths.artifacts,
    "/artifacts",
    "--setenv",
    "HOME",
    "/sandbox-home",
    "--setenv",
    "TMPDIR",
    "/tmp",
    "--setenv",
    "PRAXIS_SANDBOX",
    "linux-bubblewrap",
    "--chdir",
    "/workspace",
    "/usr/bin/env",
    "sh",
    "-lc",
    smokeScript(),
  ];
}

async function runLinuxBubblewrapSmoke(spec: SandboxSpec, input: { cwd?: string } = {}): Promise<SandboxRuntimeSmokeResult> {
  const cwd = input.cwd ?? process.cwd();
  const paths = await ensureLinuxBubblewrapPaths(cwd);
  const command = smokeCommand(paths);
  if (process.platform !== "linux") {
    return {
      providerFamily: providerFamilyFor(spec),
      profile: spec.profile,
      status: "skipped",
      commandPreview: command,
      checks: [{ checkId: "platform", status: "skipped", publicSafeMessage: "linux-bubblewrap smoke only runs on Linux" }],
      publicSafeMessage: "linux-bubblewrap smoke is skipped outside Linux",
      metadata: { cwd, sandboxRoot: paths.sandboxRoot },
    };
  }

  try {
    const result = await execFileAsync(command[0] ?? "bwrap", [...command.slice(1)], {
      cwd,
      timeout: spec.resourceLimits.timeoutMs ?? 5_000,
      maxBuffer: spec.resourceLimits.maxOutputBytes ?? 64_000,
      env: {
        ...process.env,
        HOME: paths.home,
        TMPDIR: paths.tmp,
      },
    });
    const stdout = result.stdout ?? "";
    const passedChecks: SandboxRuntimeSmokeCheck[] = [
      "cwd",
      "home",
      "workspace",
      "scratch",
      "tmp",
      "artifacts",
      "host-home-hidden",
      "proc",
    ].map((checkId) => ({
      checkId,
      status: stdout.includes(`check:${checkId}`) ? "passed" : "failed",
      publicSafeMessage: stdout.includes(`check:${checkId}`)
        ? `${checkId} boundary check passed`
        : `${checkId} boundary check did not report success`,
    }));
    return {
      providerFamily: providerFamilyFor(spec),
      profile: spec.profile,
      status: "passed",
      commandPreview: command,
      stdout: result.stdout,
      stderr: result.stderr,
      checks: passedChecks,
      publicSafeMessage: "linux-bubblewrap workspace-only smoke passed",
      metadata: {
        cwd,
        sandboxRoot: paths.sandboxRoot,
        home: paths.home,
        tmp: paths.tmp,
        artifacts: paths.artifacts,
        networkMode: "denied",
        deviceExposure: "minimal",
      },
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      providerFamily: providerFamilyFor(spec),
      profile: spec.profile,
      status: "failed",
      commandPreview: command,
      stdout: err.stdout,
      stderr: err.stderr,
      checks: [{ checkId: "linux-bubblewrap", status: "failed", publicSafeMessage: "bubblewrap command did not complete all boundary checks" }],
      publicSafeMessage: "linux-bubblewrap smoke failed; user namespaces or bwrap policy may be unavailable",
      metadata: {
        cwd,
        sandboxRoot: paths.sandboxRoot,
        error: err.message ?? "unknown bwrap failure",
      },
    };
  }
}

export function createSandboxRuntimeProvider(providerFamily: SandboxProviderFamily): SandboxRuntimeProvider {
  return {
    providerFamily,
    async probe(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
      const family = providerFamilyFor(spec);
      if (family === "host-observed" || family === "workspace-policy") return probeHostObserved(spec);
      if (family === "linux-bubblewrap") return probeLinuxBubblewrap(spec);
      return probeContractOnly(spec);
    },
    async prepare(spec: SandboxSpec, input: { cwd?: string; runSmoke?: boolean } = {}): Promise<SandboxRuntimePrepareResult> {
      const probe = await this.probe(spec);
      const shouldSmoke = input.runSmoke === true && probe.status === "available" && providerFamilyFor(spec) === "linux-bubblewrap";
      const smoke = shouldSmoke
        ? await this.runSmoke(spec, { cwd: input.cwd })
        : undefined;
      const ready = probe.status === "available" && (smoke === undefined || smoke.status === "passed");
      return {
        providerFamily: providerFamilyFor(spec),
        profile: spec.profile,
        ready,
        probe: smoke?.status === "failed"
          ? { ...probe, status: "smokeFailed", publicSafeMessage: smoke.publicSafeMessage }
          : probe,
        smoke,
        events: [
          ready ? "runtime.sandboxPlane.provider.ready" : "runtime.sandboxPlane.provider.notReady",
        ],
      };
    },
    runSmoke(spec: SandboxSpec, input: { cwd?: string } = {}): Promise<SandboxRuntimeSmokeResult> {
      if (providerFamilyFor(spec) === "linux-bubblewrap") {
        return runLinuxBubblewrapSmoke(spec, input);
      }
      return Promise.resolve({
        providerFamily: providerFamilyFor(spec),
        profile: spec.profile,
        status: "skipped",
        commandPreview: [],
        publicSafeMessage: `${providerFamilyFor(spec)} has no live smoke in this runtime build`,
        metadata: { contractOnly: true },
      });
    },
    explainUnavailable(probe: SandboxRuntimeProviderProbe): string {
      if (probe.status === "missingDependency") {
        return `${probe.providerFamily} is missing ${probe.missingDependencies.join(", ")}`;
      }
      return probe.publicSafeMessage;
    },
  };
}

export async function prepareSandboxRuntime(
  spec: SandboxSpec,
  input: { cwd?: string; runSmoke?: boolean } = {},
): Promise<SandboxRuntimePrepareResult> {
  return createSandboxRuntimeProvider(providerFamilyFor(spec)).prepare(spec, input);
}
