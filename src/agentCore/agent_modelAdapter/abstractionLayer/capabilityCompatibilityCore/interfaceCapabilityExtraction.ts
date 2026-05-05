/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 interface Capability Extraction 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterfaceCapabilityKind = "text" | "image" | "audio" | "video" | "tool" | "structured-output" | "custom";

export type InterfaceCapabilitySignal = {
  name?: string;
  kind?: InterfaceCapabilityKind | string;
  required?: boolean;
  aliases?: readonly string[];
  limits?: Readonly<Record<string, string | number | boolean>>;
  sourceField?: string;
};

export type InterfaceCapabilityExtractionTrace = {
  correlationId?: string;
  carrierId?: string;
};

export type InterfaceCapabilityExtractionGate = {
  accepted: boolean;
  reason?: string;
};

export type InterfaceCapabilityExtractionRequest = {
  providerId?: string;
  interfaceId?: string;
  capabilitySignals?: readonly InterfaceCapabilitySignal[];
  dslIntentCapabilities?: readonly string[];
  governance?: InterfaceCapabilityExtractionGate;
  trace?: InterfaceCapabilityExtractionTrace;
};

export type InterfaceCapabilityDescriptor = {
  id: string;
  name: string;
  kind: InterfaceCapabilityKind | "unknown";
  required: boolean;
  aliases: readonly string[];
  limits: Readonly<Record<string, string | number | boolean>>;
  sourceField?: string;
  matchedDslIntent: boolean;
};

export type InterfaceCapabilityExtractionErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_CAPABILITY_SIGNALS"
  | "EMPTY_CAPABILITY_NAME"
  | "GOVERNANCE_REJECTED";

export type InterfaceCapabilityExtractionError = {
  code: InterfaceCapabilityExtractionErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance";
  publicSafe: true;
};

export type InterfaceCapabilityExtractionResult =
  | {
      ok: true;
      providerId: string;
      interfaceId: string;
      capabilities: readonly InterfaceCapabilityDescriptor[];
      requestedDslCapabilities: readonly string[];
      trace: InterfaceCapabilityExtractionTrace;
      unsafeSideEffects: false;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterfaceCapabilityExtractionError;
      events: readonly string[];
    };

const knownCapabilityKinds = new Set<InterfaceCapabilityKind>([
  "text",
  "image",
  "audio",
  "video",
  "tool",
  "structured-output",
  "custom",
]);

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function toCapabilityId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeKind(kind: string | undefined): InterfaceCapabilityKind | "unknown" {
  if (kind === undefined) {
    return "unknown";
  }

  const normalized = kind.trim().toLowerCase();
  return knownCapabilityKinds.has(normalized as InterfaceCapabilityKind)
    ? (normalized as InterfaceCapabilityKind)
    : "unknown";
}

function failure(
  code: InterfaceCapabilityExtractionErrorCode,
  message: string,
  boundary: InterfaceCapabilityExtractionError["boundary"],
): InterfaceCapabilityExtractionResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.capabilityExtraction.rejected"],
  };
}

function cleanTrace(trace: InterfaceCapabilityExtractionTrace | undefined): InterfaceCapabilityExtractionTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    carrierId: trace?.carrierId?.trim() || undefined,
  };
}

export function extractInterfaceCapabilities(
  request?: InterfaceCapabilityExtractionRequest,
): InterfaceCapabilityExtractionResult {
  if (request === undefined || isBlank(request.providerId)) {
    return failure("MISSING_PROVIDER_ID", "interface capability extraction requires a providerId", "input");
  }

  if (isBlank(request.interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "interface capability extraction requires an interfaceId", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interface capability extraction was rejected by governance",
      "governance",
    );
  }

  if (request.capabilitySignals === undefined || request.capabilitySignals.length === 0) {
    return failure(
      "MISSING_CAPABILITY_SIGNALS",
      "interface capability extraction requires at least one upstream capability signal",
      "input",
    );
  }

  const requestedDslCapabilities = cleanList(request.dslIntentCapabilities).map((value) => toCapabilityId(value));
  const capabilities: InterfaceCapabilityDescriptor[] = [];

  for (const signal of request.capabilitySignals) {
    if (isBlank(signal.name)) {
      return failure(
        "EMPTY_CAPABILITY_NAME",
        "interface capability extraction cannot normalize an unnamed capability signal",
        "contract",
      );
    }

    const name = (signal.name ?? "").trim();
    const id = toCapabilityId(name);
    const aliases = cleanList(signal.aliases);
    const searchableIds = [id, ...aliases.map((alias) => toCapabilityId(alias))];

    capabilities.push({
      id,
      name,
      kind: normalizeKind(signal.kind),
      required: signal.required === true,
      aliases,
      limits: signal.limits ?? {},
      sourceField: signal.sourceField?.trim() || undefined,
      matchedDslIntent: requestedDslCapabilities.some((intent) => searchableIds.includes(intent)),
    });
  }

  return {
    ok: true,
    providerId: (request.providerId ?? "").trim(),
    interfaceId: (request.interfaceId ?? "").trim(),
    capabilities,
    requestedDslCapabilities,
    trace: cleanTrace(request.trace),
    unsafeSideEffects: false,
    events: ["agentCore.modelAdapter.capabilityExtraction.ready"],
  };
}
