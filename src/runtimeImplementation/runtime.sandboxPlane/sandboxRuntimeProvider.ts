/*
 * 文件定位：Agent 运行态实现层 / 沙箱运行面。
 * 核心目的：把 SandboxSpec 从声明扩展为可探测、可解释、可 smoke 的 provider adapter。
 * 边界：本文件不替代 BaseTool 语义；工具执行仍然必须走 registry/handler/executor。
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  SandboxProviderFamily,
  SandboxSpec,
} from "../runtimeAgentManifest.js";
import { canonicalDependencyId } from "../runtime.dependencyPlane/index.js";

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
  prepare(spec: SandboxSpec, input?: { cwd?: string; runSmoke?: boolean; providerReady?: boolean }): Promise<SandboxRuntimePrepareResult>;
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
    return ["dependency.binary.raxcell"];
  }
  return refs.map(canonicalDependencyId);
}

function dependencyBinary(ref: string): string | undefined {
  const canonical = canonicalDependencyId(ref);
  if (canonical === "dependency.binary.raxcell") return process.env.RAXCELL_BIN?.trim() || "raxcell";
  if (canonical === "dependency.binary.bwrap") return "bwrap";
  if (canonical === "dependency.binary.rg") return "rg";
  if (canonical === "dependency.binary.ffmpeg") return "ffmpeg";
  if (canonical === "dependency.binary.imagemagick") return "magick";
  if (canonical === "dependency.binary.xdotool") return "xdotool";
  if (canonical === "dependency.binary.ydotool") return "ydotool";
  if (canonical === "dependency.macos.containerization") return "/usr/bin/sandbox-exec";
  if (canonical === "dependency.windows.sandbox") return "powershell.exe";
  if (!ref.startsWith("binary:")) return undefined;
  return ref.slice("binary:".length).split("|")[0]?.trim() || undefined;
}

async function binaryAvailable(binary: string): Promise<boolean> {
  try {
    if (binary.endsWith("sandbox-exec")) {
      await execFileAsync("test", ["-x", binary], { timeout: 2_000 });
      return true;
    }
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
  if (input.missingDependencies.includes("dependency.binary.raxcell")) {
    return [{
      hintId: "linux-bubblewrap:configure-raxcell",
      severity: "warning",
      action: "manualProviderSetup",
      message: "Configure the Raxcell CLI binary path through RAXCELL_BIN or inject RaxcellSandboxProvider at runtime.",
      commandPreview: ["export RAXCELL_BIN=/absolute/path/to/raxcell"],
      requiresApproval: false,
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
    installTarget: "manual",
    commandPreview: dependencyId === "dependency.binary.raxcell"
      ? ["export RAXCELL_BIN=/absolute/path/to/raxcell"]
      : [],
    requiresApproval: true,
    approvalSurface: "interface/application",
    publicSafe: true,
    message: `${dependencyId} requires external approval before installation`,
  }));
}

function windowsNativeHelperInstallEnvelope(providerFamily: SandboxProviderFamily): SandboxRuntimeDependencyInstallEnvelope {
  return {
    envelopeId: `${providerFamily}:dependency.praxis.windowsSandboxHelper:install`,
    dependencyId: "dependency.praxis.windowsSandboxHelper",
    providerFamily,
    action: "installDependency",
    installTarget: "provider-managed",
    commandPreview: [
      "rax deps install dependency.praxis.windowsSandboxHelper",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File <praxis-windows-sandbox-helper-installer.ps1>",
    ],
    requiresApproval: true,
    approvalSurface: "interface/application",
    publicSafe: true,
    message: "Windows restricted sandbox needs the Praxis native helper before token/job-object enforcement can run.",
  };
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

async function probeLinuxBubblewrap(spec: SandboxSpec, input: { providerReady?: boolean } = {}): Promise<SandboxRuntimeProviderProbe> {
  const providerFamily = providerFamilyFor(spec);
  if (process.platform !== "linux") {
    return unsupported(providerFamily, spec, "linux-bubblewrap sandbox only runs on Linux");
  }

  const dependencyRefs = dependencyRefsFor(spec);
  if (input.providerReady === true) {
    const dependencyChecks = [
      {
        dependencyId: "dependency.binary.raxcell",
        required: true,
        status: "available",
        source: "custom",
        installTarget: "manual",
        publicSafeMessage: "RaxcellSandboxProvider is injected by the Praxis runtime",
      } satisfies SandboxRuntimeDependencyCheck,
      ...(await linuxOptionalChecks()),
    ];
    return {
      providerFamily,
      profile: spec.profile,
      status: "available",
      platform: process.platform,
      dependencyRefs,
      availableDependencies: dependencyRefs,
      missingDependencies: [],
      dependencyChecks,
      dependencyInstallEnvelopes: [],
      selfRepairHints: repairHints({ providerFamily, missingDependencies: [], status: "available" }),
      nextAction: "none",
      publicSafeMessage: "Injected Raxcell linux-bubblewrap sandbox provider is available",
      metadata: {
        sandboxId: spec.sandboxId,
        isolationLevel: spec.isolationLevel ?? "process-namespace",
        provider: "raxcell",
        injectedProvider: true,
      },
    };
  }

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
      nextAction: "manualProviderSetup",
      publicSafeMessage: "linux-bubblewrap sandbox requires a configured Raxcell provider before it can run",
      metadata: {
        installHint: "Set RAXCELL_BIN or inject RaxcellSandboxProvider through runtime sandbox options.",
        sandboxId: spec.sandboxId,
        requiredProvider: "raxcell",
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
    publicSafeMessage: "Raxcell linux-bubblewrap sandbox provider is available",
    metadata: {
      sandboxId: spec.sandboxId,
      isolationLevel: spec.isolationLevel ?? "process-namespace",
      provider: "raxcell",
      binaryPath: process.env.RAXCELL_BIN?.trim() || "raxcell",
    },
  };
}

async function probeMacosSeatbelt(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
  const providerFamily = providerFamilyFor(spec);
  if (process.platform !== "darwin") {
    return unsupported(providerFamily, spec, "macOS Seatbelt sandbox only runs on macOS");
  }
  const dependencyRefs = dependencyRefsFor(spec);
  const dependencyChecks = await Promise.all(dependencyRefs.map((ref) => binaryCheck(ref, true)));
  const missing = dependencyChecks.filter((check) => check.status !== "available").map((check) => check.dependencyId);
  return {
    providerFamily,
    profile: spec.profile,
    status: missing.length === 0 ? "available" : "missingDependency",
    platform: process.platform,
    dependencyRefs,
    availableDependencies: dependencyChecks.filter((check) => check.status === "available").map((check) => check.dependencyId),
    missingDependencies: missing,
    dependencyChecks,
    dependencyInstallEnvelopes: dependencyInstallEnvelopes({ providerFamily, missingDependencies: missing }),
    selfRepairHints: missing.length === 0
      ? repairHints({ providerFamily, missingDependencies: [], status: "available" })
      : [{
          hintId: "macos-seatbelt:enable",
          severity: "warning",
          action: "manualProviderSetup",
          message: "macOS sandbox-exec is required for Seatbelt sandbox execution.",
          requiresApproval: false,
        }],
    nextAction: missing.length === 0 ? "none" : "manualProviderSetup",
    publicSafeMessage: missing.length === 0
      ? "macOS Seatbelt sandbox runtime is available"
      : "macOS Seatbelt sandbox runtime is not available",
    metadata: {
      sandboxId: spec.sandboxId,
      executable: "/usr/bin/sandbox-exec",
      providerContract: "praxis.macosSeatbelt.v1",
    },
  };
}

async function probeWindowsRestricted(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
  const providerFamily = providerFamilyFor(spec);
  if (process.platform !== "win32") {
    return unsupported(providerFamily, spec, "Windows restricted sandbox only runs on Windows");
  }
  const dependencyRefs = dependencyRefsFor(spec);
  const dependencyChecks = await Promise.all(dependencyRefs.map((ref) => binaryCheck(ref, true)));
  const powershellAvailable = dependencyChecks.some((check) => check.status === "available") || await binaryAvailable("powershell.exe");
  const missing = powershellAvailable ? [] : ["dependency.windows.sandbox"];
  return {
    providerFamily,
    profile: spec.profile,
    status: powershellAvailable ? "contractOnly" : "missingDependency",
    platform: process.platform,
    dependencyRefs,
    availableDependencies: powershellAvailable ? ["dependency.windows.sandbox"] : [],
    missingDependencies: missing,
    dependencyChecks,
    dependencyInstallEnvelopes: [
      ...dependencyInstallEnvelopes({ providerFamily, missingDependencies: missing }),
      windowsNativeHelperInstallEnvelope(providerFamily),
    ],
    selfRepairHints: powershellAvailable
      ? [{
          hintId: "windows-restricted:helper-contract",
          severity: "info",
          action: "installDependency",
          message: "Windows provider contract is available; native helper installation must be supplied by dependency/application policy.",
          commandPreview: ["rax deps install dependency.praxis.windowsSandboxHelper"],
          requiresApproval: true,
        }]
      : [{
          hintId: "windows-restricted:helper",
          severity: "warning",
          action: "installDependency",
          message: "Praxis Windows restricted sandbox requires the native helper component to enforce token/job-object policy.",
          commandPreview: ["rax deps install dependency.praxis.windowsSandboxHelper"],
          requiresApproval: true,
        }],
    nextAction: "installDependency",
    publicSafeMessage: powershellAvailable
      ? "Windows restricted sandbox native-helper contract is available but the helper is not installed by this runtime build"
      : "Windows restricted sandbox helper is not available",
    metadata: {
      sandboxId: spec.sandboxId,
      providerContract: "praxis.windowsSandbox.restrictedProcess.v1",
      helperRequired: true,
    },
  };
}

function runLinuxBubblewrapSmoke(spec: SandboxSpec, input: { cwd?: string } = {}): Promise<SandboxRuntimeSmokeResult> {
  return Promise.resolve({
    providerFamily: providerFamilyFor(spec),
    profile: spec.profile,
    status: "skipped",
    commandPreview: [],
    checks: [{
      checkId: "raxcell-provider",
      status: "skipped",
      publicSafeMessage: "Raxcell owns Linux backend execution checks; Praxis runtime provider only verifies provider availability.",
    }],
    publicSafeMessage: "Raxcell linux-bubblewrap smoke is provider-owned and skipped by Praxis runtime.",
    metadata: {
      cwd: input.cwd ?? process.cwd(),
      provider: "raxcell",
    },
  });
}

export function createSandboxRuntimeProvider(providerFamily: SandboxProviderFamily): SandboxRuntimeProvider {
  return {
    providerFamily,
    async probe(spec: SandboxSpec): Promise<SandboxRuntimeProviderProbe> {
      const family = providerFamilyFor(spec);
      if (family === "host-observed" || family === "workspace-policy") return probeHostObserved(spec);
      if (family === "linux-bubblewrap") return probeLinuxBubblewrap(spec);
      if (family === "macos-containerization") return probeMacosSeatbelt(spec);
      if (family === "windows-sandbox") return probeWindowsRestricted(spec);
      return probeContractOnly(spec);
    },
    async prepare(spec: SandboxSpec, input: { cwd?: string; runSmoke?: boolean; providerReady?: boolean } = {}): Promise<SandboxRuntimePrepareResult> {
      const probe = providerFamilyFor(spec) === "linux-bubblewrap" && input.providerReady === true
        ? await probeLinuxBubblewrap(spec, { providerReady: true })
        : await this.probe(spec);
      const shouldSmoke = input.runSmoke === true && probe.status === "available" && providerFamilyFor(spec) === "linux-bubblewrap";
      const smoke = shouldSmoke
        ? await this.runSmoke(spec, { cwd: input.cwd })
        : undefined;
      const ready = probe.status === "available" && smoke?.status !== "failed";
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
  input: { cwd?: string; runSmoke?: boolean; providerReady?: boolean } = {},
): Promise<SandboxRuntimePrepareResult> {
  return createSandboxRuntimeProvider(providerFamilyFor(spec)).prepare(spec, input);
}
