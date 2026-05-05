/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 output Interface Format 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OutputInterfaceFormatBoundary = "input" | "contract" | "governance" | "scope" | "format";

export type OutputInterfaceFormatGate = {
  accepted: boolean;
  reason?: string;
};

export type OutputInterfaceFormatDeclaration = {
  formatId?: string;
  mediaType?: string;
  providerKey?: string;
  direction?: "output" | "bidirectional";
  streaming?: boolean;
  structured?: boolean;
  schemaRef?: string;
  available?: boolean;
};

export type OutputInterfaceFormatRequest = {
  runtimeId?: string;
  sourceInterfaceId?: string;
  providerId?: string;
  formats?: readonly OutputInterfaceFormatDeclaration[];
  requiredFormats?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OutputInterfaceFormatGate;
  governance?: OutputInterfaceFormatGate;
};

export type OutputInterfaceFormatErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_FORMAT"
  | "INVALID_DIRECTION"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type OutputInterfaceFormatError = {
  code: OutputInterfaceFormatErrorCode;
  message: string;
  boundary: OutputInterfaceFormatBoundary;
  safeForRuntimeInspection: true;
};

export type NormalizedOutputInterfaceFormat = {
  formatId: string;
  mediaType?: string;
  providerKey?: string;
  direction: "output" | "bidirectional";
  streaming: boolean;
  structured: boolean;
  schemaRef?: string;
  available: boolean;
};

export type OutputInterfaceFormatEnvelope = {
  kind: "agentCore.modelAdapter.outputInterfaceFormat";
  runtimeId: string;
  sourceInterfaceId: string;
  providerId?: string;
  formats: readonly NormalizedOutputInterfaceFormat[];
  requiredFormats: readonly string[];
  missingFormats: readonly string[];
  compatible: boolean;
  acceptedScopes: readonly string[];
  bridgeReadiness: "ready" | "blocked-by-missing-format";
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type OutputInterfaceFormatResult =
  | {
      ok: true;
      envelope: OutputInterfaceFormatEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OutputInterfaceFormatError;
      events: readonly string[];
    };

export const outputInterfaceFormatDescriptor = {
  capability: "output-interface-format",
  route: "agent_modelAdapter.abstractionLayer.capabilityCompatibilityCore",
  purpose: "normalize provider output format signals into a bridge-ready compatibility envelope",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: OutputInterfaceFormatErrorCode,
  message: string,
  boundary: OutputInterfaceFormatBoundary,
): OutputInterfaceFormatResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.outputInterfaceFormat.rejected"],
  };
}

function normalizeFormats(
  formats: readonly OutputInterfaceFormatDeclaration[] | undefined,
): NormalizedOutputInterfaceFormat[] | OutputInterfaceFormatResult {
  const normalized: NormalizedOutputInterfaceFormat[] = [];

  for (const format of formats ?? []) {
    const formatId = format.formatId?.trim();
    if (!formatId) {
      return failure("MISSING_FORMAT", "output interface format entries require formatId", "input");
    }

    if (format.direction !== undefined && format.direction !== "output" && format.direction !== "bidirectional") {
      return failure("INVALID_DIRECTION", "output interface format only accepts output or bidirectional formats", "format");
    }

    normalized.push({
      formatId,
      mediaType: format.mediaType?.trim() || undefined,
      providerKey: format.providerKey?.trim() || undefined,
      direction: format.direction ?? "output",
      streaming: format.streaming === true,
      structured: format.structured === true,
      schemaRef: format.schemaRef?.trim() || undefined,
      available: format.available !== false,
    });
  }

  if (normalized.length === 0) {
    return failure("MISSING_FORMAT", "output interface format requires at least one format signal", "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | OutputInterfaceFormatResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `output interface format scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function defineOutputInterfaceFormats(request?: OutputInterfaceFormatRequest): OutputInterfaceFormatResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "output interface format requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sourceInterfaceId = request.sourceInterfaceId?.trim();

  if (!sourceInterfaceId) {
    return failure("MISSING_INTERFACE_ID", "output interface format requires sourceInterfaceId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "output interface format was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "output interface format was rejected by runtime governance",
      "governance",
    );
  }

  const formats = normalizeFormats(request.formats);
  if ("ok" in formats) {
    return formats;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const requiredFormats = cleanList(request.requiredFormats);
  const required = requiredFormats.length > 0 ? requiredFormats : formats.map((format) => format.formatId);
  const available = new Set(formats.filter((format) => format.available).map((format) => format.formatId));
  const missingFormats = required.filter((formatId) => !available.has(formatId));
  const compatible = missingFormats.length === 0;

  return {
    ok: true,
    envelope: {
      kind: "agentCore.modelAdapter.outputInterfaceFormat",
      runtimeId,
      sourceInterfaceId,
      providerId: request.providerId?.trim() || undefined,
      formats,
      requiredFormats: required,
      missingFormats,
      compatible,
      acceptedScopes,
      bridgeReadiness: compatible ? "ready" : "blocked-by-missing-format",
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: [compatible ? "modelAdapter.outputInterfaceFormat.accepted" : "modelAdapter.outputInterfaceFormat.missingFormat"],
  };
}
