import type { CodeToolResult } from "../../_shared/baseToolAdapter.js";
import {
  byteLength,
  gateRejected,
  hasExecutionApproval,
  normalizeRelativeTargetPath,
  providerFailureMessage,
  providerUnavailableMessage,
  replaceOccurrences,
  resolveScopes,
  shouldDryRun,
  type CodeEditContext,
  type CodeEditGate,
  type CodeEditProvider,
} from "../_shared/editCore.js";

export type CodeModifyBoundary = "input" | "contract" | "governance" | "scope" | "provider";

export type CodeModifyGate = CodeEditGate & {
  accepted: boolean;
  reason?: string;
};

export type CodeModifyOccurrence = "first" | "all";

export type CodeModifyRequest = {
  workspaceRoot?: string;
  targetPath?: string;
  searchText?: string;
  replacementText?: string;
  occurrence?: CodeModifyOccurrence;
  maxReplacements?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CodeModifyGate;
  governance?: CodeModifyGate;
  guard?: CodeEditGate;
  context?: CodeEditContext;
  provider?: CodeModifyProvider;
  modifier?: CodeModifyProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeModifyProvider = Pick<CodeEditProvider, "readText" | "writeText">;

export type CodeModifyErrorCode =
  | "MISSING_WORKSPACE_ROOT"
  | "MISSING_TARGET_PATH"
  | "TARGET_OUT_OF_SCOPE"
  | "MISSING_SEARCH_TEXT"
  | "MISSING_REPLACEMENT_TEXT"
  | "INVALID_REPLACEMENT_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "SEARCH_TEXT_NOT_FOUND"
  | "PROVIDER_FAILURE";

export type CodeModifyError = {
  code: CodeModifyErrorCode;
  message: string;
  boundary: CodeModifyBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeModifyPlan = {
  tool: "code.modify";
  capability: "modify-existing-code-snippet";
  workspaceRoot: string;
  targetPath: string;
  occurrence: CodeModifyOccurrence;
  maxReplacements: number;
  searchTextBytes: number;
  replacementTextBytes: number;
  requiredPermission: "filesystem:patch";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldModify: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "target-scope-and-bounded-replacement";
    event: "basicTool.code.modify.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CodeModifyOutput = {
  kind: "agentCore.basicTool.code.modify.output";
  targetPath: string;
  occurrence: CodeModifyOccurrence;
  maxReplacements: number;
  replacements: number;
  searchTextBytes: number;
  replacementTextBytes: number;
  beforeBytes: number;
  afterBytes: number;
  bytesWritten: number;
  firstMatchedLine?: number;
  applied: boolean;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CodeModifyResult =
  | {
      ok: true;
      plan: CodeModifyPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeModifyError;
      events: readonly string[];
    };

export const codeModifyDescriptor = {
  tool: "code.modify",
  capability: "modify-existing-code-snippet",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function failure(code: CodeModifyErrorCode, message: string, boundary: CodeModifyBoundary): CodeModifyResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["basicTool.code.modify.rejected"],
  };
}

function toolFailure(
  code: CodeModifyErrorCode,
  message: string,
  boundary: CodeModifyBoundary,
): CodeToolResult<CodeModifyOutput, CodeModifyErrorCode> {
  return {
    ok: false,
    toolId: "code.modify",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [{ type: "basicTool.code.modify.rejected", toolId: "code.modify", invocationId: "code.modify", dryRun: true }],
    events: ["basicTool.code.modify.rejected"],
  };
}

function lineNumberForOffset(source: string, offset: number): number | undefined {
  if (offset < 0) {
    return undefined;
  }
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

export function planCodeModify(request: CodeModifyRequest = {}): CodeModifyResult {
  const workspaceRoot = request.workspaceRoot?.trim() || request.context?.workspaceRoot?.trim();
  if (workspaceRoot === undefined || workspaceRoot.length === 0) {
    return failure("MISSING_WORKSPACE_ROOT", "code.modify requires a workspaceRoot for scope auditing", "input");
  }

  const normalized = normalizeRelativeTargetPath(request.targetPath, "code.modify");
  if (!normalized.ok) {
    return failure(normalized.code, normalized.message, normalized.code === "MISSING_TARGET_PATH" ? "input" : "scope");
  }

  if (typeof request.searchText !== "string" || request.searchText.length === 0) {
    return failure("MISSING_SEARCH_TEXT", "code.modify requires non-empty searchText to bound the patch", "input");
  }

  if (typeof request.replacementText !== "string") {
    return failure("MISSING_REPLACEMENT_TEXT", "code.modify requires replacementText", "input");
  }

  if (request.maxReplacements !== undefined && (!Number.isInteger(request.maxReplacements) || request.maxReplacements < 1)) {
    return failure("INVALID_REPLACEMENT_LIMIT", "code.modify maxReplacements must be a positive integer", "input");
  }

  if (request.dryRun === false) {
    return failure("REAL_SIDE_EFFECT_NOT_ALLOWED", "planCodeModify only returns dry-run plans; use executeCodeModify for real execution", "governance");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "code.modify was rejected by runtime contract surface", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "code.modify was rejected by runtime governance", "governance");
  }

  const scopes = resolveScopes(request.requestedScopes, request.allowedScopes, "code.modify");
  if (!scopes.ok) {
    return failure("SCOPE_DENIED", scopes.message, "scope");
  }

  const occurrence = request.occurrence ?? "first";
  const maxReplacements = request.maxReplacements ?? (occurrence === "first" ? 1 : 100);
  return {
    ok: true,
    plan: {
      tool: "code.modify",
      capability: "modify-existing-code-snippet",
      workspaceRoot,
      targetPath: normalized.path,
      occurrence,
      maxReplacements,
      searchTextBytes: byteLength(request.searchText),
      replacementTextBytes: byteLength(request.replacementText),
      requiredPermission: "filesystem:patch",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldModify: true,
      unsafeSideEffects: false,
      acceptedScopes: scopes.acceptedScopes,
      audit: {
        guard: "target-scope-and-bounded-replacement",
        event: "basicTool.code.modify.planned",
        metadata: request.metadata ?? request.context?.auditMetadata ?? {},
      },
    },
    events: ["basicTool.code.modify.planned"],
  };
}

export async function executeCodeModify(
  request: CodeModifyRequest = {},
): Promise<CodeToolResult<CodeModifyOutput, CodeModifyErrorCode>> {
  const dryRun = shouldDryRun(request.dryRun, request.context?.dryRun);
  const plan = planCodeModify({ ...request, dryRun: undefined });
  if (!plan.ok) {
    return toolFailure(plan.error.code, plan.error.message, plan.error.boundary);
  }

  const outputBase = {
    kind: "agentCore.basicTool.code.modify.output" as const,
    targetPath: plan.plan.targetPath,
    occurrence: plan.plan.occurrence,
    maxReplacements: plan.plan.maxReplacements,
    replacements: 0,
    searchTextBytes: plan.plan.searchTextBytes,
    replacementTextBytes: plan.plan.replacementTextBytes,
    beforeBytes: 0,
    afterBytes: 0,
    bytesWritten: 0,
    applied: false,
    dryRun,
    unsafeSideEffects: false as const,
  };

  if (dryRun) {
    return {
      ok: true,
      toolId: "code.modify",
      output: outputBase,
      audit: [
        {
          type: "basicTool.code.modify.planned",
          toolId: "code.modify",
          invocationId: request.context?.invocationId ?? "code.modify",
          dryRun: true,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.modify.planned"],
    };
  }

  const rejected = gateRejected(request.contract, request.governance, request.guard, request.context?.guard);
  if (rejected !== undefined) {
    return toolFailure("GOVERNANCE_REJECTED", rejected.reason ?? "code.modify was rejected by runtime governance", "governance");
  }
  if (!hasExecutionApproval(request.contract, request.governance, request.guard, request.context?.guard)) {
    return toolFailure("APPROVAL_REQUIRED", "code.modify requires explicit guard approval for non-dry-run execution", "governance");
  }

  const provider = request.modifier ?? request.provider;
  if (provider?.readText === undefined || provider.writeText === undefined) {
    return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.modify", "filesystem.readText and filesystem.writeText"), "provider");
  }

  try {
    const current = await provider.readText({ targetPath: plan.plan.targetPath, context: request.context?.auditMetadata });
    const firstMatchedLine = lineNumberForOffset(
      current.content,
      current.content.indexOf(request.searchText ?? ""),
    );
    const next = replaceOccurrences(
      current.content,
      request.searchText ?? "",
      request.replacementText ?? "",
      plan.plan.occurrence,
      plan.plan.maxReplacements,
    );
    if (next.replacements === 0) {
      return toolFailure("SEARCH_TEXT_NOT_FOUND", "code.modify searchText was not found in the target file", "input");
    }
    const write = await provider.writeText({
      targetPath: plan.plan.targetPath,
      content: next.content,
      context: request.context?.auditMetadata,
    });
    return {
      ok: true,
      toolId: "code.modify",
      output: {
        ...outputBase,
        replacements: next.replacements,
        beforeBytes: byteLength(current.content),
        afterBytes: byteLength(next.content),
        bytesWritten: write.bytesWritten,
        firstMatchedLine,
        applied: true,
        dryRun: false,
      },
      audit: [
        {
          type: "basicTool.code.modify.applied",
          toolId: "code.modify",
          invocationId: request.context?.invocationId ?? "code.modify",
          dryRun: false,
          metadata: plan.plan.audit.metadata,
        },
      ],
      events: ["basicTool.code.modify.applied"],
    };
  } catch {
    return toolFailure("PROVIDER_FAILURE", providerFailureMessage("code.modify"), "provider");
  }
}
