/*
 * 文件定位：Agent 运行态实现层 / 沙箱挂载矩阵检查面。
 * 核心目的：把 SandboxSpec、provider 准备结果、BaseTool 沙箱计划和 Raxcell 边界合成为只读验收对象。
 * 边界：本文件不执行命令、不创建 workspace rollback snapshot、不替代 policy/middleware/provider 语义。
 */

import path from "node:path";

import type {
  BaseToolEffectKind,
  BaseToolSandboxHint,
} from "../../basetool/factMatrix.js";
import type {
  BaseToolPolicyProfile,
  SandboxSpec,
} from "../runtimeAgentManifest.js";
import {
  planBaseToolSandbox,
  type BaseToolSandboxMode,
  type BaseToolSandboxPlan,
  type BaseToolSandboxPlanStatus,
} from "./baseToolSandboxPlanner.js";
import type {
  SandboxRuntimePrepareResult,
  SandboxRuntimeProviderAction,
  SandboxRuntimeProviderStatus,
} from "./sandboxRuntimeProvider.js";

export type SandboxMountMatrixStatus = "ready" | "degraded";

export type SandboxMountMatrixProviderEvidence =
  | "injected"
  | "binary"
  | "prepared"
  | "missing"
  | "not-probed"
  | "contract-only"
  | "unsupported";

export type SandboxMountMatrixIsolationEvidence =
  | "os-isolated"
  | "workspace-rollback"
  | "workspace-policy"
  | "governed-host-observation"
  | "contract-only"
  | "unsupported"
  | "unknown";

export type SandboxMountMatrixCommandPreview = {
  mode: BaseToolSandboxMode;
  providerFamily: string;
  applied: boolean;
  executesCommand: false;
  program: string;
  args: readonly string[];
  cwd: string;
  network: string;
  readonlyRoot: boolean;
  workspaceRollbackWouldProtect: readonly ["workspace-files"] | readonly [];
  publicSafe: true;
  events: readonly string[];
};

export type SandboxRuntimeMountMatrix = {
  surface: "runtime.sandboxPlane.mountMatrix";
  status: SandboxMountMatrixStatus;
  publicSafe: true;
  sandbox: {
    sandboxId: string;
    profile: SandboxSpec["profile"];
    providerFamily: SandboxSpec["providerFamily"];
    hostObserved: boolean;
    isolationLevel: SandboxSpec["isolationLevel"];
    isolationEvidence: SandboxMountMatrixIsolationEvidence;
    dependencyRefs: readonly string[];
    filesystem: SandboxSpec["filesystem"];
    network: SandboxSpec["network"];
    shell: SandboxSpec["shell"];
  };
  provider: {
    prepared: boolean;
    ready: boolean;
    status: SandboxRuntimeProviderStatus | "not-probed";
    evidenceStatus: SandboxMountMatrixProviderEvidence;
    dependencyRefs: readonly string[];
    availableDependencies: readonly string[];
    missingDependencies: readonly string[];
    nextAction: SandboxRuntimeProviderAction | "probe-provider";
    publicSafeMessage: string;
  };
  baseToolSandboxPlan: {
    toolId: string;
    requestedMode: BaseToolSandboxMode;
    effectiveMode: BaseToolSandboxMode;
    status: BaseToolSandboxPlanStatus;
    sandboxReady: boolean;
    degradeReason?: string;
    rollback: BaseToolSandboxPlan["rollback"];
  };
  commandPlanPreview: SandboxMountMatrixCommandPreview;
  raxcell: {
    expectedForProvider: boolean;
    providerMounted: boolean;
    policyOwner: "praxis";
    providerRole: "environment-and-execution";
    adapterBoundary: "Praxis maps policy/governance facts to Raxcell prepareRun/run";
  };
  policyMiddleware: {
    mounted: true;
    policyOwner: "praxis";
    providerRole: "environment-and-execution";
    environmentGapHandledBy: "praxis-policy-middleware";
  };
  falseReadyGuards: {
    hostObservedNeverClaimsIsolation: true;
    strongSandboxRequiresReadyProvider: true;
    commandPreviewDoesNotExecute: true;
    workspaceRollbackIsDegradedIsolation: true;
  };
};

