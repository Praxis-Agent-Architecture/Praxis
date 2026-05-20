/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Snapshot Collector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugSnapshotBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "snapshot";

export type DebugSnapshotCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type DebugSnapshotCaller = {
  kind: DebugSnapshotCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type DebugSnapshotGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugSnapshotSectionKind =
  | "runtime-state"
  | "contract"
  | "governance"
  | "invocation"
  | "trace"
  | "module"
  | "capability"
  | (string & {});

export type DebugSnapshotSectionStatus = "ready" | "degraded" | "blocked" | "unknown";

export type DebugSnapshotSectionInput = {
  sectionId?: string;
  kind?: DebugSnapshotSectionKind;
  label?: string;
  status?: DebugSnapshotSectionStatus;
  observedAt?: string;
  value?: unknown;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type DebugSnapshotValueShape = "object" | "array" | "string" | "number" | "boolean" | "null" | "undefined" | "unknown";

export type DebugSnapshotSection = {
  sectionId: string;
  kind: DebugSnapshotSectionKind;
  label: string;
  status: DebugSnapshotSectionStatus;
  observedAt: string;
  valueShape: DebugSnapshotValueShape;
  valueKeys: readonly string[];
  tags: readonly string[];
  metadataKeys: readonly string[];
};

export type DebugSnapshot = {
  runtimeId: string;
  snapshotId: string;
  caller: DebugSnapshotCaller;
  route: "runtime.debug.debugSnapshotCollector";
  sections: readonly DebugSnapshotSection[];
  sectionKinds: readonly DebugSnapshotSectionKind[];
  degradedSections: readonly string[];
  blockedSections: readonly string[];
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    rawRuntimeStateExposed: false;
    governanceRequired: true;
  };
};

export type DebugSnapshotCollectorRequest = {
  runtimeId?: string;
  snapshotId?: string;
  caller?: DebugSnapshotCaller;
  sections?: readonly DebugSnapshotSectionInput[];
  requiredSectionKinds?: readonly string[];
  exposeRawValues?: boolean;
  runtimeReady?: boolean;
  contract?: DebugSnapshotGate;
  governance?: DebugSnapshotGate;
};

export type DebugSnapshotErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_SECTIONS"
  | "MISSING_SECTION_KIND"
  | "MISSING_SECTION_LABEL"
  | "REQUIRED_SECTION_MISSING"
  | "RAW_SNAPSHOT_BLOCKED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DebugSnapshotError = {
  code: DebugSnapshotErrorCode;
  message: string;
  boundary: DebugSnapshotBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type DebugSnapshotCollectorResult =
  | {
      ok: true;
      snapshot: DebugSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugSnapshotError;
      events: readonly string[];
    };

export const debugSnapshotCollectorDescriptor = {
  surface: "runtime.debug",
  capability: "debugSnapshotCollector",
  purpose: "collect public-safe runtime debug snapshots without exposing raw runtime internals",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugSnapshotCaller): DebugSnapshotCaller {
  const normalized: DebugSnapshotCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function valueShape(value: unknown): DebugSnapshotValueShape {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  const valueType = typeof value;
  if (
    valueType === "object" ||
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "undefined"
  ) {
    return valueType;
  }

  return "unknown";
}

function valueKeys(value: unknown): readonly string[] {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value).sort();
  }

  if (Array.isArray(value)) {
    return value.map((_, index) => String(index));
  }

  return [];
}

function failure(
  code: DebugSnapshotErrorCode,
  message: string,
  boundary: DebugSnapshotBoundary,
): DebugSnapshotCollectorResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.debug.snapshotCollector.rejected"],
  };
}

function normalizeSection(
  section: DebugSnapshotSectionInput,
  index: number,
  snapshotId: string,
): DebugSnapshotSection | DebugSnapshotCollectorResult {
  const kind = section.kind?.trim();
  if (!hasText(kind)) {
    return failure("MISSING_SECTION_KIND", "debug snapshot collector requires every section to declare a kind", "input");
  }

  const label = section.label?.trim();
  if (!hasText(label)) {
    return failure("MISSING_SECTION_LABEL", "debug snapshot collector requires every section to declare a label", "input");
  }

  return {
    sectionId: section.sectionId?.trim() || `${snapshotId}:section:${index + 1}:${kind}`,
    kind,
    label,
    status: section.status ?? "unknown",
    observedAt: section.observedAt?.trim() || "unobserved",
    valueShape: valueShape(section.value),
    valueKeys: valueKeys(section.value),
    tags: cleanList(section.tags),
    metadataKeys: Object.keys(section.metadata ?? {}).sort(),
  };
}

export function collectDebugSnapshot(request?: DebugSnapshotCollectorRequest): DebugSnapshotCollectorResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug snapshot collector requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "debug snapshot collector requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug snapshots can only be collected through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "debug snapshot collection was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug snapshot collection was rejected by governance",
      "governance",
    );
  }

  if (request.exposeRawValues === true) {
    return failure("RAW_SNAPSHOT_BLOCKED", "debug snapshot collector does not expose raw runtime values", "governance");
  }

  if ((request.sections ?? []).length === 0) {
    return failure("MISSING_SECTIONS", "debug snapshot collector requires at least one narrow section", "input");
  }

  const runtimeId = request.runtimeId.trim();
  const snapshotId = request.snapshotId?.trim() || `${runtimeId}:debugSnapshot`;
  const sections: DebugSnapshotSection[] = [];

  for (const [index, section] of (request.sections ?? []).entries()) {
    const normalized = normalizeSection(section, index, snapshotId);
    if ("ok" in normalized) {
      return normalized;
    }

    sections.push(normalized);
  }

  const sectionKinds = cleanList(sections.map((section) => section.kind));
  for (const requiredKind of cleanList(request.requiredSectionKinds)) {
    if (!sectionKinds.includes(requiredKind)) {
      return failure("REQUIRED_SECTION_MISSING", `debug snapshot is missing required section kind ${requiredKind}`, "snapshot");
    }
  }

  return {
    ok: true,
    snapshot: {
      runtimeId,
      snapshotId,
      caller: normalizeCaller(request.caller),
      route: "runtime.debug.debugSnapshotCollector",
      sections,
      sectionKinds,
      degradedSections: sections
        .filter((section) => section.status === "degraded")
        .map((section) => section.sectionId),
      blockedSections: sections
        .filter((section) => section.status === "blocked")
        .map((section) => section.sectionId),
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        rawRuntimeStateExposed: false,
        governanceRequired: true,
      },
    },
    events: ["runtime.debug.snapshotCollector.collected"],
  };
}
