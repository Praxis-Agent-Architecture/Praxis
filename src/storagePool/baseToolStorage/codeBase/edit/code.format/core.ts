import type { CodeToolResult } from "../../_shared/baseToolAdapter.js";
import {
  byteLength,
  gateRejected,
  hasExecutionApproval,
  isValidPositiveRange,
  normalizeRelativeTargetPath,
  providerFailureMessage,
  providerUnavailableMessage,
  resolveScopes,
  shouldDryRun,
  type CodeEditContext,
  type CodeEditGate,
  type CodeEditProvider,
} from "../_shared/editCore.js";

export type CodeFormatBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CodeFormatGate = CodeEditGate & {
  accepted: boolean;
  reason?: string;
};

export type CodeFormatRange = {
  startLine: number;
  endLine: number;
};

export type CodeFormatRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  languageHint?: string;
  formatterId?: string;
  range?: CodeFormatRange;
  options?: { tabSize?: number; insertSpaces?: boolean };
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeFormatGate;
  governance?: CodeFormatGate;
  guard?: CodeEditGate;
  context?: CodeEditContext;
  provider?: CodeFormatProvider;
  formatter?: CodeFormatProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeFormatProvider = Pick<CodeEditProvider, "readText" | "writeText" | "formatText">;

export type CodeFormatErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "INVALID_FORMAT_RANGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CodeFormatError = {
  code: CodeFormatErrorCode;
  message: string;
  boundary: CodeFormatBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeFormatPlan = {
  tool: "code.format";
  capability: "format-code";
  workspaceRoot: string;
  targetPath: string;
  languageHint?: string;
  formatterId: string;
  range?: CodeFormatRange;
  requiredPermission: "filesystem:readwrite";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldFormat: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-and-formatter-selection";
    event: "basicTool.code.format.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeFormatOutput = {
  kind: "agentCore.basicTool.code.format.output";
  targetPath: string;
  languageHint?: string;
  formatterId: string;
  range?: CodeFormatRange;
  beforeBytes: number;
  afterBytes: number;
  editsCount: number;
  bytesWritten: number;
  changed: boolean;
  applied: boolean;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CodeFormatResult =
  | {
      ok: true;
      plan: CodeFormatPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeFormatError;
      events: readonly string[];
    };

export const codeFormatDescriptor = {
  tool: "code.format",
  capability: "format-code",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function failure(code: CodeFormatErrorCode, message: string, boundary: CodeFormatBoundary): CodeFormatResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["basicTool.code.format.rejected"],
  };
}

function toolFailure(
  code: CodeFormatErrorCode,
  message: string,
  boundary: CodeFormatBoundary,
): CodeToolResult<CodeFormatOutput, CodeFormatErrorCode> {
  return {
    ok: false,
    toolId: "code.format",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [{ type: "basicTool.code.format.rejected", toolId: "code.format", invocationId: "code.format", dryRun: true }],
    events: ["basicTool.code.format.rejected"],
  };
}

export function planCodeFormat(request: CodeFormatRequest = {}): CodeFormatResult {
  const workspaceRoot = request.workspaceRoot?.trim() || request.context?.workspaceRoot?.trim();
  if (workspaceRoot === undefined || workspaceRoot.length === 0) {
    return failure("MISSING_WORKSPACE_ROOT", "code.format requires a workspaceRoot for scope auditing", "input");
  }

  const normalized = normalizeRelativeTargetPath(request.targetPath, "code.format");
  if (!normalized.ok) {
    return failure(normalized.code, normalized.message, normalized.code === "MISSING_TARGET_PATH" ? "input" : "scope");
  }

  if (request.range !== undefined && !isValidPositiveRange(request.range)) {
    return failure("INVALID_FORMAT_RANGE", "code.format range must use positive startLine and endLine values", "input");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeFormat only returns dry-run plans; use executeCodeFormat for real execution", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "code.format was rejected by runtime contract surface", "contract");
  }
  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "code.format was rejected by runtime governance", "governance");
  }

  const scopes = resolveScopes(request.requestedScopes, request.allowedScopes, "code.format");
  if (!scopes.ok) {
    return failure("SCOPE_DENIED", scopes.message, "scope");
  }

  return {
    ok: true,
    plan: {
      tool: "code.format",
      capability: "format-code",
      workspaceRoot,
      targetPath: normalized.path,
      languageHint: request.languageHint?.trim() || undefined,
      formatterId: request.formatterId?.trim() || "runtime-configured-formatter",
      range: request.range,
      requiredPermission: "filesystem:readwrite",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldFormat: true,
      unsafeSideEffects: false,
      acceptedScopes: scopes.acceptedScopes,
      audit: {
        guard: "target-scope-and-formatter-selection",
        event: "basicTool.code.format.planned",
        metadata: request.metadata ?? request.context?.auditMetadata ?? {},
      },
    },
    events: ["basicTool.code.format.planned"],
  };
}

