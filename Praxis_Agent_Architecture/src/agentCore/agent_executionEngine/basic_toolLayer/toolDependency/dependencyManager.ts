/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层。
 * 核心目的：承载 dependency Manager 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ToolDependencyBoundary = "input" | "contract" | "governance" | "scope" | "permission";

export type ToolDependencyKind = "binary" | "runtime" | "environment" | "package" | "service" | "permission" | "custom";

export type ToolDependencyStatus = "satisfied" | "missing" | "stale" | "conflict" | "blocked" | "unknown";

export type ToolDependencyDeclaration = {
  dependencyId?: string;
  kind?: ToolDependencyKind;
  displayName?: string;
  required?: boolean;
  requestedVersion?: string;
  acceptedVersions?: readonly string[];
  requiredScopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyProbe = {
  dependencyId?: string;
  available?: boolean;
  version?: string;
  resolvedPath?: string;
  blocked?: boolean;
  conflictWith?: readonly string[];
  observedAt?: string;
  detail?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyManagerContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyManagerRequest = {
  toolId?: string;
  declarations?: readonly ToolDependencyDeclaration[];
  probes?: readonly ToolDependencyProbe[];
  context?: ToolDependencyManagerContext;
};

export type ToolDependencyManagerErrorCode =
  | "MISSING_TOOL_ID"
  | "MISSING_DECLARATIONS"
  | "INVALID_DEPENDENCY_ID"
  | "DUPLICATE_DEPENDENCY_ID"
  | "REAL_DEPENDENCY_RESOLUTION_NOT_ALLOWED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type ToolDependencyManagerError = {
  code: ToolDependencyManagerErrorCode;
  message: string;
  boundary: ToolDependencyBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ToolDependencyResolution = {
  dependencyId: string;
  kind: ToolDependencyKind;
  displayName: string;
  required: boolean;
  status: ToolDependencyStatus;
  requestedVersion?: string;
  observedVersion?: string;
  resolvedPath?: string;
  acceptedVersions: readonly string[];
  requiredScopes: readonly string[];
  missingScopes: readonly string[];
  conflictWith: readonly string[];
  reasons: readonly string[];
  observedAt?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ToolDependencyReport = {
  toolId: string;
  runtimeId?: string;
  invocationId?: string;
  status: ToolDependencyStatus;
  resolutions: readonly ToolDependencyResolution[];
  summary: {
    total: number;
    satisfied: number;
    missing: number;
    stale: number;
    conflict: number;
    blocked: number;
    unknown: number;
    requiredUnsatisfied: number;
  };
  dryRun: true;
  unsafeSideEffects: false;
  audit: {
    event: "agentCore.basicToolLayer.toolDependency.manager.resolved";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ToolDependencyManagerResult =
  | {
      ok: true;
      report: ToolDependencyReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ToolDependencyManagerError;
      events: readonly string[];
    };

export const toolDependencyManagerDescriptor = {
  layer: "agent_executionEngine.basic_toolLayer.toolDependency",
  capability: "dependency-management",
  defaultDryRun: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ToolDependencyManagerErrorCode,
  message: string,
  boundary: ToolDependencyBoundary,
): ToolDependencyManagerResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicToolLayer.toolDependency.manager.rejected"],
  };
}

function normalizeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  return metadata ?? {};
}

function normalizeProbeMap(probes: readonly ToolDependencyProbe[] | undefined): Map<string, ToolDependencyProbe> {
  const probeMap = new Map<string, ToolDependencyProbe>();

  for (const probe of probes ?? []) {
    const dependencyId = probe.dependencyId?.trim();
    if (dependencyId !== undefined && dependencyId.length > 0) {
      probeMap.set(dependencyId, probe);
    }
  }

  return probeMap;
}

function resolveVersionStatus(
  declaration: ToolDependencyDeclaration,
  probe: ToolDependencyProbe,
): { stale: boolean; reasons: string[] } {
  const acceptedVersions = cleanList(declaration.acceptedVersions);
  const requestedVersion = declaration.requestedVersion?.trim();
  const observedVersion = probe.version?.trim();
  const reasons: string[] = [];

  if (observedVersion === undefined || observedVersion.length === 0) {
    return { stale: false, reasons };
  }

  if (requestedVersion !== undefined && requestedVersion.length > 0 && observedVersion !== requestedVersion) {
    reasons.push(`observed version ${observedVersion} differs from requested version ${requestedVersion}`);
    return { stale: true, reasons };
  }

  if (acceptedVersions.length > 0 && !acceptedVersions.includes(observedVersion)) {
    reasons.push(`observed version ${observedVersion} is outside accepted versions`);
    return { stale: true, reasons };
  }

  return { stale: false, reasons };
}

function resolveDependencyStatus(
  declaration: ToolDependencyDeclaration,
  probe: ToolDependencyProbe | undefined,
  allowedScopes: readonly string[],
): Pick<
  ToolDependencyResolution,
  "status" | "missingScopes" | "conflictWith" | "reasons" | "observedVersion" | "resolvedPath" | "observedAt"
> {
  const requiredScopes = cleanList(declaration.requiredScopes);
  const missingScopes = requiredScopes.filter((scope) => !allowedScopes.includes(scope));
  const conflictWith = cleanList(probe?.conflictWith);
  const reasons: string[] = [];

  if (missingScopes.length > 0) {
    reasons.push(`dependency scope ${missingScopes[0]} is outside runtime governance`);
    return {
      status: "blocked",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: probe?.version?.trim() || undefined,
      resolvedPath: probe?.resolvedPath?.trim() || undefined,
      observedAt: probe?.observedAt?.trim() || undefined,
    };
  }

  if (probe?.blocked === true) {
    reasons.push(probe.detail?.trim() || "dependency probe was blocked by runtime governance");
    return {
      status: "blocked",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: probe.version?.trim() || undefined,
      resolvedPath: probe.resolvedPath?.trim() || undefined,
      observedAt: probe.observedAt?.trim() || undefined,
    };
  }

  if (conflictWith.length > 0) {
    reasons.push(`dependency conflicts with ${conflictWith.join(", ")}`);
    return {
      status: "conflict",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: probe?.version?.trim() || undefined,
      resolvedPath: probe?.resolvedPath?.trim() || undefined,
      observedAt: probe?.observedAt?.trim() || undefined,
    };
  }

  if (probe === undefined) {
    reasons.push("no dependency probe supplied");
    return {
      status: "unknown",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: undefined,
      resolvedPath: undefined,
      observedAt: undefined,
    };
  }

  if (probe.available === false) {
    reasons.push(probe.detail?.trim() || "dependency is missing from the observed environment");
    return {
      status: "missing",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: probe.version?.trim() || undefined,
      resolvedPath: probe.resolvedPath?.trim() || undefined,
      observedAt: probe.observedAt?.trim() || undefined,
    };
  }

  const versionStatus = resolveVersionStatus(declaration, probe);
  if (versionStatus.stale) {
    return {
      status: "stale",
      missingScopes,
      conflictWith,
      reasons: versionStatus.reasons,
      observedVersion: probe.version?.trim() || undefined,
      resolvedPath: probe.resolvedPath?.trim() || undefined,
      observedAt: probe.observedAt?.trim() || undefined,
    };
  }

  if (probe.available === true) {
    reasons.push("dependency probe is available");
    return {
      status: "satisfied",
      missingScopes,
      conflictWith,
      reasons,
      observedVersion: probe.version?.trim() || undefined,
      resolvedPath: probe.resolvedPath?.trim() || undefined,
      observedAt: probe.observedAt?.trim() || undefined,
    };
  }

  reasons.push("dependency probe did not include availability");
  return {
    status: "unknown",
    missingScopes,
    conflictWith,
    reasons,
    observedVersion: probe.version?.trim() || undefined,
    resolvedPath: probe.resolvedPath?.trim() || undefined,
    observedAt: probe.observedAt?.trim() || undefined,
  };
}

function summarize(resolutions: readonly ToolDependencyResolution[]): ToolDependencyReport["summary"] {
  const summary: ToolDependencyReport["summary"] = {
    total: resolutions.length,
    satisfied: 0,
    missing: 0,
    stale: 0,
    conflict: 0,
    blocked: 0,
    unknown: 0,
    requiredUnsatisfied: 0,
  };

  for (const resolution of resolutions) {
    summary[resolution.status] += 1;
    if (resolution.required && resolution.status !== "satisfied") {
      summary.requiredUnsatisfied += 1;
    }
  }

  return summary;
}

function reportStatus(summary: ToolDependencyReport["summary"]): ToolDependencyStatus {
  if (summary.blocked > 0) {
    return "blocked";
  }

  if (summary.conflict > 0) {
    return "conflict";
  }

  if (summary.missing > 0) {
    return "missing";
  }

  if (summary.stale > 0) {
    return "stale";
  }

  if (summary.unknown > 0) {
    return "unknown";
  }

  return "satisfied";
}

export function manageToolDependencies(request: ToolDependencyManagerRequest = {}): ToolDependencyManagerResult {
  const toolId = request.toolId?.trim();
  if (isBlank(toolId)) {
    return failure("MISSING_TOOL_ID", "dependencyManager requires toolId", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_DEPENDENCY_RESOLUTION_NOT_ALLOWED",
      "first-round dependencyManager only normalizes dry-run dependency resolution",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "dependencyManager was rejected by runtime governance",
      "governance",
    );
  }

  const declarations = request.declarations ?? [];
  if (declarations.length === 0) {
    return failure("MISSING_DECLARATIONS", "dependencyManager requires at least one dependency declaration", "input");
  }

  const seen = new Set<string>();
  const allowedScopes = cleanList(request.context?.allowedScopes);
  const probeMap = normalizeProbeMap(request.probes);
  const resolutions: ToolDependencyResolution[] = [];

  for (const declaration of declarations) {
    const dependencyId = declaration.dependencyId?.trim();
    if (dependencyId === undefined || dependencyId.length === 0) {
      return failure("INVALID_DEPENDENCY_ID", "dependency declarations require dependencyId", "input");
    }

    if (seen.has(dependencyId)) {
      return failure("DUPLICATE_DEPENDENCY_ID", `duplicate dependency declaration: ${dependencyId}`, "contract");
    }
    seen.add(dependencyId);

    const requiredScopes = cleanList(declaration.requiredScopes);
    const probe = probeMap.get(dependencyId);
    const status = resolveDependencyStatus(declaration, probe, allowedScopes);
    if (status.missingScopes.length > 0) {
      return failure(
        "SCOPE_DENIED",
        `dependency ${dependencyId} requires scope ${status.missingScopes[0]} outside runtime governance`,
        "scope",
      );
    }

    resolutions.push({
      dependencyId,
      kind: declaration.kind ?? "custom",
      displayName: declaration.displayName?.trim() || dependencyId,
      required: declaration.required ?? true,
      status: status.status,
      requestedVersion: declaration.requestedVersion?.trim() || undefined,
      observedVersion: status.observedVersion,
      resolvedPath: status.resolvedPath,
      acceptedVersions: cleanList(declaration.acceptedVersions),
      requiredScopes,
      missingScopes: status.missingScopes,
      conflictWith: status.conflictWith,
      reasons: status.reasons,
      observedAt: status.observedAt,
      metadata: {
        ...(declaration.metadata ?? {}),
        ...(probe?.metadata ?? {}),
      },
    });
  }

  const summary = summarize(resolutions);

  return {
    ok: true,
    report: {
      toolId: toolId ?? "",
      runtimeId: request.context?.runtimeId?.trim() || undefined,
      invocationId: request.context?.invocationId?.trim() || undefined,
      status: reportStatus(summary),
      resolutions,
      summary,
      dryRun: true,
      unsafeSideEffects: false,
      audit: {
        event: "agentCore.basicToolLayer.toolDependency.manager.resolved",
        metadata: normalizeMetadata(request.context?.auditMetadata),
      },
    },
    events: ["agentCore.basicToolLayer.toolDependency.manager.resolved"],
  };
}
