/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug State Diff 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugStateDiffBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "diff";

export type DebugStateDiffCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type DebugStateDiffCaller = {
  kind: DebugStateDiffCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type DebugStateDiffGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugStateValueShape =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "unknown";

export type DebugStateDiffChangeKind = "added" | "removed" | "changed" | "unchanged";

export type DebugStateDiffChange = {
  path: string;
  kind: DebugStateDiffChangeKind;
  beforeShape: DebugStateValueShape;
  afterShape: DebugStateValueShape;
  beforeKeys: readonly string[];
  afterKeys: readonly string[];
  valuePreviewExposed: false;
};

export type DebugStateDiffSummary = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
};

export type DebugStateDiff = {
  runtimeId: string;
  diffId: string;
  caller: DebugStateDiffCaller;
  route: "runtime.debug.debugStateDiff";
  status: "changed" | "unchanged";
  comparedPaths: readonly string[];
  changes: readonly DebugStateDiffChange[];
  summary: DebugStateDiffSummary;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    rawStateValuesExposed: false;
    shallowComparison: true;
    governanceRequired: true;
  };
};

export type DebugStateDiffRequest = {
  runtimeId?: string;
  diffId?: string;
  caller?: DebugStateDiffCaller;
  beforeState?: Readonly<Record<string, unknown>>;
  afterState?: Readonly<Record<string, unknown>>;
  paths?: readonly string[];
  exposeValues?: boolean;
  runtimeReady?: boolean;
  contract?: DebugStateDiffGate;
  governance?: DebugStateDiffGate;
};

export type DebugStateDiffErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BEFORE_STATE"
  | "MISSING_AFTER_STATE"
  | "RAW_STATE_EXPOSURE_BLOCKED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DebugStateDiffError = {
  code: DebugStateDiffErrorCode;
  message: string;
  boundary: DebugStateDiffBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type DebugStateDiffResult =
  | {
      ok: true;
      diff: DebugStateDiff;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugStateDiffError;
      events: readonly string[];
    };

export const debugStateDiffDescriptor = {
  surface: "runtime.debug",
  capability: "debugStateDiff",
  purpose: "compare public-safe runtime state shapes without exposing raw state values",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugStateDiffCaller): DebugStateDiffCaller {
  const normalized: DebugStateDiffCaller = {
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

function valueShape(value: unknown): DebugStateValueShape {
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

function stableSignature(value: unknown): string {
  const shape = valueShape(value);
  if (shape !== "object" && shape !== "array") {
    return `${shape}:${String(value)}`;
  }

  try {
    return JSON.stringify(sortJson(value));
  } catch {
    return `${shape}:${valueKeys(value).join(",")}`;
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
  }

  return value;
}

function failure(
  code: DebugStateDiffErrorCode,
  message: string,
  boundary: DebugStateDiffBoundary,
): DebugStateDiffResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.debug.stateDiff.rejected"],
  };
}

function classifyChange(
  path: string,
  beforeState: Readonly<Record<string, unknown>>,
  afterState: Readonly<Record<string, unknown>>,
): DebugStateDiffChange {
  const beforeHas = Object.prototype.hasOwnProperty.call(beforeState, path);
  const afterHas = Object.prototype.hasOwnProperty.call(afterState, path);
  const beforeValue = beforeState[path];
  const afterValue = afterState[path];
  let kind: DebugStateDiffChangeKind = "unchanged";

  if (!beforeHas && afterHas) {
    kind = "added";
  } else if (beforeHas && !afterHas) {
    kind = "removed";
  } else if (stableSignature(beforeValue) !== stableSignature(afterValue)) {
    kind = "changed";
  }

  return {
    path,
    kind,
    beforeShape: beforeHas ? valueShape(beforeValue) : "undefined",
    afterShape: afterHas ? valueShape(afterValue) : "undefined",
    beforeKeys: beforeHas ? valueKeys(beforeValue) : [],
    afterKeys: afterHas ? valueKeys(afterValue) : [],
    valuePreviewExposed: false,
  };
}

function summarizeChanges(changes: readonly DebugStateDiffChange[]): DebugStateDiffSummary {
  return {
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    changed: changes.filter((change) => change.kind === "changed").length,
    unchanged: changes.filter((change) => change.kind === "unchanged").length,
  };
}

export function diffDebugState(request?: DebugStateDiffRequest): DebugStateDiffResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug state diff requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "debug state diff requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug state diff can only run through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "debug state diff was rejected by contract", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug state diff was rejected by governance",
      "governance",
    );
  }

  if (request.exposeValues === true) {
    return failure("RAW_STATE_EXPOSURE_BLOCKED", "debug state diff does not expose raw runtime state values", "governance");
  }

  if (request.beforeState === undefined) {
    return failure("MISSING_BEFORE_STATE", "debug state diff requires a beforeState object", "input");
  }

  if (request.afterState === undefined) {
    return failure("MISSING_AFTER_STATE", "debug state diff requires an afterState object", "input");
  }

  const runtimeId = request.runtimeId.trim();
  const comparedPaths = cleanList(
    request.paths ?? [...Object.keys(request.beforeState), ...Object.keys(request.afterState)].sort(),
  );
  const changes = comparedPaths.map((path) => classifyChange(path, request.beforeState ?? {}, request.afterState ?? {}));
  const summary = summarizeChanges(changes);

  return {
    ok: true,
    diff: {
      runtimeId,
      diffId: request.diffId?.trim() || `${runtimeId}:debugStateDiff`,
      caller: normalizeCaller(request.caller),
      route: "runtime.debug.debugStateDiff",
      status: summary.added + summary.removed + summary.changed > 0 ? "changed" : "unchanged",
      comparedPaths,
      changes,
      summary,
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        rawStateValuesExposed: false,
        shallowComparison: true,
        governanceRequired: true,
      },
    },
    events: ["runtime.debug.stateDiff.computed"],
  };
}
