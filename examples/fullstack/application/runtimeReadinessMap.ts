export type RuntimeReadinessRisk = "low" | "medium" | "high";

export type RuntimeReadinessStatus = "ready" | "evidence-gap" | "blocked";

export interface RuntimeReadinessGap {
  readonly surface: string;
  readonly status: RuntimeReadinessStatus;
  readonly evidence: readonly string[];
  readonly risk: RuntimeReadinessRisk;
  readonly nextAction: string;
}

export interface RuntimeReadinessMapReport {
  readonly kind: "praxis.runtime.readinessMap.v1";
  readonly status: RuntimeReadinessStatus;
  readonly generatedFrom: readonly string[];
  readonly gaps: readonly RuntimeReadinessGap[];
  readonly summary: {
    readonly ready: number;
    readonly evidenceGap: number;
    readonly blocked: number;
    readonly highestRisk: RuntimeReadinessRisk;
  };
}

export interface RuntimeReadinessMapInput {
  readonly surfaceInspectionStatus?: string;
  readonly missingRequiredSurfaceIds?: readonly string[];
  readonly degradedSurfaceIds?: readonly string[];
  readonly mcpMountStatus?: string;
  readonly mcpMissingPortCount?: number;
  readonly sandboxMountStatus?: string;
  readonly sandboxProviderPrepared?: boolean;
  readonly toolFindingCount?: number;
  readonly promptCacheWarningCount?: number;
  readonly sessionStatus?: string;
  readonly runtimeResultOk?: boolean;
}

function surfaceStatus(ok: boolean, blocked: boolean): RuntimeReadinessStatus {
  if (blocked) return "blocked";
  return ok ? "ready" : "evidence-gap";
}

function highestRisk(gaps: readonly RuntimeReadinessGap[]): RuntimeReadinessRisk {
  if (gaps.some((gap) => gap.risk === "high")) return "high";
  if (gaps.some((gap) => gap.risk === "medium")) return "medium";
  return "low";
}

export function buildRuntimeReadinessMap(input: RuntimeReadinessMapInput): RuntimeReadinessMapReport {
  const missingRequiredSurfaceIds = input.missingRequiredSurfaceIds ?? [];
  const degradedSurfaceIds = input.degradedSurfaceIds ?? [];
  const mcpMissingPortCount = input.mcpMissingPortCount ?? 0;
  const toolFindingCount = input.toolFindingCount ?? 0;
  const promptCacheWarningCount = input.promptCacheWarningCount ?? 0;

  const managementReady =
    input.surfaceInspectionStatus === "ready" &&
    missingRequiredSurfaceIds.length === 0 &&
    degradedSurfaceIds.length === 0;
  const mcpReady = input.mcpMountStatus === "ready" && mcpMissingPortCount === 0;
  const sandboxReady = input.sandboxMountStatus === "ready" && input.sandboxProviderPrepared === true;
  const toolReady = toolFindingCount === 0;
  const smokeReady = input.sessionStatus === "completed" && input.runtimeResultOk === true;

  const gaps: RuntimeReadinessGap[] = [
    {
      surface: "application management plane",
      status: surfaceStatus(managementReady, missingRequiredSurfaceIds.length > 0),
      evidence: [
        `surface inspection status: ${input.surfaceInspectionStatus ?? "unknown"}`,
        `missing required surfaces: ${missingRequiredSurfaceIds.join(", ") || "none"}`,
        `degraded surfaces: ${degradedSurfaceIds.join(", ") || "none"}`,
      ],
      risk: missingRequiredSurfaceIds.length > 0 ? "high" : degradedSurfaceIds.length > 0 ? "medium" : "low",
      nextAction: managementReady
        ? "Keep management-plane smoke in the release checklist."
        : "Add a business-scenario management-plane smoke that proves inspect output answers readiness questions.",
    },
    {
      surface: "MCP and MCP+ runtime adapter",
      status: surfaceStatus(mcpReady, mcpMissingPortCount > 0),
      evidence: [
        `MCP mount matrix status: ${input.mcpMountStatus ?? "unknown"}`,
        `missing runtime port count: ${mcpMissingPortCount}`,
      ],
      risk: mcpMissingPortCount > 0 ? "high" : input.mcpMountStatus === "ready" ? "low" : "medium",
      nextAction: mcpReady
        ? "Keep native-vs-MCP+ compatibility evidence attached to the inspector output."
        : "Close missing runtime ports before presenting MCP/MCP+ as business-ready.",
    },
    {
      surface: "sandbox and execution substrate",
      status: surfaceStatus(sandboxReady, input.sandboxMountStatus === "blocked"),
      evidence: [
        `sandbox mount matrix status: ${input.sandboxMountStatus ?? "unknown"}`,
        `sandbox provider prepared: ${String(input.sandboxProviderPrepared ?? false)}`,
      ],
      risk: sandboxReady ? "low" : "medium",
      nextAction: sandboxReady
        ? "Keep host-observed sandbox evidence separate from true isolation claims."
        : "Add execution-substrate evidence before claiming production execution readiness.",
    },
    {
      surface: "skill plane and BaseTool readiness",
      status: surfaceStatus(toolReady, false),
      evidence: [
        `framework inspection finding count: ${toolFindingCount}`,
        `prompt cache warning count: ${promptCacheWarningCount}`,
      ],
      risk: toolReady ? "low" : "medium",
      nextAction: toolReady
        ? "Keep skill/BaseTool readiness in the repo-inspector contract."
        : "Turn tool findings into explicit adapter or approval follow-up issues.",
    },
    {
      surface: "runtime smoke evidence",
      status: surfaceStatus(smokeReady, input.runtimeResultOk === false),
      evidence: [
        `runtime session status: ${input.sessionStatus ?? "unknown"}`,
        `runtime dry-run result ok: ${String(input.runtimeResultOk ?? false)}`,
      ],
      risk: smokeReady ? "low" : "high",
      nextAction: smokeReady
        ? "Promote this smoke as the minimum proof for business-facing readiness reviews."
        : "Fix the dry-run smoke before expanding runtime/application surface area.",
    },
  ];

  const summary = {
    ready: gaps.filter((gap) => gap.status === "ready").length,
    evidenceGap: gaps.filter((gap) => gap.status === "evidence-gap").length,
    blocked: gaps.filter((gap) => gap.status === "blocked").length,
    highestRisk: highestRisk(gaps),
  };

  return {
    kind: "praxis.runtime.readinessMap.v1",
    status: summary.blocked > 0 ? "blocked" : summary.evidenceGap > 0 ? "evidence-gap" : "ready",
    generatedFrom: [
      "runtime surface inspection",
      "MCP mount matrix",
      "sandbox mount matrix",
      "framework inspection",
      "runtime dry-run smoke",
    ],
    gaps,
    summary,
  };
}
