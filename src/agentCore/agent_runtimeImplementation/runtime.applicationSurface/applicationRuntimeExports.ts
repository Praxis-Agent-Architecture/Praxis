/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：定义 runtime 对上层应用公开哪些能力。
 * 能力要求1：需要把公共 API、可见事件、可调用能力和不可见内部细节分开。
 * 能力要求2：它是防止应用直接依赖内部文件结构的出口清单。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationRuntimeExportErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_APPLICATION_ID"
  | "EMPTY_EXPORT_SURFACE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ApplicationRuntimeExportError = {
  code: ApplicationRuntimeExportErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance";
};

export type ApplicationRuntimeExportGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationRuntimeExportItem = {
  name: string;
  description?: string;
};

export type ApplicationRuntimeExportsRequest = {
  runtimeId: string;
  applicationId: string;
  publicApis?: readonly ApplicationRuntimeExportItem[];
  visibleEvents?: readonly ApplicationRuntimeExportItem[];
  callableCapabilities?: readonly ApplicationRuntimeExportItem[];
  hiddenInternalDetails?: readonly string[];
  contract?: ApplicationRuntimeExportGate;
  governance?: ApplicationRuntimeExportGate;
};

export type ApplicationRuntimeExports = {
  runtimeId: string;
  applicationId: string;
  publicApis: readonly ApplicationRuntimeExportItem[];
  visibleEvents: readonly ApplicationRuntimeExportItem[];
  callableCapabilities: readonly ApplicationRuntimeExportItem[];
  hiddenInternalDetailCount: number;
  internalFileStructureExposed: false;
};

export type ApplicationRuntimeExportsResult =
  | {
      ok: true;
      exports: ApplicationRuntimeExports;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationRuntimeExportError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanExportItems(
  items: readonly ApplicationRuntimeExportItem[] | undefined,
): readonly ApplicationRuntimeExportItem[] {
  const seen = new Set<string>();
  const cleaned: ApplicationRuntimeExportItem[] = [];

  for (const item of items ?? []) {
    const name = item.name.trim();
    if (name.length === 0 || seen.has(name)) {
      continue;
    }

    seen.add(name);
    cleaned.push({
      name,
      description: item.description?.trim() || undefined,
    });
  }

  return cleaned;
}

function failure(
  code: ApplicationRuntimeExportErrorCode,
  message: string,
  boundary: ApplicationRuntimeExportError["boundary"],
): ApplicationRuntimeExportsResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.runtime.exports.rejected"],
  };
}

export function defineApplicationRuntimeExports(
  request: ApplicationRuntimeExportsRequest,
): ApplicationRuntimeExportsResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before defining application exports", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure(
      "MISSING_APPLICATION_ID",
      "applicationId is required before defining application exports",
      "input",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "application runtime export contract was rejected",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application runtime exports were rejected by governance",
      "governance",
    );
  }

  const publicApis = cleanExportItems(request.publicApis);
  const visibleEvents = cleanExportItems(request.visibleEvents);
  const callableCapabilities = cleanExportItems(request.callableCapabilities);

  if (publicApis.length + visibleEvents.length + callableCapabilities.length === 0) {
    return failure(
      "EMPTY_EXPORT_SURFACE",
      "at least one public API, visible event, or callable capability must be exported",
      "input",
    );
  }

  return {
    ok: true,
    exports: {
      runtimeId: request.runtimeId.trim(),
      applicationId: request.applicationId.trim(),
      publicApis,
      visibleEvents,
      callableCapabilities,
      hiddenInternalDetailCount: request.hiddenInternalDetails?.length ?? 0,
      internalFileStructureExposed: false,
    },
    events: ["application.runtime.exports.defined"],
  };
}
