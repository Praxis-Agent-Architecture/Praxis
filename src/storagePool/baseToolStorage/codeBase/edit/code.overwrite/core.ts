import type { CodeToolResult } from "../../_shared/baseToolAdapter.js";
import {
  byteLength,
  gateRejected,
  hasExecutionApproval,
  normalizeRelativeTargetPath,
  providerFailureMessage,
  providerUnavailableMessage,
  resolveScopes,
  sha256Text,
  shouldDryRun,
  type CodeEditContext,
  type CodeEditGate,
  type CodeEditProvider,
} from "../_shared/editCore.js";

export type CodeOverwriteBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "provider";

export type CodeOverwriteGate = CodeEditGate & {
  accepted: boolean;
  reason?: string;
};

export type CodeOverwriteRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  content?: string;
  expectedExistingHash?: string;
  maxBytes?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeOverwriteGate;
  governance?: CodeOverwriteGate;
  guard?: CodeEditGate;
  context?: CodeEditContext;
  provider?: CodeOverwriteProvider;
  writer?: CodeOverwriteProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeOverwriteProvider = Pick<CodeEditProvider, "readText" | "writeText">;

export type CodeOverwriteErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "MISSING_CONTENT"
  | "CONTENT_TOO_LARGE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "HASH_MISMATCH"
  | "OUTSIDE_ALLOWED_ROOTS"
  | "PROVIDER_FAILURE";

export type CodeOverwriteError = {
  code: CodeOverwriteErrorCode;
  message: string;
  boundary: CodeOverwriteBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeOverwritePlan = {
  tool: "code.overwrite";
  capability: "overwrite-file-content";
  workspaceRoot: string;
  targetPath: string;
  contentBytes: number;
  expectedExistingHash?: string;
  maxBytes: number;
  requiredPermission: "filesystem:overwrite";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldOverwrite: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-size-and-approval";
    event: "basicTool.code.overwrite.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeOverwriteOutput = {
  kind: "agentCore.basicTool.code.overwrite.output";
  targetPath: string;
  contentBytes: number;
  expectedExistingHash?: string;
  actualExistingHash?: string;
  maxBytes: number;
  bytesWritten: number;
  applied: boolean;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CodeOverwriteResult =
  | {
      ok: true;
      plan: CodeOverwritePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeOverwriteError;
      events: readonly string[];
    };

export const codeOverwriteDescriptor = {
  tool: "code.overwrite",
  capability: "overwrite-file-content",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function failure(code: CodeOverwriteErrorCode, message: string, boundary: CodeOverwriteBoundary): CodeOverwriteResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.code.overwrite.rejected"],
  };
}

function objectValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function toolFailure(
  code: CodeOverwriteErrorCode,
  message: string,
  boundary: CodeOverwriteBoundary,
  metadata?: Readonly<Record<string, unknown>>,
): CodeToolResult<CodeOverwriteOutput, CodeOverwriteErrorCode> {
  return {
    ok: false,
    toolId: "code.overwrite",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false, ...(metadata ?? {}) },
    audit: [{ type: "basicTool.code.overwrite.rejected", toolId: "code.overwrite", invocationId: "code.overwrite", dryRun: true }],
    events: ["basicTool.code.overwrite.rejected"],
  };
}

export function planCodeOverwrite(request: CodeOverwriteRequest = {}): CodeOverwriteResult {
  const workspaceRoot = request.workspaceRoot?.trim() || request.context?.workspaceRoot?.trim();
  if (workspaceRoot === undefined || workspaceRoot.length === 0) {
    return failure("MISSING_WORKSPACE_ROOT", "code.overwrite requires a workspaceRoot for scope auditing", "input");
  }

  const normalized = normalizeRelativeTargetPath(request.targetPath, "code.overwrite");
  if (!normalized.ok) {
    return failure(normalized.code, normalized.message, normalized.code === "MISSING_TARGET_PATH" ? "input" : "scope");
  }

  if (typeof request.content !== "string") {
    return failure("MISSING_CONTENT", "code.overwrite requires explicit content", "input");
  }

  const maxBytes = request.maxBytes ?? 1_048_576;
  const contentBytes = byteLength(request.content);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || contentBytes > maxBytes) {
    return failure("CONTENT_TOO_LARGE", "code.overwrite content exceeds the configured byte limit", "resource");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeOverwrite only returns dry-run plans; use executeCodeOverwrite for real execution", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "code.overwrite was rejected by runtime contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "code.overwrite was rejected by runtime governance", "governance");
  }

  const scopes = resolveScopes(request.requestedScopes, request.allowedScopes, "code.overwrite");
  if (!scopes.ok) {
    return failure("SCOPE_DENIED", scopes.message, "scope");
  }

  return {
    ok: true,
    plan: {
      tool: "code.overwrite",
      capability: "overwrite-file-content",
      workspaceRoot,
      targetPath: normalized.path,
      contentBytes,
      expectedExistingHash: request.expectedExistingHash?.trim() || undefined,
      maxBytes,
      requiredPermission: "filesystem:overwrite",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldOverwrite: true,
      unsafeSideEffects: false,
      acceptedScopes: scopes.acceptedScopes,
      audit: {
        guard: "target-scope-size-and-approval",
        event: "basicTool.code.overwrite.planned",
        metadata: request.metadata ?? request.context?.auditMetadata ?? {},
      },
    },
    events: ["basicTool.code.overwrite.planned"],
  };
}

