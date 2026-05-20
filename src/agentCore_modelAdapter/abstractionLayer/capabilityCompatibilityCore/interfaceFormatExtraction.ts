/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 interface Format Extraction 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterfaceFormatDirection = "input" | "output" | "bidirectional";

export type InterfaceFormatSignal = {
  name?: string;
  direction?: InterfaceFormatDirection;
  mediaType?: string;
  schemaName?: string;
  fields?: readonly string[];
  sourceField?: string;
};

export type InterfaceFormatExtractionTrace = {
  correlationId?: string;
  carrierId?: string;
};

export type InterfaceFormatExtractionGate = {
  accepted: boolean;
  reason?: string;
};

export type InterfaceFormatExtractionRequest = {
  providerId?: string;
  interfaceId?: string;
  formatSignals?: readonly InterfaceFormatSignal[];
  dslIntentFormats?: readonly string[];
  governance?: InterfaceFormatExtractionGate;
  trace?: InterfaceFormatExtractionTrace;
};

export type InterfaceFormatDescriptor = {
  id: string;
  name: string;
  direction: InterfaceFormatDirection;
  mediaType?: string;
  schemaName?: string;
  fields: readonly string[];
  sourceField?: string;
  matchedDslIntent: boolean;
};

export type InterfaceFormatExtractionErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_FORMAT_SIGNALS"
  | "EMPTY_FORMAT_NAME"
  | "GOVERNANCE_REJECTED";

export type InterfaceFormatExtractionError = {
  code: InterfaceFormatExtractionErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance";
  publicSafe: true;
};

export type InterfaceFormatExtractionResult =
  | {
      ok: true;
      providerId: string;
      interfaceId: string;
      formats: readonly InterfaceFormatDescriptor[];
      requestedDslFormats: readonly string[];
      trace: InterfaceFormatExtractionTrace;
      unsafeSideEffects: false;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterfaceFormatExtractionError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function toFormatId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function failure(
  code: InterfaceFormatExtractionErrorCode,
  message: string,
  boundary: InterfaceFormatExtractionError["boundary"],
): InterfaceFormatExtractionResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.formatExtraction.rejected"],
  };
}

function cleanTrace(trace: InterfaceFormatExtractionTrace | undefined): InterfaceFormatExtractionTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    carrierId: trace?.carrierId?.trim() || undefined,
  };
}

export function extractInterfaceFormats(request?: InterfaceFormatExtractionRequest): InterfaceFormatExtractionResult {
  if (request === undefined || isBlank(request.providerId)) {
    return failure("MISSING_PROVIDER_ID", "interface format extraction requires a providerId", "input");
  }

  if (isBlank(request.interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "interface format extraction requires an interfaceId", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interface format extraction was rejected by governance",
      "governance",
    );
  }

  if (request.formatSignals === undefined || request.formatSignals.length === 0) {
    return failure(
      "MISSING_FORMAT_SIGNALS",
      "interface format extraction requires at least one upstream format signal",
      "input",
    );
  }

  const requestedDslFormats = cleanList(request.dslIntentFormats).map((value) => toFormatId(value));
  const formats: InterfaceFormatDescriptor[] = [];

  for (const signal of request.formatSignals) {
    if (isBlank(signal.name)) {
      return failure("EMPTY_FORMAT_NAME", "interface format extraction cannot normalize an unnamed format signal", "contract");
    }

    const name = (signal.name ?? "").trim();
    const id = toFormatId(name);

    formats.push({
      id,
      name,
      direction: signal.direction ?? "bidirectional",
      mediaType: signal.mediaType?.trim() || undefined,
      schemaName: signal.schemaName?.trim() || undefined,
      fields: cleanList(signal.fields),
      sourceField: signal.sourceField?.trim() || undefined,
      matchedDslIntent: requestedDslFormats.includes(id),
    });
  }

  return {
    ok: true,
    providerId: (request.providerId ?? "").trim(),
    interfaceId: (request.interfaceId ?? "").trim(),
    formats,
    requestedDslFormats,
    trace: cleanTrace(request.trace),
    unsafeSideEffects: false,
    events: ["agentCore.modelAdapter.formatExtraction.ready"],
  };
}
