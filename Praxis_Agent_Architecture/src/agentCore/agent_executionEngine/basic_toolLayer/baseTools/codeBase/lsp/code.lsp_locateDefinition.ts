/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“定位定义”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type LspToolBoundary = "input" | "scope" | "governance" | "provider";

export type LspToolErrorCode =
  | "MISSING_FILE_PATH"
  | "INVALID_POSITION"
  | "SCOPE_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "MISSING_SYMBOL_NAME"
  | "MISSING_NEW_NAME"
  | "DANGEROUS_SIDE_EFFECT_BLOCKED";

export type LspToolError = {
  code: LspToolErrorCode;
  message: string;
  boundary: LspToolBoundary;
  safeForRuntimeInspection: true;
};

export type LspToolAuditEvent = {
  type: string;
  toolId: string;
  invocationId: string;
  dryRun: boolean;
  targetFilePath?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type LspToolGuard = {
  allowed: boolean;
  reason?: string;
};

export type LspToolContext = {
  invocationId?: string;
  workspaceRoot?: string;
  allowedFilePaths?: readonly string[];
  dryRun?: boolean;
  guard?: LspToolGuard;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type LspTextDocumentPosition = {
  filePath: string;
  line: number;
  character: number;
  languageId?: string;
};

export type LspRange = {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
};

export type LspLocation = {
  filePath: string;
  range: LspRange;
  uri?: string;
  symbolName?: string;
  source?: "provider" | "dry-run";
};

export type LspToolSuccessEnvelope<Output> = {
  ok: true;
  toolId: string;
  output: Output;
  audit: readonly LspToolAuditEvent[];
  events: readonly string[];
};

export type LspToolFailureEnvelope = {
  ok: false;
  toolId: string;
  error: LspToolError;
  audit: readonly LspToolAuditEvent[];
  events: readonly string[];
};

export type LspToolResult<Output> = LspToolSuccessEnvelope<Output> | LspToolFailureEnvelope;

export type LspLocateDefinitionOutput = {
  kind: "agentCore.basicTool.lsp.locateDefinition";
  target: LspTextDocumentPosition;
  locations: readonly LspLocation[];
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspLocateDefinitionProvider = (
  target: LspTextDocumentPosition,
  context: LspToolContext,
) => readonly LspLocation[] | Promise<readonly LspLocation[]>;

export type LspLocateDefinitionRequest = {
  target?: Partial<LspTextDocumentPosition>;
  context?: LspToolContext;
  provider?: LspLocateDefinitionProvider;
};

export const lspLocateDefinitionDescriptor = {
  toolId: "code.lsp_locateDefinition",
  capability: "locate-definition",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): value is undefined {
  return typeof value !== "string" || value.trim().length === 0;
}

function isValidPositionValue(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function invocationId(context: LspToolContext | undefined, toolId: string): string {
  return context?.invocationId?.trim() || `${toolId}:dry-run`;
}

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function createAuditEvent(
  type: string,
  toolId: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId,
    invocationId: invocationId(context, toolId),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  toolId: string,
  code: LspToolErrorCode,
  message: string,
  boundary: LspToolBoundary,
  context: LspToolContext | undefined,
  targetFilePath?: string,
): LspToolFailureEnvelope {
  return {
    ok: false,
    toolId,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    audit: [createAuditEvent("agentCore.basicTool.lsp.rejected", toolId, context, targetFilePath, { code, boundary })],
    events: ["basicTool.lsp.rejected"],
  };
}

export function normalizeLspTextDocumentPosition(
  target: Partial<LspTextDocumentPosition> | undefined,
): LspTextDocumentPosition | LspToolError {
  if (target === undefined || isBlank(target.filePath)) {
    return {
      code: "MISSING_FILE_PATH",
      message: "LSP tool invocation requires target.filePath",
      boundary: "input",
      safeForRuntimeInspection: true,
    };
  }

  if (!isValidPositionValue(target.line) || !isValidPositionValue(target.character)) {
    return {
      code: "INVALID_POSITION",
      message: "LSP tool invocation requires non-negative integer line and character",
      boundary: "input",
      safeForRuntimeInspection: true,
    };
  }

  return {
    filePath: target.filePath.trim(),
    line: target.line,
    character: target.character,
    languageId: target.languageId?.trim() || undefined,
  };
}

export function ensureLspToolScope(
  toolId: string,
  target: LspTextDocumentPosition,
  context: LspToolContext | undefined,
): LspToolFailureEnvelope | undefined {
  if (context?.guard?.allowed === false) {
    return failure(
      toolId,
      "GOVERNANCE_REJECTED",
      context.guard.reason ?? "LSP tool invocation was rejected by governance guard",
      "governance",
      context,
      target.filePath,
    );
  }

  if (
    context?.allowedFilePaths !== undefined &&
    !context.allowedFilePaths.map((filePath) => filePath.trim()).includes(target.filePath)
  ) {
    return failure(
      toolId,
      "SCOPE_REJECTED",
      `LSP tool target ${target.filePath} is outside the allowed file scope`,
      "scope",
      context,
      target.filePath,
    );
  }

  return undefined;
}

export function createLspDryRunLocation(target: LspTextDocumentPosition): LspLocation {
  return {
    filePath: target.filePath,
    range: {
      start: { line: target.line, character: target.character },
      end: { line: target.line, character: target.character },
    },
    source: "dry-run",
  };
}

export function createLspToolFailure(
  toolId: string,
  code: LspToolErrorCode,
  message: string,
  boundary: LspToolBoundary,
  context: LspToolContext | undefined,
  targetFilePath?: string,
): LspToolFailureEnvelope {
  return failure(toolId, code, message, boundary, context, targetFilePath);
}

export async function locateLspDefinition(
  request: LspLocateDefinitionRequest = {},
): Promise<LspToolResult<LspLocateDefinitionOutput>> {
  const toolId = lspLocateDefinitionDescriptor.toolId;
  const target = normalizeLspTextDocumentPosition(request.target);

  if ("code" in target) {
    return failure(toolId, target.code, target.message, target.boundary, request.context, request.target?.filePath);
  }

  const scopeFailure = ensureLspToolScope(toolId, target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.locateDefinition",
        target,
        locations: [createLspDryRunLocation(target)],
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspLocateDefinitionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [createAuditEvent("agentCore.basicTool.lsp.locateDefinition.dryRun", toolId, request.context, target.filePath)],
      events: ["basicTool.lsp.locateDefinition.dryRun"],
    };
  }

  if (request.provider === undefined) {
    return failure(
      toolId,
      "PROVIDER_UNAVAILABLE",
      "locate definition requires an injected LSP provider when dryRun is disabled",
      "provider",
      request.context,
      target.filePath,
    );
  }

  try {
    const locations = await request.provider(target, request.context ?? {});

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.locateDefinition",
        target,
        locations: Object.freeze([...locations]),
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspLocateDefinitionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        createAuditEvent("agentCore.basicTool.lsp.locateDefinition.provider", toolId, request.context, target.filePath, {
          locationCount: locations.length,
        }),
      ],
      events: ["basicTool.lsp.locateDefinition.providerCalled"],
    };
  } catch (error) {
    return failure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "locate definition provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