export type InspectSandboxRuntimeMountMatrixInput = {
  sandbox: SandboxSpec;
  policyProfile: BaseToolPolicyProfile;
  preparedSandbox?: SandboxRuntimePrepareResult;
  sandboxProviderInjected?: boolean;
  toolId?: string;
  command?: {
    program?: string;
    args?: readonly string[];
    cwd?: string;
  };
  effectKinds?: readonly BaseToolEffectKind[];
  sandboxHint?: BaseToolSandboxHint;
};

function isStrongProvider(providerFamily: string | undefined): boolean {
  return providerFamily === "linux-bubblewrap" ||
    providerFamily === "macos-containerization" ||
    providerFamily === "windows-sandbox" ||
    providerFamily === "rootless-container" ||
    providerFamily === "remote-worker";
}

function providerEvidenceStatus(input: InspectSandboxRuntimeMountMatrixInput): SandboxMountMatrixProviderEvidence {
  const prepared = input.preparedSandbox;
  if (prepared === undefined) return "not-probed";
  if (prepared.probe.status === "contractOnly") return "contract-only";
  if (prepared.probe.status === "unsupportedPlatform") return "unsupported";
  if (!prepared.ready) return "missing";
  if (input.sandboxProviderInjected === true || prepared.probe.metadata.injectedProvider === true) return "injected";
  if (prepared.probe.metadata.binaryPath !== undefined) return "binary";
  return "prepared";
}

function isolationEvidence(input: {
  sandbox: SandboxSpec;
  plan: BaseToolSandboxPlan;
  preparedSandbox?: SandboxRuntimePrepareResult;
}): SandboxMountMatrixIsolationEvidence {
  if (input.sandbox.profile === "host-observed") return "governed-host-observation";
  if (input.plan.effectiveMode === "workspace-rollback") return "workspace-rollback";
  if (input.sandbox.providerFamily === "workspace-policy") return "workspace-policy";
  if (input.preparedSandbox?.probe.status === "contractOnly") return "contract-only";
  if (input.preparedSandbox?.probe.status === "unsupportedPlatform") return "unsupported";
  if (input.plan.effectiveMode === "isolated" && isStrongProvider(input.preparedSandbox?.providerFamily ?? input.sandbox.providerFamily)) {
    return input.preparedSandbox?.ready === true ? "os-isolated" : "unknown";
  }
  return "unknown";
}

function commandProviderFamily(input: {
  sandbox: SandboxSpec;
  plan: BaseToolSandboxPlan;
  preparedSandbox?: SandboxRuntimePrepareResult;
}): string {
  if (input.plan.effectiveMode === "workspace-rollback") return "workspace-rollback";
  if (input.plan.effectiveMode === "none") {
    return input.sandbox.providerFamily === "workspace-policy" ? "workspace-policy" : "host-observed";
  }
  const family = input.preparedSandbox?.providerFamily ?? input.sandbox.providerFamily ?? input.sandbox.profile;
  return isStrongProvider(String(family)) ? String(family) : "workspace-rollback";
}

function networkPolicy(spec: SandboxSpec): string {
  const outbound = spec.networkPolicy?.outbound ?? spec.network;
  if (outbound === "allow" || outbound === "deny" || outbound === "approval" || outbound === "provider-policy") return outbound;
  return String(outbound).includes("allow") ? "allow" : String(outbound).includes("deny") ? "deny" : "approval";
}

function commandPlanPreview(input: {
  matrixInput: InspectSandboxRuntimeMountMatrixInput;
  plan: BaseToolSandboxPlan;
}): SandboxMountMatrixCommandPreview {
  const providerFamily = commandProviderFamily({
    sandbox: input.matrixInput.sandbox,
    plan: input.plan,
    preparedSandbox: input.matrixInput.preparedSandbox,
  });
  return {
    mode: input.plan.effectiveMode,
    providerFamily,
    applied: input.plan.effectiveMode !== "none",
    executesCommand: false,
    program: input.matrixInput.command?.program ?? "true",
    args: input.matrixInput.command?.args ?? [],
    cwd: path.resolve(input.matrixInput.command?.cwd ?? process.cwd()),
    network: networkPolicy(input.matrixInput.sandbox),
    readonlyRoot: input.matrixInput.sandbox.mountPolicy?.readonlyRoot ?? false,
    workspaceRollbackWouldProtect: input.plan.rollback.protects,
    publicSafe: true,
    events: [`runtime.sandboxPlane.command.preview.${providerFamily}`],
  };
}

