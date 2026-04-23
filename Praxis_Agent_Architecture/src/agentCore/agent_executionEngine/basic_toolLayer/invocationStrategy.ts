/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 invocation Strategy 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type BasicToolInvocationFamily =
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

export type BasicToolInvocationRisk = "read" | "write" | "process" | "network" | "host-control";

export type BasicToolInvocationMode = "dry-run" | "tap-handoff";

export type BasicToolStrategyBoundary = "input" | "contract" | "governance" | "scope";

export type BasicToolStrategyGate = {
  accepted: boolean;
  reason?: string;
};

export type BasicToolStrategyContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: BasicToolStrategyGate;
  governance?: BasicToolStrategyGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type BasicToolStrategyRequest = {
  context?: BasicToolStrategyContext;
  toolId?: string;
  family?: BasicToolInvocationFamily;
  risks?: readonly BasicToolInvocationRisk[];
  preferredMode?: BasicToolInvocationMode;
};

export type BasicToolStrategyErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TOOL_ID"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type BasicToolStrategyError = {
  code: BasicToolStrategyErrorCode;
  message: string;
  boundary: BasicToolStrategyBoundary;
  publicSafe: true;
};

export type BasicToolInvocationStrategy = {
  strategyId: string;
  toolId: string;
  family: BasicToolInvocationFamily;
  mode: BasicToolInvocationMode;
  dispatch: "dry-run";
  requiresTapApproval: boolean;
  governancePreconditions: readonly string[];
  acceptedScopes: readonly string[];
  risks: readonly BasicToolInvocationRisk[];
  dryRun: true;
  unsafeSideEffects: false;
  audit: {
    event: "agentCore.basicTool.invocationStrategy.selected";
    runtimeId: string;
    invocationId: string;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type BasicToolStrategyResult =
  | {
      ok: true;
      strategy: BasicToolInvocationStrategy;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BasicToolStrategyError;
      events: readonly string[];
    };

export const basicToolInvocationStrategyDescriptor = {
  capability: "select-basic-tool-invocation-strategy",
  layer: "agent_executionEngine.basic_toolLayer.invocationStrategy",
  defaultMode: "dry-run",
  tapHandoffMode: "tap-handoff",
  unsafeSideEffects: false,
} as const;

const knownFamilies: readonly BasicToolInvocationFamily[] = [
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

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanRisks(values: readonly BasicToolInvocationRisk[] | undefined): readonly BasicToolInvocationRisk[] {
  return [...new Set(values ?? [])];
}

function inferFamily(toolId: string, explicit: BasicToolInvocationFamily | undefined): BasicToolInvocationFamily {
  if (explicit !== undefined) {
    return explicit;
  }

  const prefix = toolId.split(".")[0] as BasicToolInvocationFamily | undefined;
  return prefix !== undefined && knownFamilies.includes(prefix) ? prefix : "custom";
}

function failure(
  code: BasicToolStrategyErrorCode,
  message: string,
  boundary: BasicToolStrategyBoundary,
): BasicToolStrategyResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicTool.invocationStrategy.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | BasicToolStrategyResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `basic tool strategy scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function needsTapApproval(risks: readonly BasicToolInvocationRisk[], mode: BasicToolInvocationMode): boolean {
  return mode === "tap-handoff" || risks.some((risk) => risk !== "read");
}

export function selectBasicToolInvocationStrategy(
  request: BasicToolStrategyRequest = {},
): BasicToolStrategyResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "basic tool invocation strategy requires context.runtimeId", "input");
  }

  const toolId = request.toolId?.trim();
  if (isBlank(toolId)) {
    return failure("MISSING_TOOL_ID", "basic tool invocation strategy requires toolId", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round basic tool invocation strategy only selects dry-run or TAP handoff plans",
      "contract",
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "basic tool invocation strategy was rejected by contract surface",
      "contract",
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "basic tool invocation strategy was rejected by governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const risks = cleanRisks(request.risks);
  const family = inferFamily(toolId ?? "", request.family);
  const mode = request.preferredMode ?? (needsTapApproval(risks, "dry-run") ? "tap-handoff" : "dry-run");
  const invocationId = request.context?.invocationId?.trim() || `${toolId}:strategy`;

  return {
    ok: true,
    strategy: {
      strategyId: `${runtimeId}:basicToolStrategy:${invocationId}`,
      toolId: toolId ?? "",
      family,
      mode,
      dispatch: "dry-run",
      requiresTapApproval: needsTapApproval(risks, mode),
      governancePreconditions: [
        "runtime.contract.accepted",
        "runtime.governance.accepted",
        "scope.within-basic-tool-boundary",
      ],
      acceptedScopes,
      risks,
      dryRun: true,
      unsafeSideEffects: false,
      audit: {
        event: "agentCore.basicTool.invocationStrategy.selected",
        runtimeId: runtimeId ?? "",
        invocationId,
        metadata: request.context?.auditMetadata ?? {},
      },
    },
    events: ["agentCore.basicTool.invocationStrategy.selected"],
  };
}