export async function executeCodeOverwrite(
  request: CodeOverwriteRequest = {},
): Promise<CodeToolResult<CodeOverwriteOutput, CodeOverwriteErrorCode>> {
  const dryRun = shouldDryRun(request.dryRun, request.context?.dryRun);
  const plan = planCodeOverwrite({ ...request, dryRun: undefined });
  if (!plan.ok) {
    return toolFailure(plan.error.code, plan.error.message, plan.error.boundary);
  }

  const outputBase = {
    kind: "agentCore.basicTool.code.overwrite.output" as const,
    targetPath: plan.plan.targetPath,
    contentBytes: plan.plan.contentBytes,
    expectedExistingHash: plan.plan.expectedExistingHash,
    maxBytes: plan.plan.maxBytes,
    bytesWritten: 0,
    applied: false,
    dryRun,
    unsafeSideEffects: false as const,
  };

  if (dryRun) {
    return {
      ok: true,
      toolId: "code.overwrite",
      output: outputBase,
      audit: [
        {
          type: "basicTool.code.overwrite.planned",
          toolId: "code.overwrite",
          invocationId: request.context?.invocationId ?? "code.overwrite",
          dryRun: true,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.overwrite.planned"],
    };
  }

  const rejected = gateRejected(request.contract, request.governance, request.guard, request.context?.guard);
  if (rejected !== undefined) {
    return toolFailure("GOVERNANCE_REJECTED", rejected.reason ?? "code.overwrite was rejected by runtime governance", "governance");
  }
  if (!hasExecutionApproval(request.contract, request.governance, request.guard, request.context?.guard)) {
    return toolFailure("APPROVAL_REQUIRED", "code.overwrite requires explicit guard approval for non-dry-run execution", "governance");
  }

  const provider = request.writer ?? request.provider;
  if (provider?.writeText === undefined) {
    return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.overwrite", "filesystem.writeText"), "provider");
  }

  let actualExistingHash: string | undefined;
  try {
    if (plan.plan.expectedExistingHash !== undefined) {
      if (provider.readText === undefined) {
        return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.overwrite", "filesystem.readText for hash checks"), "provider");
      }
      const current = await provider.readText({ targetPath: plan.plan.targetPath, context: request.context?.auditMetadata });
      actualExistingHash = sha256Text(current.content);
      if (actualExistingHash !== plan.plan.expectedExistingHash) {
        return toolFailure("HASH_MISMATCH", "code.overwrite expectedExistingHash does not match current content", "governance");
      }
    }

    const write = await provider.writeText({
      targetPath: plan.plan.targetPath,
      content: request.content ?? "",
      context: request.context?.auditMetadata,
    });
    return {
      ok: true,
      toolId: "code.overwrite",
      output: { ...outputBase, ...write, actualExistingHash, bytesWritten: write.bytesWritten, applied: true, dryRun: false },
      audit: [
        {
          type: "basicTool.code.overwrite.applied",
          toolId: "code.overwrite",
          invocationId: request.context?.invocationId ?? "code.overwrite",
          dryRun: false,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.overwrite.applied"],
    };
  } catch (error) {
    const code = error instanceof Error && error.name === "OUTSIDE_ALLOWED_ROOTS" ? "OUTSIDE_ALLOWED_ROOTS" : "PROVIDER_FAILURE";
    return toolFailure(
      code,
      error instanceof Error ? error.message : providerFailureMessage("code.overwrite"),
      "provider",
      objectValue(error instanceof Error ? error.cause : undefined),
    );
  }
}
