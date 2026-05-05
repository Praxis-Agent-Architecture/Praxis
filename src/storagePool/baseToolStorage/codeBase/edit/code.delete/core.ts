import type { CodeToolResult } from "../../_shared/baseToolAdapter.js";
import {
  byteLength,
  deleteLineRange,
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

export type CodeDeleteBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CodeDeleteGate = CodeEditGate & {
  accepted: boolean;
  reason?: string;
};

export type CodeDeleteKind = "file" | "directory" | "code-range";

export type CodeDeleteRange = {
  startLine: number;
  endLine: number;
};

export type CodeDeleteRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  deleteKind?: CodeDeleteKind;
  range?: CodeDeleteRange;
  reason?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeDeleteGate;
  governance?: CodeDeleteGate;
  guard?: CodeEditGate;
  context?: CodeEditContext;
  provider?: CodeDeleteProvider;
  deleter?: CodeDeleteProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeDeleteProvider = Pick<CodeEditProvider, "readText" | "writeText" | "deletePath">;

export type CodeDeleteErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "INVALID_DELETE_RANGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_FAILURE";

export type CodeDeleteError = {
  code: CodeDeleteErrorCode;
  message: string;
  boundary: CodeDeleteBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeDeletePlan = {
  tool: "code.delete";
  capability: "delete-code-or-file";
  workspaceRoot: string;
  targetPath: string;
  deleteKind: CodeDeleteKind;
  range?: CodeDeleteRange;
  reason?: string;
  requiredPermission: "filesystem:delete";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldDelete: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-and-approval";
    event: "basicTool.code.delete.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeDeleteOutput = {
  kind: "agentCore.basicTool.code.delete.output";
  targetPath: string;
  deleteKind: CodeDeleteKind;
  range?: CodeDeleteRange;
  reason?: string;
  deleted: boolean;
  deletedLines: number;
  bytesWritten: number;
  applied: boolean;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CodeDeleteResult =
  | {
      ok: true;
      plan: CodeDeletePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeDeleteError;
      events: readonly string[];
    };

export const codeDeleteDescriptor = {
  tool: "code.delete",
  capability: "delete-code-or-file",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function failure(code: CodeDeleteErrorCode, message: string, boundary: CodeDeleteBoundary): CodeDeleteResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["basicTool.code.delete.rejected"],
  };
}

function toolFailure(
  code: CodeDeleteErrorCode,
  message: string,
  boundary: CodeDeleteBoundary,
): CodeToolResult<CodeDeleteOutput, CodeDeleteErrorCode> {
  return {
    ok: false,
    toolId: "code.delete",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [{ type: "basicTool.code.delete.rejected", toolId: "code.delete", invocationId: "code.delete", dryRun: true }],
    events: ["basicTool.code.delete.rejected"],
  };
}

export function planCodeDelete(request: CodeDeleteRequest = {}): CodeDeleteResult {
  const workspaceRoot = request.workspaceRoot?.trim() || request.context?.workspaceRoot?.trim();
  if (workspaceRoot === undefined || workspaceRoot.length === 0) {
    return failure("MISSING_WORKSPACE_ROOT", "code.delete requires a workspaceRoot for scope auditing", "input");
  }

  const normalized = normalizeRelativeTargetPath(request.targetPath, "code.delete");
  if (!normalized.ok) {
    return failure(normalized.code, normalized.message, normalized.code === "MISSING_TARGET_PATH" ? "input" : "scope");
  }

  const deleteKind = request.deleteKind ?? "file";
  if (!["file", "directory", "code-range"].includes(deleteKind)) {
    return failure("INVALID_DELETE_RANGE", "code.delete deleteKind must be file, directory, or code-range", "input");
  }
  if (deleteKind === "code-range" && !isValidPositiveRange(request.range)) {
    return failure("INVALID_DELETE_RANGE", "code.delete code-range requires a valid startLine and endLine", "input");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeDelete only returns dry-run plans; use executeCodeDelete for real execution", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "code.delete was rejected by runtime contract surface", "contract");
  }
  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "code.delete was rejected by runtime governance", "governance");
  }

  const scopes = resolveScopes(request.requestedScopes, request.allowedScopes, "code.delete");
  if (!scopes.ok) {
    return failure("SCOPE_DENIED", scopes.message, "scope");
  }

  return {
    ok: true,
    plan: {
      tool: "code.delete",
      capability: "delete-code-or-file",
      workspaceRoot,
      targetPath: normalized.path,
      deleteKind,
      range: deleteKind === "code-range" ? request.range : undefined,
      reason: request.reason?.trim() || undefined,
      requiredPermission: "filesystem:delete",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldDelete: true,
      unsafeSideEffects: false,
      acceptedScopes: scopes.acceptedScopes,
      audit: {
        guard: "target-scope-and-approval",
        event: "basicTool.code.delete.planned",
        metadata: request.metadata ?? request.context?.auditMetadata ?? {},
      },
    },
    events: ["basicTool.code.delete.planned"],
  };
}

