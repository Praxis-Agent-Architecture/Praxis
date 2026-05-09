/*
 * 文件定位：Agent 运行态实现层 / framework core 聚合检查面。
 * 核心目的：把 Manifest、readiness、PromptPack、MainLoop、SelfRepair 的只读诊断收束成开发者可读报告。
 * 边界：只做 inspect/debug/selfRepair contract，不执行模型、工具、官方模块策略或修复动作。
 */

import type { MainLoopStepRecord } from "../../agent_executionEngine/coreLogic/mainLoop.js";
import type { PromptPackCachePlan } from "../../agent_executionEngine/promptPack/promptAssembler.js";
import {
  lowerPraxisToolsForProvider,
  normalizeProviderInputSchema,
  type ProviderToolSchemaFamily,
} from "../../agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";
import type { RuntimeFaultSignal } from "../runtime.selfRepair/faultClassifier.js";
import {
  createBaseToolRealityLedger,
  type BaseToolDeveloperReadiness,
  type BaseToolRealityStages,
} from "../runtime.execEngine/baseToolRealityLedger.js";
import { runSelfRepairRuntime, type SelfRepairRuntimeOutcome } from "../runtime.selfRepair/selfRepairRuntime.js";
import { createStoragePlaneRuntime, type StoragePlaneRuntime } from "../runtime.storagePlane/storagePlaneRuntime.js";
import { inspectAgentManifest, type AgentManifest, type AgentManifestInspection } from "../runtimeAgentManifest.js";
import { checkRuntimeReadiness, type RuntimeReadinessSignal, type RuntimeReadinessSnapshot } from "./runtimeReadinessCheck.js";

export type FrameworkInspectionReportStatus = "ready" | "degraded" | "blocked";

export type FrameworkInspectionFindingSeverity = "info" | "warning" | "error";

export type FrameworkInspectionFinding = {
  findingId: string;
  severity: FrameworkInspectionFindingSeverity;
  section: "manifest" | "policy" | "tools" | "provider" | "promptPack" | "mainLoop" | "dependency" | "storage" | "selfRepair" | "sandbox";
  message: string;
  remediation?: string;
};

export type FrameworkToolReadinessInput = {
  toolId: string;
  family?: string;
  group?: string;
  ready?: boolean;
  required?: boolean;
  reason?: string;
  developerReadiness?: BaseToolDeveloperReadiness;
  stages?: BaseToolRealityStages;
  dependencyStatus?: string;
  executorSupport?: string;
  missingPorts?: readonly string[];
};

export type FrameworkProviderReadinessInput = {
  providerId: string;
  role?: string;
  ready?: boolean;
  required?: boolean;
  reason?: string;
};

export type FrameworkDependencyInput = {
  dependencyId: string;
  owner: "runtime" | "model" | "baseTool" | "officialModule" | "storage" | "inspection";
  ready?: boolean;
  required?: boolean;
  reason?: string;
};

export type FrameworkSandboxReadinessInput = {
  ready?: boolean;
  required?: boolean;
  reason?: string;
  probeStatus?: string;
  smokeStatus?: string;
  missingDependencies?: readonly string[];
  selfRepairHints?: readonly string[];
};

export type FrameworkPromptPackPreviewInput = {
  promptPackId: string;
  cachePlan?: PromptPackCachePlan;
  materials: readonly {
    materialId: string;
    kind: string;
    sourceCategory: string;
    preview: string;
    trusted?: boolean;
  }[];
};

export type FrameworkInspectionReportRequest = {
  runtimeId?: string;
  manifest?: AgentManifest;
  runtimeReady?: boolean;
  storage?: {
    cwd?: string;
    raxHome?: string;
    workspaceRoot?: string;
    homeDir?: string;
    env?: Readonly<Record<string, string | undefined>>;
  };
  tools?: readonly FrameworkToolReadinessInput[];
  providers?: readonly FrameworkProviderReadinessInput[];
  dependencies?: readonly FrameworkDependencyInput[];
  sandbox?: FrameworkSandboxReadinessInput;
  promptPackPreview?: FrameworkPromptPackPreviewInput;
  mainLoopSteps?: readonly MainLoopStepRecord[];
  selfRepairSignal?: RuntimeFaultSignal;
  checkedAt?: string;
};