function statusFor(input: {
  plan: BaseToolSandboxPlan;
  isolation: SandboxMountMatrixIsolationEvidence;
  providerEvidence: SandboxMountMatrixProviderEvidence;
}): SandboxMountMatrixStatus {
  if (input.plan.status !== "ready") return "degraded";
  if (input.isolation !== "os-isolated") return "degraded";
  if (input.providerEvidence === "missing" || input.providerEvidence === "not-probed" || input.providerEvidence === "contract-only" || input.providerEvidence === "unsupported") {
    return "degraded";
  }
  return "ready";
}

export async function inspectSandboxRuntimeMountMatrix(
  input: InspectSandboxRuntimeMountMatrixInput,
): Promise<SandboxRuntimeMountMatrix> {
  const toolId = input.toolId ?? "shell.run";
  const plan = planBaseToolSandbox({
    toolId,
    profile: input.policyProfile,
    sandbox: input.sandbox,
    preparedSandbox: input.preparedSandbox,
    effectKinds: input.effectKinds,
    sandboxHint: input.sandboxHint,
  });
  const providerEvidence = providerEvidenceStatus(input);
  const isolation = isolationEvidence({
    sandbox: input.sandbox,
    plan,
    preparedSandbox: input.preparedSandbox,
  });
  const raxcellExpected = (input.preparedSandbox?.providerFamily ?? input.sandbox.providerFamily) === "linux-bubblewrap";

  return {
    surface: "runtime.sandboxPlane.mountMatrix",
    status: statusFor({ plan, isolation, providerEvidence }),
    publicSafe: true,
    sandbox: {
      sandboxId: input.sandbox.sandboxId,
      profile: input.sandbox.profile,
      providerFamily: input.sandbox.providerFamily,
      hostObserved: input.sandbox.profile === "host-observed",
      isolationLevel: input.sandbox.isolationLevel,
      isolationEvidence: isolation,
      dependencyRefs: input.sandbox.dependencyRefs ?? [],
      filesystem: input.sandbox.filesystem,
      network: input.sandbox.network,
      shell: input.sandbox.shell,
    },
    provider: {
      prepared: input.preparedSandbox !== undefined,
      ready: input.preparedSandbox?.ready === true,
      status: input.preparedSandbox?.probe.status ?? "not-probed",
      evidenceStatus: providerEvidence,
      dependencyRefs: input.preparedSandbox?.probe.dependencyRefs ?? input.sandbox.dependencyRefs ?? [],
      availableDependencies: input.preparedSandbox?.probe.availableDependencies ?? [],
      missingDependencies: input.preparedSandbox?.probe.missingDependencies ?? input.sandbox.dependencyRefs ?? [],
      nextAction: input.preparedSandbox?.probe.nextAction ?? "probe-provider",
      publicSafeMessage: input.preparedSandbox?.probe.publicSafeMessage ?? "sandbox provider has not been probed for this mount matrix",
    },
    baseToolSandboxPlan: {
      toolId: plan.toolId,
      requestedMode: plan.requestedMode,
      effectiveMode: plan.effectiveMode,
      status: plan.status,
      sandboxReady: plan.sandboxReady,
      degradeReason: plan.degradeReason,
      rollback: plan.rollback,
    },
    commandPlanPreview: commandPlanPreview({ matrixInput: input, plan }),
    raxcell: {
      expectedForProvider: raxcellExpected,
      providerMounted: raxcellExpected && input.preparedSandbox?.ready === true,
      policyOwner: "praxis",
      providerRole: "environment-and-execution",
      adapterBoundary: "Praxis maps policy/governance facts to Raxcell prepareRun/run",
    },
    policyMiddleware: {
      mounted: true,
      policyOwner: "praxis",
      providerRole: "environment-and-execution",
      environmentGapHandledBy: "praxis-policy-middleware",
    },
    falseReadyGuards: {
      hostObservedNeverClaimsIsolation: true,
      strongSandboxRequiresReadyProvider: true,
      commandPreviewDoesNotExecute: true,
      workspaceRollbackIsDegradedIsolation: true,
    },
  };
}