export async function executeCodeDelete(
  request: CodeDeleteRequest = {},
): Promise<CodeToolResult<CodeDeleteOutput, CodeDeleteErrorCode>> {
  const dryRun = shouldDryRun(request.dryRun, request.context?.dryRun);
  const plan = planCodeDelete({ ...request, dryRun: undefined });
  if (!plan.ok) {
    return toolFailure(plan.error.code, plan.error.message, plan.error.boundary);
  }

  const outputBase = {
    kind: "agentCore.basicTool.code.delete.output" as const,
    targetPath: plan.plan.targetPath,
    deleteKind: plan.plan.deleteKind,
    range: plan.plan.range,
    reason: plan.plan.reason,
    deleted: false,
    deletedLines: 0,
    bytesWritten: 0,
    applied: false,
    dryRun,
    unsafeSideEffects: false as const,
  };

  if (dryRun) {
    return {
      ok: true,
      toolId: "code.delete",
      output: outputBase,
      audit: [
        {
          type: "basicTool.code.delete.planned",
          toolId: "code.delete",
          invocationId: request.context?.invocationId ?? "code.delete",
          dryRun: true,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.delete.planned"],
    };
  }

  const rejected = gateRejected(request.contract, request.governance, request.guard, request.context?.guard);
  if (rejected !== undefined) {
    return toolFailure("GOVERNANCE_REJECTED", rejected.reason ?? "code.delete was rejected by runtime governance", "governance");
  }
  if (!hasExecutionApproval(request.contract, request.governance, request.guard, request.context?.guard)) {
    return toolFailure("APPROVAL_REQUIRED", "code.delete requires explicit guard approval for non-dry-run execution", "governance");
  }

  const provider = request.deleter ?? request.provider;
  try {
    if (plan.plan.deleteKind === "code-range") {
      if (provider?.readText === undefined || provider.writeText === undefined || plan.plan.range === undefined) {
        return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.delete", "filesystem.readText and filesystem.writeText"), "provider");
      }
      const current = await provider.readText({ targetPath: plan.plan.targetPath, context: request.context?.auditMetadata });
      const next = deleteLineRange(current.content, plan.plan.range);
      const write = await provider.writeText({
        targetPath: plan.plan.targetPath,
        content: next.content,
        context: request.context?.auditMetadata,
      });
      return {
        ok: true,
        toolId: "code.delete",
        output: {
          ...outputBase,
          deletedLines: next.deletedLines,
          bytesWritten: write.bytesWritten || byteLength(next.content),
          applied: true,
          dryRun: false,
        },
        audit: [
          {
            type: "basicTool.code.delete.applied",
            toolId: "code.delete",
            invocationId: request.context?.invocationId ?? "code.delete",
            dryRun: false,
            metadata: plan.plan.audit.metadata,
          },
        ],
        events: ["basicTool.code.delete.applied"],
      };
    }

    if (provider?.deletePath === undefined) {
      return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.delete", "filesystem.deletePath"), "provider");
    }
    const deleted = await provider.deletePath({
      targetPath: plan.plan.targetPath,
      recursive: plan.plan.deleteKind === "directory",
      context: request.context?.auditMetadata,
    });
    return {
      ok: true,
      toolId: "code.delete",
      output: { ...outputBase, deleted: deleted.deleted, applied: true, dryRun: false },
      audit: [
        {
          type: "basicTool.code.delete.applied",
          toolId: "code.delete",
          invocationId: request.context?.invocationId ?? "code.delete",
          dryRun: false,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.delete.applied"],
    };
  } catch {
    return toolFailure("PROVIDER_FAILURE", providerFailureMessage("code.delete"), "provider");
  }
}