export type FrameworkInspectionReportError = {
  code: "MISSING_RUNTIME_ID" | "MISSING_MANIFEST" | "READINESS_FAILED" | "SELF_REPAIR_FAILED";
  message: string;
  boundary: "input" | "manifest" | "readiness" | "selfRepair";
  publicSafe: true;
  internalDetailExposed: false;
};

export type FrameworkInspectionReport = {
  runtimeId: string;
  status: FrameworkInspectionReportStatus;
  checkedAt: string;
  manifest: AgentManifestInspection;
  policy: {
    profile: string;
    sandbox: string;
    approvalSurface: "interface/application";
  };
  sandbox: {
    sandboxId: string;
    profile: string;
    providerFamily: string;
    isolationLevel: string;
    realIsolation: boolean;
    filesystem: string;
    network: string;
    shell: string;
    dependencyRefs: readonly string[];
    mountPolicy?: AgentManifest["sandbox"]["mountPolicy"];
    networkPolicy?: AgentManifest["sandbox"]["networkPolicy"];
    processPolicy?: AgentManifest["sandbox"]["processPolicy"];
    platformSupport?: AgentManifest["sandbox"]["platformSupport"];
    readiness: {
      ready?: boolean;
      reason?: string;
      probeStatus?: string;
      smokeStatus?: string;
      missingDependencies: readonly string[];
      selfRepairHints: readonly string[];
    };
    linuxBubblewrap?: {
      providerVersion?: unknown;
      fallback?: unknown;
      home?: unknown;
      tmp?: unknown;
      artifacts?: unknown;
      networkMode: string;
      deviceExposure: "minimal-by-default" | "bapr-yolo-broad" | "provider-policy";
    };
  };
  toolReadiness: {
    total: number;
    ready: number;
    missing: readonly string[];
    byDeveloperReadiness: Readonly<Record<BaseToolDeveloperReadiness, number>>;
    tools: readonly {
      toolId: string;
      family?: string;
      group?: string;
      ready: boolean;
      developerReadiness?: BaseToolDeveloperReadiness;
      stages?: BaseToolRealityStages;
      dependencyStatus?: string;
      executorSupport?: string;
      missingPorts?: readonly string[];
      reason?: string;
    }[];
  };
  providerReadiness: {
    total: number;
    ready: number;
    missing: readonly string[];
  };
  providerToolSchema: {
    praxisToolCount: number;
    expandedToolCount: number;
    foldedToolCount: number;
    targets: readonly {
      providerFamily: ProviderToolSchemaFamily;
      providerToolCount: number;
      mappingCount: number;
      runtimeDecisionToolCount: number;
      declarationHash: string;
      sanitizedToolCount: number;
      cachePrefixHealth: "stable" | "warning";
      schemaRejectedRisk: "low" | "warning";
      warnings: readonly string[];
    }[];
  };
  promptPackPreview?: {
    promptPackId: string;
    materialCount: number;
    materials: readonly FrameworkPromptPackPreviewInput["materials"][number][];
    cachePlan?: {
      strategy: PromptPackCachePlan["strategy"];
      segmentCount: number;
      segments: readonly {
        segmentKind: string;
        stability: string;
        cachePolicy: string;
        segmentHash: string;
        estimatedTokens: number;
        materialRefs: readonly string[];
      }[];
      cacheablePrefixSegmentKinds: readonly string[];
      dynamicSegmentKinds: readonly string[];
      cacheRiskWarnings: readonly string[];
    };
    providerPayloadBuilt: false;
  };
  mainLoopTrace: {
    stepCount: number;
    actionPrimitives: readonly string[];
    failedSteps: readonly string[];
  };
  dependencyGraph: {
    total: number;
    missing: readonly string[];
    owners: Readonly<Record<string, number>>;
  };
  storage: {
    homeRoot: string;
    workspaceRoot: string;
    sessionSqlitePath: string;
    artifactRoot: string;
    cacheRoot: string;
    sandboxRoot: string;
    initialized: boolean;
    missingDirectories: readonly string[];
    initPlanDirectoryCount: number;
    writesSecrets: false;
  };
  selfRepair?: {
    status: SelfRepairRuntimeOutcome["status"];
    nextStep: SelfRepairRuntimeOutcome["nextStep"];
    unsafeSideEffects: false;
    planStepCount: number;
  };
  findings: readonly FrameworkInspectionFinding[];
  audit: {
    reportSurface: "runtime.inspection.frameworkInspectionReport";
    unsafeSideEffects: false;
    rawSecretLeakageChecked: true;
  };
};

