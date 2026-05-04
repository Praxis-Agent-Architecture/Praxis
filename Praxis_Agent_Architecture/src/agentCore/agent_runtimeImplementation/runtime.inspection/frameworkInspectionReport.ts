/*
 * 文件定位：Agent 运行态实现层 / framework core 聚合检查面。
 * 核心目的：把 Manifest、readiness、PromptPack、MainLoop、SelfRepair 的只读诊断收束成开发者可读报告。
 * 边界：只做 inspect/debug/selfRepair contract，不执行模型、工具、官方模块策略或修复动作。
 */

import type { MainLoopStepRecord } from "../../agent_executionEngine/coreLogic/mainLoop.js";
import type { RuntimeFaultSignal } from "../runtime.selfRepair/faultClassifier.js";
import { runSelfRepairRuntime, type SelfRepairRuntimeOutcome } from "../runtime.selfRepair/selfRepairRuntime.js";
import { inspectAgentManifest, type AgentManifest, type AgentManifestInspection } from "../runtimeAgentManifest.js";
import { checkRuntimeReadiness, type RuntimeReadinessSignal, type RuntimeReadinessSnapshot } from "./runtimeReadinessCheck.js";

export type FrameworkInspectionReportStatus = "ready" | "degraded" | "blocked";

export type FrameworkInspectionFindingSeverity = "info" | "warning" | "error";

export type FrameworkInspectionFinding = {
  findingId: string;
  severity: FrameworkInspectionFindingSeverity;
  section: "manifest" | "policy" | "tools" | "provider" | "promptPack" | "mainLoop" | "dependency" | "selfRepair";
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

export type FrameworkPromptPackPreviewInput = {
  promptPackId: string;
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
  tools?: readonly FrameworkToolReadinessInput[];
  providers?: readonly FrameworkProviderReadinessInput[];
  dependencies?: readonly FrameworkDependencyInput[];
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
  toolReadiness: {
    total: number;
    ready: number;
    missing: readonly string[];
  };
  providerReadiness: {
    total: number;
    ready: number;
    missing: readonly string[];
  };
  promptPackPreview?: {
    promptPackId: string;
    materialCount: number;
    materials: readonly FrameworkPromptPackPreviewInput["materials"][number][];
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
    providerPayloadBuilt: false,
  };
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
  const toolSignals = (request.tools ?? []).map((tool): RuntimeReadinessSignal => ({
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

  const readiness = checkRuntimeReadiness({
    runtimeId,
    surfaces: issueSignals("surface", [
      { signalId: "manifest", ready: true, required: true },
      { signalId: "promptPack", ready: true, required: true },
      { signalId: "mainLoop", ready: true, required: true },
      { signalId: "sessionStateEvent", ready: true, required: true },
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
  const toolMissing = (request.tools ?? []).filter((tool) => tool.ready === false);
  const providerMissing = (request.providers ?? []).filter((provider) => provider.ready === false);
  const dependencySummary = summarizeMissing(request.dependencies ?? [], (dependency) => dependency.dependencyId);
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
    ...toolMissing.map((tool) => readinessFinding("tools", tool.toolId, tool.reason, tool.required !== false)),
    ...providerMissing.map((provider) =>
      readinessFinding("provider", provider.providerId, provider.reason, provider.required !== false),
    ),
    ...dependencySummary.findings,
  ];

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
      toolReadiness: {
        total: request.tools?.length ?? 0,
        ready: (request.tools?.length ?? 0) - toolMissing.length,
        missing: toolMissing.map((tool) => tool.toolId),
      },
      providerReadiness: {
        total: request.providers?.length ?? 0,
        ready: (request.providers?.length ?? 0) - providerMissing.length,
        missing: providerMissing.map((provider) => provider.providerId),
      },
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
