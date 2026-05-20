/*
 * 文件定位：Agent 运行态实现层 / 运行检查面。
 * 核心目的：承载 runtime Inspect Report 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  inspectAgentManifest,
  type AgentManifest,
  type AgentManifestInspection,
  type BaseToolPolicyProfile,
} from "../runtimeAgentManifest.js";
import {
  cleanRuntimeInspectionList,
  isRuntimeInspectionBlank,
  rejectRuntimeInspection,
  type RuntimeInspectionFailure,
  type RuntimeInspectionFinding,
  type RuntimeInspectionGate,
  type RuntimeInspectionSeverity,
} from "./runtimeInspector.js";

export type RuntimeInspectReportAudience = "application" | "official-module" | "management" | "inspection" | "debug";

export type RuntimeInspectReportStatus = "ready" | "degraded" | "blocked";

export type RuntimeInspectReportTool = {
  toolId?: string;
  family?: string;
  group?: string;
  ready?: boolean;
  required?: boolean;
  reason?: string;
  dependencies?: readonly RuntimeInspectReportDependency[];
};

export type RuntimeInspectReportDependency = {
  dependencyId?: string;
  kind?: "provider" | "baseTool" | "mcp" | "storage" | "runtime-surface" | "other" | (string & {});
  ready?: boolean;
  required?: boolean;
  reason?: string;
};

export type RuntimeInspectReportPreview = {
  previewId?: string;
  available?: boolean;
  materialCount?: number;
  toolDeclarationCount?: number;
  safeSummary?: string;
};

export type RuntimeInspectReportTrace = {
  traceId?: string;
  available?: boolean;
  stepCount?: number;
  lastActionPrimitive?: string;
  safeSummary?: string;
};

export type RuntimeInspectReportDebug = {
  health?: "healthy" | "degraded" | "blocked";
  providerReady?: boolean;
  baseToolReady?: boolean;
  replayPreviewAvailable?: boolean;
  findings?: readonly RuntimeInspectionFinding[];
};

export type RuntimeInspectReportSelfRepair = {
  planAvailable?: boolean;
  planStatus?: "plan-ready" | "approval-required" | "escalated" | "unavailable";
  unsafeSideEffects?: boolean;
  nextStep?: string;
};

export type RuntimeInspectReportRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  audience?: RuntimeInspectReportAudience;
  manifest?: AgentManifest;
  tools?: readonly RuntimeInspectReportTool[];
  missingRequirements?: readonly string[];
  dependencyGraph?: {
    ready?: boolean;
    blockingIssues?: readonly { nodeId?: string; reason?: string }[];
    evaluationOrder?: readonly string[];
  };
  promptPackPreview?: RuntimeInspectReportPreview;
  mainLoopTrace?: RuntimeInspectReportTrace;
  debug?: RuntimeInspectReportDebug;
  selfRepair?: RuntimeInspectReportSelfRepair;
  contract?: RuntimeInspectionGate;
  governance?: RuntimeInspectionGate;
};

export type RuntimeInspectReportSectionStatus = "ready" | "degraded" | "blocked" | "not-provided";

export type RuntimeInspectReportSection = {
  sectionId: string;
  status: RuntimeInspectReportSectionStatus;
  summary: string;
  findings: readonly RuntimeInspectionFinding[];
};

export type RuntimeInspectReport = {
  runtimeId: string;
  status: RuntimeInspectReportStatus;
  audience?: RuntimeInspectReportAudience;
  reportSurface: "runtime.inspection.runtimeInspectReport";
  manifest?: AgentManifestInspection;
  sections: {
    manifest: RuntimeInspectReportSection;
    tools: RuntimeInspectReportSection;
    policy: RuntimeInspectReportSection;
    sandbox: RuntimeInspectReportSection;
    session: RuntimeInspectReportSection;
    state: RuntimeInspectReportSection;
    promptPackPreview: RuntimeInspectReportSection;
    mainLoopTrace: RuntimeInspectReportSection;
    dependencyGraph: RuntimeInspectReportSection;
    debug: RuntimeInspectReportSection;
    selfRepair: RuntimeInspectReportSection;
    missingRequirements: RuntimeInspectReportSection;
  };
  findings: readonly RuntimeInspectionFinding[];
  missingRequirements: readonly string[];
  unsafeSideEffects: false;
  secretLeakageDetected: false;
  governanceChecked: true;
  contractChecked: true;
};

export type RuntimeInspectReportResult =
  | {
      ok: true;
      report: RuntimeInspectReport;
      events: readonly string[];
    }
  | RuntimeInspectionFailure;

export const runtimeInspectReportDescriptor = {
  surface: "runtime.inspection",
  capability: "runtimeInspectReport",
  purpose: "aggregate public-safe runtime, manifest, readiness, debug, and self-repair summaries for developers",
  unsafeSideEffects: false,
} as const;

const SECRET_PATTERN = /(api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|password|token|secret|private[_-]?key)/i;

function finding(
  findingId: string,
  severity: RuntimeInspectionSeverity,
  message: string,
  relatedSurface?: string,
): RuntimeInspectionFinding {
  return {
    findingId,
    severity,
    boundary: severity === "error" ? "check" : "surface",
    message,
    relatedSurface,
  };
}

function section(
  sectionId: RuntimeInspectReportSection["sectionId"],
  summary: string,
  findings: readonly RuntimeInspectionFinding[] = [],
): RuntimeInspectReportSection {
  const status: RuntimeInspectReportSectionStatus =
    findings.some((item) => item.severity === "error")
      ? "blocked"
      : findings.some((item) => item.severity === "warning")
        ? "degraded"
        : "ready";

  return { sectionId, status, summary, findings };
}

function notProvided(sectionId: RuntimeInspectReportSection["sectionId"], summary: string): RuntimeInspectReportSection {
  return { sectionId, status: "not-provided", summary, findings: [] };
}

function hasUnsafeText(value: unknown): boolean {
  if (typeof value === "string") {
    if (value === "no-raw-secrets") {
      return false;
    }

    return SECRET_PATTERN.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(hasUnsafeText);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as Readonly<Record<string, unknown>>).some(hasUnsafeText);
  }

  return false;
}

function manifestSection(manifest: AgentManifestInspection | undefined): RuntimeInspectReportSection {
  if (manifest === undefined) {
    return notProvided("manifest", "manifest inspection was not provided");
  }

  return section(
    "manifest",
    `manifest ${manifest.manifestId} for ${manifest.identityId} uses ${manifest.model.provider}/${manifest.model.model}`,
  );
}

function toolSections(tools: readonly RuntimeInspectReportTool[] | undefined): {
  tools: RuntimeInspectReportSection;
  missingDependencies: readonly RuntimeInspectionFinding[];
} {
  if (tools === undefined) {
    return {
      tools: notProvided("tools", "tool readiness inspection was not provided"),
      missingDependencies: [],
    };
  }

  const toolFindings: RuntimeInspectionFinding[] = [];
  const dependencyFindings: RuntimeInspectionFinding[] = [];

  for (const [index, tool] of tools.entries()) {
    const toolId = tool.toolId?.trim() || `tool:${index + 1}`;
    if (tool.ready === false && tool.required !== false) {
      toolFindings.push(finding(`${toolId}.not-ready`, "error", tool.reason ?? `${toolId} is required but not ready`, toolId));
    }

    for (const dependency of tool.dependencies ?? []) {
      const dependencyId = dependency.dependencyId?.trim() || `${toolId}.dependency`;
      if (dependency.ready === false && dependency.required !== false) {
        dependencyFindings.push(
          finding(
            `${toolId}.${dependencyId}.missing`,
            "error",
            dependency.reason ?? `${toolId} is missing required dependency ${dependencyId}`,
            toolId,
          ),
        );
      }
    }
  }

  return {
    tools: section("tools", `${tools.length} tool readiness entries inspected`, toolFindings),
    missingDependencies: dependencyFindings,
  };
}

function previewSection(preview: RuntimeInspectReportPreview | undefined): RuntimeInspectReportSection {
  if (preview === undefined) {
    return notProvided("promptPackPreview", "promptPack preview was not provided");
  }

  if (preview.available === false) {
    return section("promptPackPreview", "promptPack preview is unavailable", [
      finding("promptPack.preview.unavailable", "warning", preview.safeSummary ?? "promptPack preview is unavailable", "promptPack"),
    ]);
  }

  return section(
    "promptPackPreview",
    `promptPack preview available with ${preview.materialCount ?? 0} materials and ${preview.toolDeclarationCount ?? 0} tool declarations`,
  );
}

function traceSection(trace: RuntimeInspectReportTrace | undefined): RuntimeInspectReportSection {
  if (trace === undefined) {
    return notProvided("mainLoopTrace", "mainLoop trace was not provided");
  }

  if (trace.available === false) {
    return section("mainLoopTrace", "mainLoop trace is unavailable", [
      finding("mainLoop.trace.unavailable", "warning", trace.safeSummary ?? "mainLoop trace is unavailable", "mainLoop"),
    ]);
  }

  return section(
    "mainLoopTrace",
    `mainLoop trace available with ${trace.stepCount ?? 0} steps`,
  );
}

function dependencyGraphSection(
  graph: RuntimeInspectReportRequest["dependencyGraph"],
): RuntimeInspectReportSection {
  if (graph === undefined) {
    return notProvided("dependencyGraph", "dependency graph report was not provided");
  }

  const graphFindings = (graph.blockingIssues ?? []).map((issue, index) =>
    finding(
      `dependencyGraph.${issue.nodeId?.trim() || index + 1}.blocked`,
      "error",
      issue.reason?.trim() || `${issue.nodeId?.trim() || "dependency node"} is blocked`,
      "runtime.runtimeDependencyGraph",
    ),
  );

  return section(
    "dependencyGraph",
    `dependency graph ${graph.ready === false ? "has blocking issues" : "is ready"} with ${(graph.evaluationOrder ?? []).length} ordered nodes`,
    graphFindings,
  );
}

function debugSection(debug: RuntimeInspectReportDebug | undefined): RuntimeInspectReportSection {
  if (debug === undefined) {
    return notProvided("debug", "debug report was not provided");
  }

  const debugFindings = [...(debug.findings ?? [])];
  if (debug.providerReady === false) {
    debugFindings.push(finding("debug.provider.not-ready", "error", "provider readiness is blocked", "runtime.debug"));
  }
  if (debug.baseToolReady === false) {
    debugFindings.push(finding("debug.baseTool.not-ready", "error", "BaseTool readiness is blocked", "runtime.debug"));
  }

  return section("debug", `debug health is ${debug.health ?? "healthy"}`, debugFindings);
}

function selfRepairSection(selfRepair: RuntimeInspectReportSelfRepair | undefined): RuntimeInspectReportSection {
  if (selfRepair === undefined) {
    return notProvided("selfRepair", "selfRepair plan output was not provided");
  }

  const selfRepairFindings: RuntimeInspectionFinding[] = [];
  if (selfRepair.unsafeSideEffects === true) {
    selfRepairFindings.push(
      finding("selfRepair.sideEffect.blocked", "error", "selfRepair report must remain dry-run before approval", "runtime.selfRepair"),
    );
  }
  if (selfRepair.planAvailable === false) {
    selfRepairFindings.push(
      finding("selfRepair.plan.unavailable", "warning", "selfRepair dry-run plan is unavailable", "runtime.selfRepair"),
    );
  }

  return section("selfRepair", `selfRepair status is ${selfRepair.planStatus ?? "unavailable"}`, selfRepairFindings);
}

function statusFromSections(sections: readonly RuntimeInspectReportSection[]): RuntimeInspectReportStatus {
  if (sections.some((item) => item.status === "blocked")) {
    return "blocked";
  }

  if (sections.some((item) => item.status === "degraded" || item.status === "not-provided")) {
    return "degraded";
  }

  return "ready";
}

export function createRuntimeInspectReport(request: RuntimeInspectReportRequest = {}): RuntimeInspectReportResult {
  if (isRuntimeInspectionBlank(request.runtimeId)) {
    return rejectRuntimeInspection(
      "MISSING_RUNTIME_ID",
      "runtime inspect report requires a runtimeId",
      "input",
      "runtime.inspection.inspectReport.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeInspection(
      "RUNTIME_NOT_READY",
      "runtime inspect report can only inspect a ready runtime surface",
      "runtime-state",
      "runtime.inspection.inspectReport.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeInspection(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime inspect report was rejected by contract surface",
      "contract",
      "runtime.inspection.inspectReport.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeInspection(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime inspect report was rejected by governance",
      "governance",
      "runtime.inspection.inspectReport.rejected",
    );
  }

  if (hasUnsafeText(request)) {
    return rejectRuntimeInspection(
      "CHECK_FAILED",
      "runtime inspect report rejected unsafe secret-like text",
      "check",
      "runtime.inspection.inspectReport.rejected",
    );
  }

  const manifest = request.manifest === undefined ? undefined : inspectAgentManifest(request.manifest);
  const toolInspection = toolSections(request.tools);
  const missingRequirements = cleanRuntimeInspectionList(request.missingRequirements);
  const missingRequirementFindings = missingRequirements.map((requirement) =>
    finding(
      `runtimeRequirement.${requirement}.missing`,
      "error",
      `runtime requirement is missing: ${requirement}`,
      "runtimeRequirements",
    ),
  );

  const sections = {
    manifest: manifestSection(manifest),
    tools: toolInspection.tools,
    policy: manifest === undefined
      ? notProvided("policy", "policy inspection was not provided")
      : section("policy", `tool policy profile is ${manifest.governance.toolPolicyProfile as BaseToolPolicyProfile}`),
    sandbox: manifest === undefined
      ? notProvided("sandbox", "sandbox inspection was not provided")
      : section("sandbox", `sandbox profile is ${manifest.governance.sandboxProfile}`),
    session: manifest === undefined
      ? notProvided("session", "session inspection was not provided")
      : section("session", `session persistence is ${manifest.sessionState.persistence}`),
    state: manifest === undefined
      ? notProvided("state", "state inspection was not provided")
      : section("state", `${manifest.sessionState.exposedState.length} state fields exposed`),
    promptPackPreview: previewSection(request.promptPackPreview),
    mainLoopTrace: traceSection(request.mainLoopTrace),
    dependencyGraph: dependencyGraphSection(request.dependencyGraph),
    debug: debugSection(request.debug),
    selfRepair: selfRepairSection(request.selfRepair),
    missingRequirements: section(
      "missingRequirements",
      `${missingRequirements.length} missing runtime requirements`,
      missingRequirementFindings,
    ),
  };

  const allSections = Object.values(sections);
  const findings = [
    ...allSections.flatMap((item) => item.findings),
    ...toolInspection.missingDependencies,
  ];
  const status = statusFromSections(allSections);
  const runtimeId = (request.runtimeId ?? "").trim();

  return {
    ok: true,
    report: {
      runtimeId,
      status,
      audience: request.audience,
      reportSurface: "runtime.inspection.runtimeInspectReport",
      manifest,
      sections,
      findings,
      missingRequirements,
      unsafeSideEffects: false,
      secretLeakageDetected: false,
      governanceChecked: true,
      contractChecked: true,
    },
    events: [`runtime.inspection.inspectReport.${status}`],
  };
}
