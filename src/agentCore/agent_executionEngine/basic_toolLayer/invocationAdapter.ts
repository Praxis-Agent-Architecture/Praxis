/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 invocation Adapter 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type BasicToolAdapterFamily =
  | "code"
  | "shell"
  | "git"
  | "mcp"
  | "computeruse"
  | "office"
  | "omni"
  | "search"
  | "skill"
  | "custom";

export type BasicToolAdapterBoundary = "input" | "contract" | "governance" | "scope";

export type BasicToolAdapterGate = {
  accepted: boolean;
  reason?: string;
};

export type BasicToolAdapterContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: BasicToolAdapterGate;
  governance?: BasicToolAdapterGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeToolInvocationRequest = {
  context?: BasicToolAdapterContext;
  toolId?: string;
  family?: BasicToolAdapterFamily;
  operation?: string;
  arguments?: Readonly<Record<string, unknown>>;
  cwd?: string;
  resourceLimits?: {
    timeoutMs?: number;
    maxOutputBytes?: number;
  };
};

export type BasicToolAdapterErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_TOOL_ID"
  | "INVALID_ARGUMENTS"
  | "INVALID_CWD"
  | "INVALID_TIMEOUT"
  | "INVALID_OUTPUT_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type BasicToolAdapterError = {
  code: BasicToolAdapterErrorCode;
  message: string;
  boundary: BasicToolAdapterBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type BasicToolExecutableInvocation = {
  kind: "agentCore.basicTool.executableInvocation";
  runtimeId: string;
  sessionId?: string;
  invocationId: string;
  toolId: string;
  family: BasicToolAdapterFamily;
  operation: string;
  arguments: Readonly<Record<string, unknown>>;
  cwd?: string;
  resourceLimits: {
    timeoutMs?: number;
    maxOutputBytes?: number;
  };
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  unsafeSideEffects: false;
  tapHandoff: {
    eligible: true;
    envelopeId: string;
  };
  audit: {
    event: "agentCore.basicTool.invocationAdapter.adapted";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type BasicToolAdapterResult =
  | {
      ok: true;
      invocation: BasicToolExecutableInvocation;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BasicToolAdapterError;
      events: readonly string[];
    };

export const basicToolInvocationAdapterDescriptor = {
  capability: "adapt-runtime-tool-invocation-to-basic-tool-primitive",
  layer: "agent_executionEngine.basic_toolLayer.invocationAdapter",
  dispatch: "dry-run",
  unsafeSideEffects: false,
  tapHandoffEligible: true,
} as const;

const knownFamilies: readonly BasicToolAdapterFamily[] = [
  "code",
  "shell",
  "git",
  "mcp",
  "computeruse",
  "office",
  "omni",
  "search",
  "skill",
  "custom",
];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function inferFamily(toolId: string, explicit: BasicToolAdapterFamily | undefined): BasicToolAdapterFamily {
  if (explicit !== undefined) {
    return explicit;
  }

  const prefix = toolId.split(".")[0] as BasicToolAdapterFamily | undefined;
  return prefix !== undefined && knownFamilies.includes(prefix) ? prefix : "custom";
}

function failure(
  code: BasicToolAdapterErrorCode,
  message: string,
  boundary: BasicToolAdapterBoundary,
): BasicToolAdapterResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    events: ["agentCore.basicTool.invocationAdapter.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | BasicToolAdapterResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `basic tool invocation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeCwd(value: string | undefined): string | BasicToolAdapterResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "basic tool invocation cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizePositiveInteger(
  value: number | undefined,
  code: Extract<BasicToolAdapterErrorCode, "INVALID_TIMEOUT" | "INVALID_OUTPUT_LIMIT">,
  label: string,
): number | BasicToolAdapterResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    return failure(code, `basic tool invocation ${label} must be a positive integer`, "input");
  }

  return value;
}

export function adaptRuntimeToolInvocation(request: RuntimeToolInvocationRequest = {}): BasicToolAdapterResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "basic tool invocation adapter requires context.runtimeId", "input");
  }

  const invocationId = request.context?.invocationId?.trim();
  if (isBlank(invocationId)) {
    return failure("MISSING_INVOCATION_ID", "basic tool invocation adapter requires context.invocationId", "input");
  }

  const toolId = request.toolId?.trim();
  if (isBlank(toolId)) {
    return failure("MISSING_TOOL_ID", "basic tool invocation adapter requires toolId", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round basic tool invocation adapter only creates a dry-run primitive envelope",
      "contract",
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "basic tool invocation adapter was rejected by contract surface",
      "contract",
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "basic tool invocation adapter was rejected by governance",
      "governance",
    );
  }

  if (request.arguments !== undefined && !isRecord(request.arguments)) {
    return failure("INVALID_ARGUMENTS", "basic tool invocation arguments must be a plain record", "input");
  }

  const cwd = normalizeCwd(request.cwd);
  if (typeof cwd !== "string" && cwd !== undefined) {
    return cwd;
  }

  const timeoutMs = normalizePositiveInteger(request.resourceLimits?.timeoutMs, "INVALID_TIMEOUT", "timeoutMs");
  if (typeof timeoutMs !== "number" && timeoutMs !== undefined) {
    return timeoutMs;
  }

  const maxOutputBytes = normalizePositiveInteger(
    request.resourceLimits?.maxOutputBytes,
    "INVALID_OUTPUT_LIMIT",
    "maxOutputBytes",
  );
  if (typeof maxOutputBytes !== "number" && maxOutputBytes !== undefined) {
    return maxOutputBytes;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const normalizedToolId = toolId ?? "";
  const normalizedInvocationId = invocationId ?? "";

  return {
    ok: true,
    invocation: {
      kind: "agentCore.basicTool.executableInvocation",
      runtimeId: runtimeId ?? "",
      sessionId: request.context?.sessionId?.trim() || undefined,
      invocationId: normalizedInvocationId,
      toolId: normalizedToolId,
      family: inferFamily(normalizedToolId, request.family),
      operation: request.operation?.trim() || normalizedToolId,
      arguments: request.arguments ?? {},
      cwd,
      resourceLimits: {
        timeoutMs,
        maxOutputBytes,
      },
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      unsafeSideEffects: false,
      tapHandoff: {
        eligible: true,
        envelopeId: `${runtimeId}:basicTool:${normalizedInvocationId}`,
      },
      audit: {
        event: "agentCore.basicTool.invocationAdapter.adapted",
        metadata: request.context?.auditMetadata ?? {},
      },
    },
    events: ["agentCore.basicTool.invocationAdapter.adapted"],
  };
}