export async function executeCodeFormat(
  request: CodeFormatRequest = {},
): Promise<CodeToolResult<CodeFormatOutput, CodeFormatErrorCode>> {
  const dryRun = shouldDryRun(request.dryRun, request.context?.dryRun);
  const plan = planCodeFormat({ ...request, dryRun: undefined });
  if (!plan.ok) {
    return toolFailure(plan.error.code, plan.error.message, plan.error.boundary);
  }

  const outputBase = {
    kind: "agentCore.basicTool.code.format.output" as const,
    targetPath: plan.plan.targetPath,
    languageHint: plan.plan.languageHint,
    formatterId: plan.plan.formatterId,
    range: plan.plan.range,
    beforeBytes: 0,
    afterBytes: 0,
    editsCount: 0,
    bytesWritten: 0,
    changed: false,
    applied: false,
    dryRun,
    unsafeSideEffects: false as const,
  };

  if (dryRun) {
    return {
      ok: true,
      toolId: "code.format",
      output: outputBase,
      audit: [
        {
          type: "basicTool.code.format.planned",
          toolId: "code.format",
          invocationId: request.context?.invocationId ?? "code.format",
          dryRun: true,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.format.planned"],
    };
  }

  const rejected = gateRejected(request.contract, request.governance, request.guard, request.context?.guard);
  if (rejected !== undefined) {
    return toolFailure("GOVERNANCE_REJECTED", rejected.reason ?? "code.format was rejected by runtime governance", "governance");
  }
  if (!hasExecutionApproval(request.contract, request.governance, request.guard, request.context?.guard)) {
    return toolFailure("APPROVAL_REQUIRED", "code.format requires explicit guard approval for non-dry-run execution", "governance");
  }

  const provider = request.formatter ?? request.provider;
  if (provider?.readText === undefined || provider.writeText === undefined || provider.formatText === undefined) {
    return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.format", "filesystem.readText, filesystem.writeText, and LSP format preview"), "provider");
  }

  try {
    const current = await provider.readText({ targetPath: plan.plan.targetPath, context: request.context?.auditMetadata });
    const formatted = await provider.formatText({
      targetPath: plan.plan.targetPath,
      content: current.content,
      languageHint: plan.plan.languageHint,
      range: plan.plan.range,
      options: request.options,
      context: request.context?.auditMetadata,
    });
    const changed = formatted.content !== current.content;
    const write = changed
      ? await provider.writeText({
          targetPath: plan.plan.targetPath,
          content: formatted.content,
          context: request.context?.auditMetadata,
        })
      : { bytesWritten: 0 };
    return {
      ok: true,
      toolId: "code.format",
      output: {
        ...outputBase,
        beforeBytes: byteLength(current.content),
        afterBytes: byteLength(formatted.content),
        editsCount: formatted.editsCount,
        bytesWritten: write.bytesWritten,
        changed,
        applied: true,
        dryRun: false,
      },
      audit: [
        {
          type: "basicTool.code.format.applied",
          toolId: "code.format",
          invocationId: request.context?.invocationId ?? "code.format",
          dryRun: false,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.format.applied"],
    };
  } catch {
    return toolFailure("PROVIDER_FAILURE", providerFailureMessage("code.format"), "provider");
  }
}