export type FrameworkInspectionReportResult =
  | {
      ok: true;
      report: FrameworkInspectionReport;
      readiness: RuntimeReadinessSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: FrameworkInspectionReportError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: FrameworkInspectionReportError["code"],
  message: string,
  boundary: FrameworkInspectionReportError["boundary"],
): FrameworkInspectionReportResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.inspection.frameworkReport.rejected"],
  };
}

function issueSignals(
  source: "surface" | "module" | "invariant",
  values: readonly RuntimeReadinessSignal[],
): readonly RuntimeReadinessSignal[] {
  return values.map((value, index) => ({
    signalId: value.signalId?.trim() || `${source}:${index + 1}`,
    ready: value.ready,
    required: value.required,
    reason: value.reason,
  }));
}

function statusFromFindings(findings: readonly FrameworkInspectionFinding[]): FrameworkInspectionReportStatus {
  if (findings.some((finding) => finding.severity === "error")) {
    return "blocked";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "degraded";
  }

  return "ready";
}

function readinessFinding(
  section: FrameworkInspectionFinding["section"],
  id: string,
  reason: string | undefined,
  required: boolean,
): FrameworkInspectionFinding {
  return {
    findingId: `${section}.${id}.not-ready`,
    severity: required ? "error" : "warning",
    section,
    message: reason ?? `${id} is not ready`,
    remediation: required ? "Provide the missing runtime support before running this agent." : "Optional support can stay degraded.",
  };
}

function summarizeMissing<T extends { ready?: boolean; required?: boolean; reason?: string }>(
  values: readonly T[],
  idOf: (value: T) => string,
): { ready: number; missing: readonly string[]; findings: readonly FrameworkInspectionFinding[] } {
  const missing = values.filter((value) => value.ready === false);
  const findings = missing.map((value) =>
    readinessFinding("dependency", idOf(value), value.reason, value.required !== false),
  );

  return {
    ready: values.length - missing.length,
    missing: missing.map(idOf),
    findings,
  };
}

