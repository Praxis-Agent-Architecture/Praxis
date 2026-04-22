/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“检查符号信息”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspInspectSymbolBoundary = "input" | "contract" | "governance" | "scope";

export type LspInspectSymbolGate = {
  accepted: boolean;
  reason?: string;
};

export type LspSymbolPosition = {
  line: number;
  character: number;
};

export type LspSymbolRange = {
  start: LspSymbolPosition;
  end: LspSymbolPosition;
};

export type LspSymbolKind =
  | "file"
  | "module"
  | "namespace"
  | "package"
  | "class"
  | "method"
  | "property"
  | "field"
  | "constructor"
  | "enum"
  | "interface"
  | "function"
  | "variable"
  | "constant"
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "key"
  | "null"
  | "enumMember"
  | "struct"
  | "event"
  | "operator"
  | "typeParameter";

export type LspSymbolInfo = {
  name: string;
  kind: LspSymbolKind;
  range: LspSymbolRange;
  selectionRange?: LspSymbolRange;
  detail?: string;
  containerName?: string;
};

export type LspInspectSymbolTarget = {
  position?: LspSymbolPosition;
  symbolName?: string;
};

export type LspInspectSymbolRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  documentUri?: string;
  target?: LspInspectSymbolTarget;
  symbols?: readonly LspSymbolInfo[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: LspInspectSymbolGate;
  governance?: LspInspectSymbolGate;
};

export type LspInspectSymbolErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_DOCUMENT_URI"
  | "MISSING_SYMBOL_TARGET"
  | "INVALID_SYMBOL_TARGET"
  | "INVALID_SYMBOL_SNAPSHOT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LSP_CALL_NOT_ALLOWED";

export type LspInspectSymbolError = {
  code: LspInspectSymbolErrorCode;
  message: string;
  boundary: LspInspectSymbolBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type LspInspectSymbolSnapshot = {
  tool: "code.lsp_inspectSymbol";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  documentUri: string;
  target: LspInspectSymbolTarget;
  symbol?: LspSymbolInfo;
  candidates: readonly LspSymbolInfo[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    lspServerInvoked: false;
    fileMutationPlanned: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "inspect-symbol";
    governanceRequired: true;
    tapDelegation: "basic-tool-primitive";
  };
};

export type LspInspectSymbolResult =
  | {
      ok: true;
      snapshot: LspInspectSymbolSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: LspInspectSymbolError;
      events: readonly string[];
    };

export const lspInspectSymbolDescriptor = {
  tool: "code.lsp_inspectSymbol",
  capability: "inspect-symbol",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  unsafeSideEffects: false,
  firstRoundExecution: "snapshot-envelope",
} as const;

const knownSymbolKinds: readonly LspSymbolKind[] = [
  "file",
  "module",
  "namespace",
  "package",
  "class",
  "method",
  "property",
  "field",
  "constructor",
  "enum",
  "interface",
  "function",
  "variable",
  "constant",
  "string",
  "number",
  "boolean",
  "array",
  "object",
  "key",
  "null",
  "enumMember",
  "struct",
  "event",
  "operator",
  "typeParameter",
];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: LspInspectSymbolErrorCode,
  message: string,
  boundary: LspInspectSymbolBoundary,
): LspInspectSymbolResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.lsp.inspectSymbol.rejected"],
  };
}

function isPosition(value: LspSymbolPosition | undefined): value is LspSymbolPosition {
  return (
    value !== undefined &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.character) &&
    value.line >= 0 &&
    value.character >= 0
  );
}

function comparePosition(left: LspSymbolPosition, right: LspSymbolPosition): number {
  return left.line === right.line ? left.character - right.character : left.line - right.line;
}

function isRange(value: LspSymbolRange | undefined): value is LspSymbolRange {
  return (
    value !== undefined &&
    isPosition(value.start) &&
    isPosition(value.end) &&
    comparePosition(value.start, value.end) <= 0
  );
}

function containsPosition(range: LspSymbolRange, position: LspSymbolPosition): boolean {
  return comparePosition(range.start, position) <= 0 && comparePosition(position, range.end) <= 0;
}

function isSymbolInfo(value: LspSymbolInfo | undefined): value is LspSymbolInfo {
  return (
    value !== undefined &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    knownSymbolKinds.includes(value.kind) &&
    isRange(value.range) &&
    (value.selectionRange === undefined || isRange(value.selectionRange))
  );
}

function normalizeTarget(target: LspInspectSymbolTarget | undefined): LspInspectSymbolTarget | undefined {
  if (target === undefined) {
    return undefined;
  }

  const symbolName = target.symbolName?.trim() || undefined;
  const position = target.position;

  if (position === undefined && symbolName === undefined) {
    return undefined;
  }

  if (position !== undefined && !isPosition(position)) {
    return undefined;
  }

  return {
    position: position === undefined ? undefined : { line: position.line, character: position.character },
    symbolName,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | LspInspectSymbolResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length > 0 && denied.length > 0) {
    return failure("SCOPE_DENIED", `inspectSymbol scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function selectSymbol(target: LspInspectSymbolTarget, symbols: readonly LspSymbolInfo[]): readonly LspSymbolInfo[] {
  return symbols.filter((symbol) => {
    const matchesName = target.symbolName === undefined || symbol.name === target.symbolName;
    const matchesPosition =
      target.position === undefined ||
      containsPosition(symbol.selectionRange ?? symbol.range, target.position) ||
      containsPosition(symbol.range, target.position);

    return matchesName && matchesPosition;
  });
}

export function inspectLspSymbol(request?: LspInspectSymbolRequest): LspInspectSymbolResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "inspectSymbol requires runtimeId for audit and governance", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "inspectSymbol requires sessionId for invocation traceability", "input");
  }

  if (isBlank(request.documentUri)) {
    return failure("MISSING_DOCUMENT_URI", "inspectSymbol requires a target documentUri", "input");
  }

  if (request.target === undefined) {
    return failure("MISSING_SYMBOL_TARGET", "inspectSymbol requires a position or symbolName target", "input");
  }

  const target = normalizeTarget(request.target);
  if (target === undefined) {
    return failure("INVALID_SYMBOL_TARGET", "inspectSymbol target must be a valid position or non-empty symbolName", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_LSP_CALL_NOT_ALLOWED",
      "first-round inspectSymbol only inspects a supplied symbol snapshot",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "inspectSymbol was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "inspectSymbol was rejected by runtime governance",
      "governance",
    );
  }

  const symbols = request.symbols ?? [];
  if (!Array.isArray(symbols) || !symbols.every(isSymbolInfo)) {
    return failure("INVALID_SYMBOL_SNAPSHOT", "inspectSymbol requires symbols with name, kind and valid ranges", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const candidates = selectSymbol(target, symbols);
  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const documentUri = request.documentUri?.trim() ?? "";

  return {
    ok: true,
    snapshot: {
      tool: "code.lsp_inspectSymbol",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:lsp.inspectSymbol`,
      documentUri,
      target,
      symbol: candidates[0],
      candidates,
      acceptedScopes,
      execution: {
        dryRun: true,
        lspServerInvoked: false,
        fileMutationPlanned: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "inspect-symbol",
        governanceRequired: true,
        tapDelegation: "basic-tool-primitive",
      },
    },
    events: ["basicTool.code.lsp.inspectSymbol.snapshot"],
  };
}