function publicPreview(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const withoutSecret = trimmed.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return withoutSecret.length > 160 ? `${withoutSecret.slice(0, 157)}...` : withoutSecret;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function providerToolSchemaSummary(
  manifest: AgentManifest,
  promptPreview: FrameworkPromptPackPreviewInput | undefined,
): FrameworkInspectionReport["providerToolSchema"] {
  const expandedToolIds = new Set(
    (promptPreview?.materials ?? [])
      .map((material) => material.materialId)
      .filter((materialId) => materialId.startsWith("tool:"))
      .map((materialId) => materialId.slice("tool:".length)),
  );
  const sanitizedToolCount = manifest.harness.tools.filter((tool) => {
    return stableJson(tool.inputSchema ?? true) !== stableJson(normalizeProviderInputSchema(tool.inputSchema));
  }).length;
  const providerFamilies: ProviderToolSchemaFamily[] = ["openaiResponses", "anthropicMessages", "geminiGenerateContent"];
  return {
    praxisToolCount: manifest.harness.tools.length,
    expandedToolCount: expandedToolIds.size,
    foldedToolCount: Math.max(0, manifest.harness.tools.length - expandedToolIds.size),
    targets: providerFamilies.map((providerFamily) => {
      const bundle = lowerPraxisToolsForProvider({ providerFamily, manifest });
      const runtimeDecisionToolCount = Math.max(0, bundle.tools.length - manifest.harness.tools.length);
      return {
        providerFamily,
        providerToolCount: bundle.tools.length,
        mappingCount: bundle.mappings.length,
        runtimeDecisionToolCount,
        declarationHash: bundle.declarationHash,
        sanitizedToolCount,
        cachePrefixHealth: bundle.cacheHintPlan.cacheRiskWarnings.length === 0 ? "stable" : "warning",
        schemaRejectedRisk: bundle.warnings.length === 0 ? "low" : "warning",
        warnings: [...bundle.warnings, ...bundle.cacheHintPlan.cacheRiskWarnings],
      };
    }),
  };
}

function normalizePromptPreview(
  preview: FrameworkPromptPackPreviewInput | undefined,
): FrameworkInspectionReport["promptPackPreview"] {
  if (preview === undefined) {
    return undefined;
  }

  return {
    promptPackId: preview.promptPackId,
    materialCount: preview.materials.length,
    materials: preview.materials.map((material) => ({
      ...material,
      preview: publicPreview(material.preview),
    })),
    cachePlan: preview.cachePlan === undefined ? undefined : {
      strategy: preview.cachePlan.strategy,
      segmentCount: preview.cachePlan.segments.length,
      segments: preview.cachePlan.segments.map((segment) => ({
        segmentKind: segment.segmentKind,
        stability: segment.stability,
        cachePolicy: segment.cachePolicy,
        segmentHash: segment.segmentHash,
        estimatedTokens: segment.estimatedTokens,
        materialRefs: segment.materialRefs,
      })),
      cacheablePrefixSegmentKinds: preview.cachePlan.cacheablePrefixSegmentKinds,
      dynamicSegmentKinds: preview.cachePlan.dynamicSegmentKinds,
      cacheRiskWarnings: preview.cachePlan.cacheRiskWarnings,
    },
    providerPayloadBuilt: false,
  };
}

function storageSummary(storageRuntime: StoragePlaneRuntime): FrameworkInspectionReport["storage"] {
  const missingDirectories = storageRuntime.initPlan.directories
    .filter((directory) => !directory.existing)
    .map((directory) => directory.path);

  return {
    homeRoot: storageRuntime.layout.home.root,
    workspaceRoot: storageRuntime.layout.workspace.root,
    sessionSqlitePath: storageRuntime.layout.workspace.sessionSqlitePath,
    artifactRoot: storageRuntime.layout.workspace.artifacts,
    cacheRoot: storageRuntime.layout.workspace.cache,
    sandboxRoot: storageRuntime.layout.workspace.sandbox,
    initialized: missingDirectories.length === 0,
    missingDirectories,
    initPlanDirectoryCount: storageRuntime.initPlan.directories.length,
    writesSecrets: false,
  };
}

function sandboxSummary(manifest: AgentManifest, readiness: FrameworkSandboxReadinessInput | undefined): FrameworkInspectionReport["sandbox"] {
  const spec = manifest.sandbox;
  const providerFamily = spec.providerFamily ?? spec.profile;
  const isLinuxBubblewrap = providerFamily === "linux-bubblewrap";
  const toolPolicyProfile = manifest.toolPolicy.profile;
  const broadDevice = toolPolicyProfile === "bapr" || toolPolicyProfile === "yolo";
  return {
    sandboxId: spec.sandboxId,
    profile: spec.profile,
    providerFamily,
    isolationLevel: spec.isolationLevel ?? "custom",
    realIsolation: isLinuxBubblewrap,
    filesystem: spec.filesystem,
    network: spec.network,
    shell: spec.shell,
    dependencyRefs: spec.dependencyRefs ?? [],
    mountPolicy: spec.mountPolicy,
    networkPolicy: spec.networkPolicy,
    processPolicy: spec.processPolicy,
    platformSupport: spec.platformSupport,
    readiness: {
      ready: readiness?.ready,
      reason: readiness?.reason,
      probeStatus: readiness?.probeStatus,
      smokeStatus: readiness?.smokeStatus,
      missingDependencies: readiness?.missingDependencies ?? [],
      selfRepairHints: readiness?.selfRepairHints ?? [],
    },
    linuxBubblewrap: !isLinuxBubblewrap ? undefined : {
      providerVersion: spec.metadata?.providerVersion,
      fallback: spec.metadata?.fallback,
      home: spec.metadata?.home,
      tmp: spec.metadata?.tmp,
      artifacts: spec.metadata?.artifacts,
      networkMode: spec.networkPolicy?.outbound ?? "provider-policy",
      deviceExposure: broadDevice ? "bapr-yolo-broad" : "minimal-by-default",
    },
  };
}

function emptyToolDeveloperReadinessCounts(): Record<BaseToolDeveloperReadiness, number> {
  return {
    ready: 0,
    usableWithApproval: 0,
    adapterRequired: 0,
    contractIncomplete: 0,
    notLiveProven: 0,
  };
}

function readyFromDeveloperReadiness(readiness: BaseToolDeveloperReadiness): boolean {
  return readiness === "ready" || readiness === "notLiveProven" || readiness === "usableWithApproval";
}

function reasonFromDeveloperReadiness(input: {
  toolId: string;
  readiness: BaseToolDeveloperReadiness;
  missingPorts: readonly string[];
}): string | undefined {
  if (input.readiness === "contractIncomplete") return `BaseTool ${input.toolId} contract or storage is incomplete`;
  if (input.readiness === "adapterRequired") {
    return input.missingPorts.length > 0
      ? `BaseTool ${input.toolId} requires runtime adapter ports: ${input.missingPorts.join(", ")}`
      : `BaseTool ${input.toolId} requires a runtime adapter`;
  }
  if (input.readiness === "usableWithApproval") return `BaseTool ${input.toolId} is usable after runtime approval`;
  if (input.readiness === "notLiveProven") return `BaseTool ${input.toolId} is mounted but has no live smoke proof yet`;
  return undefined;
}

function toolsFromManifest(manifest: AgentManifest): readonly FrameworkToolReadinessInput[] {
  const ledger = new Map(createBaseToolRealityLedger().map((entry) => [entry.toolId, entry]));
  return manifest.harness.tools.map((tool): FrameworkToolReadinessInput => {
    const entry = ledger.get(tool.toolId);
    if (entry === undefined) {
      return {
        toolId: tool.toolId,
        family: tool.family,
        group: tool.group,
        ready: false,
        required: true,
        reason: `BaseTool ${tool.toolId} is not present in the runtime reality ledger`,
      };
    }

    return {
      toolId: entry.toolId,
      family: entry.storageFamily,
      group: entry.group,
      ready: readyFromDeveloperReadiness(entry.developerReadiness),
      required: true,
      reason: reasonFromDeveloperReadiness({
        toolId: entry.toolId,
        readiness: entry.developerReadiness,
        missingPorts: entry.missingPorts,
      }),
      developerReadiness: entry.developerReadiness,
      stages: entry.stages,
      dependencyStatus: entry.dependencyStatus,
      executorSupport: entry.executorSupport,
      missingPorts: entry.missingPorts,
    };
  });
}

export function createFrameworkInspectionReport(
  request?: FrameworkInspectionReportRequest,
): FrameworkInspectionReportResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "framework inspection report requires a runtimeId", "input");
  }

  if (request.manifest === undefined) {
    return failure("MISSING_MANIFEST", "framework inspection report requires an AgentManifest", "manifest");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const storageRuntime = createStoragePlaneRuntime({
    cwd: request.storage?.cwd,
    raxHome: request.storage?.raxHome,
    workspaceRoot: request.storage?.workspaceRoot ?? (request.manifest.storage.kind === "rax-workspace" ? request.manifest.storage.path : undefined),
    homeDir: request.storage?.homeDir,
    env: request.storage?.env,
    agentId: request.manifest.identity.id,
    initMode: request.manifest.storage.init,
  });
  if (!storageRuntime.ok) {
    return failure("READINESS_FAILED", storageRuntime.error.message, "readiness");
  }
  const requestedTools = request.tools ?? toolsFromManifest(request.manifest);
  const toolSignals = requestedTools.map((tool): RuntimeReadinessSignal => ({
    signalId: `tool:${tool.family ?? "unknown"}/${tool.group ?? "unknown"}/${tool.toolId}`,
    ready: tool.ready,
    required: tool.required,
    reason: tool.reason,
  }));
  const providerSignals = (request.providers ?? []).map((provider): RuntimeReadinessSignal => ({
    signalId: `provider:${provider.providerId}`,
    ready: provider.ready,
    required: provider.required,
    reason: provider.reason,
  }));
  const dependencySignals = (request.dependencies ?? []).map((dependency): RuntimeReadinessSignal => ({
    signalId: `dependency:${dependency.owner}:${dependency.dependencyId}`,
    ready: dependency.ready,
    required: dependency.required,
    reason: dependency.reason,
  }));
  const sandboxSignals: readonly RuntimeReadinessSignal[] = request.sandbox === undefined ? [] : [{
    signalId: `sandbox:${request.manifest.sandbox.providerFamily ?? request.manifest.sandbox.profile}`,
    ready: request.sandbox.ready,
    required: request.sandbox.required,
    reason: request.sandbox.reason,
  }];
  const missingStorageDirectories = storageRuntime.runtime.initPlan.directories.filter((directory) => !directory.existing);
  const storageSignals = [
    {
      signalId: "storage:rax.home",
      ready: true,
      required: true,
      reason: undefined,
    },
    {
      signalId: "storage:rax.workspace",
      ready: missingStorageDirectories.length === 0,
      required: false,
      reason: missingStorageDirectories.length === 0
        ? undefined
        : "Praxis workspace storage is not initialized; use the init plan before durable runs.",
    },
  ];

  const readiness = checkRuntimeReadiness({
    runtimeId,
    surfaces: issueSignals("surface", [
      { signalId: "manifest", ready: true, required: true },
      { signalId: "promptPack", ready: true, required: true },
      { signalId: "mainLoop", ready: true, required: true },
      { signalId: "sessionStateEvent", ready: true, required: true },
      ...storageSignals,
      ...sandboxSignals,
      ...providerSignals,
      ...toolSignals,
    ]),
    modules: [],
    invariants: issueSignals("invariant", dependencySignals),
    checkedAt: request.checkedAt,
  });

  if (!readiness.ok) {
    return failure("READINESS_FAILED", readiness.error.message, "readiness");
  }

  const manifest = inspectAgentManifest(request.manifest);
  const toolMissing = requestedTools.filter((tool) => tool.ready === false);
  const providerMissing = (request.providers ?? []).filter((provider) => provider.ready === false);
  const dependencySummary = summarizeMissing(request.dependencies ?? [], (dependency) => dependency.dependencyId);
  const sandbox = sandboxSummary(request.manifest, request.sandbox);
  const promptCacheWarnings = request.promptPackPreview?.cachePlan?.cacheRiskWarnings ?? [];
  const dependencyOwners = Object.fromEntries(
    [...new Set((request.dependencies ?? []).map((dependency) => dependency.owner))].map((owner) => [
      owner,
      (request.dependencies ?? []).filter((dependency) => dependency.owner === owner).length,
    ]),
  );
  const stepRecords = request.mainLoopSteps ?? [];
  const selfRepair = request.selfRepairSignal === undefined
    ? undefined
    : runSelfRepairRuntime({
        runtimeId,
        signal: request.selfRepairSignal,
        runtimeReady: request.runtimeReady,
      });

  if (selfRepair !== undefined && !selfRepair.ok) {
    return failure("SELF_REPAIR_FAILED", selfRepair.error.message, "selfRepair");
  }

  const findings: FrameworkInspectionFinding[] = [
    ...(missingStorageDirectories.length > 0 ? [{
      findingId: "storage.raxWorkspace.not-initialized",
      severity: "info" as const,
      section: "storage" as const,
      message: "Praxis workspace storage is not initialized yet; an init plan is available and writes no secrets.",
      remediation: "Run storage init from runtime or rax before durable SQLite sessions.",
    }] : []),
    ...(request.manifest.sandbox.profile === "host-observed" ? [{
      findingId: "sandbox.hostObserved.policyOnly",
      severity: "info" as const,
      section: "sandbox" as const,
      message: "host-observed sandbox records and governs actions but does not isolate host execution.",
      remediation: "Use linuxBubblewrap on Linux when real process isolation is required.",
    }] : []),
    ...(request.sandbox?.ready === false ? [{
      findingId: "sandbox.provider.not-ready",
      severity: request.sandbox.required === false ? "warning" as const : "error" as const,
      section: "sandbox" as const,
      message: request.sandbox.reason ?? "sandbox provider is not ready",
      remediation: request.sandbox.selfRepairHints?.[0] ?? "Resolve sandbox provider dependencies or choose another profile.",
    }] : []),
    ...toolMissing.map((tool) => readinessFinding("tools", tool.toolId, tool.reason, tool.required !== false)),
    ...providerMissing.map((provider) =>
      readinessFinding("provider", provider.providerId, provider.reason, provider.required !== false),
    ),
    ...promptCacheWarnings.map((warning): FrameworkInspectionFinding => ({
      findingId: `promptPack.cache.${warning}`,
      severity: "warning",
      section: "promptPack",
      message: `PromptPack cache risk detected: ${warning}`,
      remediation: "Keep stable prompt/tool material before dynamic turn, retrieval, and observation material.",
    })),
    ...dependencySummary.findings,
  ];
  const byToolDeveloperReadiness = emptyToolDeveloperReadinessCounts();
  for (const tool of requestedTools) {
    if (tool.developerReadiness !== undefined) {
      byToolDeveloperReadiness[tool.developerReadiness] += 1;
    }
  }

  return {
    ok: true,
    report: {
      runtimeId,
      status: statusFromFindings(findings),
      checkedAt: request.checkedAt?.trim() || "dry-run",
      manifest,
      policy: {
        profile: manifest.governance.toolPolicyProfile,
        sandbox: manifest.governance.sandboxProfile,
        approvalSurface: "interface/application",
      },
      sandbox,
      toolReadiness: {
        total: requestedTools.length,
        ready: requestedTools.length - toolMissing.length,
        missing: toolMissing.map((tool) => tool.toolId),
        byDeveloperReadiness: byToolDeveloperReadiness,
        tools: requestedTools.map((tool) => ({
          toolId: tool.toolId,
          family: tool.family,
          group: tool.group,
          ready: tool.ready !== false,
          developerReadiness: tool.developerReadiness,
          stages: tool.stages,
          dependencyStatus: tool.dependencyStatus,
          executorSupport: tool.executorSupport,
          missingPorts: tool.missingPorts,
          reason: tool.reason,
        })),
      },
      providerReadiness: {
        total: request.providers?.length ?? 0,
        ready: (request.providers?.length ?? 0) - providerMissing.length,
        missing: providerMissing.map((provider) => provider.providerId),
      },
      providerToolSchema: providerToolSchemaSummary(request.manifest, request.promptPackPreview),
      promptPackPreview: normalizePromptPreview(request.promptPackPreview),
      mainLoopTrace: {
        stepCount: stepRecords.length,
        actionPrimitives: [...new Set(stepRecords.map((step) => step.actionPrimitive))],
        failedSteps: stepRecords.filter((step) => step.status === "failed").map((step) => step.stepId),
      },
      dependencyGraph: {
        total: request.dependencies?.length ?? 0,
        missing: dependencySummary.missing,
        owners: dependencyOwners,
      },
      storage: storageSummary(storageRuntime.runtime),
      selfRepair: selfRepair?.outcome === undefined
        ? undefined
        : {
            status: selfRepair.outcome.status,
            nextStep: selfRepair.outcome.nextStep,
            unsafeSideEffects: false,
            planStepCount: selfRepair.outcome.plan?.steps.length ?? 0,
          },
      findings,
      audit: {
        reportSurface: "runtime.inspection.frameworkInspectionReport",
        unsafeSideEffects: false,
        rawSecretLeakageChecked: true,
      },
    },
    readiness: readiness.readiness,
    events: [
      "runtime.inspection.frameworkReport.created",
      ...readiness.events,
      ...(selfRepair?.events ?? []),
    ],
  };
}
