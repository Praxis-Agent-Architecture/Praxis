import type { CodeToolResult } from "../../_shared/baseToolAdapter.js";
import {
  byteLength,
  cleanList,
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

export type CodeReplaceFileBoundary = "input" | "contract" | "governance" | "scope" | "approval" | "provider";

export type CodeReplaceFileGate = CodeEditGate & {
  accepted: boolean;
};

export type CodeReplaceFileRequest = {
  toolCallId?: string;
  workspaceRoot?: string;
  targetPath?: string;
  newContent?: string;
  expectedCurrentHash?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  approval?: CodeReplaceFileGate;
  governance?: CodeReplaceFileGate;
  guard?: CodeEditGate;
  context?: CodeEditContext;
  dryRun?: boolean;
  provider?: CodeReplaceFileProvider;
  writer?: CodeReplaceFileProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeReplaceFileProvider = Pick<CodeEditProvider, "readText" | "writeText">;

export type CodeReplaceFileErrorCode =
  | "MISSING_TARGET_PATH"
  | "MISSING_NEW_CONTENT"
  | "ABSOLUTE_TARGET_PATH"
  | "TARGET_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "APPROVAL_REQUIRED"
  | "PROVIDER_UNAVAILABLE"
  | "HASH_MISMATCH"
  | "PROVIDER_FAILURE";

export type CodeReplaceFileError = {
  code: CodeReplaceFileErrorCode;
  message: string;
  boundary: CodeReplaceFileBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed?: false;
};

export type CodeReplaceFileAudit = {
  tool: "code.replaceFile";
  toolCallId: string;
  targetPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  approvalRequired: true;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeReplaceFilePlan = {
  kind: "agentCore.basicTool.code.replaceFile.plan";
  operation: "replace-file-content";
  targetPath: string;
  contentBytes: number;
  expectedCurrentHash?: string;
  dispatch: "dry-run";
  guard: "path-scope-and-approval";
  writesFileSystem: false;
};

export type CodeReplaceFileOutput = {
  kind: "agentCore.basicTool.code.replaceFile.output";
  targetPath: string;
  contentBytes: number;
  expectedCurrentHash?: string;
  actualCurrentHash?: string;
  bytesWritten: number;
  changed: boolean;
  applied: boolean;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type CodeReplaceFileResult =
  | {
      ok: true;
      plan: CodeReplaceFilePlan;
      audit: CodeReplaceFileAudit;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeReplaceFileError;
      events: readonly string[];
    };

export const codeReplaceFileDescriptor = {
  tool: "code.replaceFile",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.edit",
  purpose: "replace a whole file through governed storage-owned edit semantics and runtime filesystem support",
  defaultDispatch: "dry-run",
  approvalRequired: true,
  unsafeSideEffects: false,
} as const;

function legacyFailure(
  code: CodeReplaceFileErrorCode,
  message: string,
  boundary: CodeReplaceFileBoundary,
): CodeReplaceFileResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["code.replaceFile.rejected"],
  };
}

function toolFailure(
  code: CodeReplaceFileErrorCode,
  message: string,
  boundary: CodeReplaceFileBoundary,
): CodeToolResult<CodeReplaceFileOutput, CodeReplaceFileErrorCode> {
  return {
    ok: false,
    toolId: "code.replaceFile",
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [
      {
        type: "basicTool.code.replaceFile.rejected",
        toolId: "code.replaceFile",
        invocationId: "code.replaceFile",
        dryRun: true,
      },
    ],
    events: ["code.replaceFile.rejected"],
  };
}

function normalizeTargetForLegacy(targetPath: string | undefined): string | CodeReplaceFileResult {
  const normalized = normalizeRelativeTargetPath(targetPath, "code.replaceFile");
  if (normalized.ok) {
    return normalized.path;
  }
  if (normalized.code === "MISSING_TARGET_PATH") {
    return legacyFailure("MISSING_TARGET_PATH", normalized.message, "input");
  }
  if (targetPath?.includes("\0")) {
    return legacyFailure("NUL_BYTE_IN_PATH", "code.replaceFile targetPath cannot contain NUL bytes", "input");
  }
  if (targetPath?.trim().startsWith("/")) {
    return legacyFailure("ABSOLUTE_TARGET_PATH", "code.replaceFile only accepts workspace-relative targetPath", "scope");
  }
  return legacyFailure("TARGET_PATH_OUTSIDE_SCOPE", normalized.message, "scope");
}

export function planCodeReplaceFile(request: CodeReplaceFileRequest = {}): CodeReplaceFileResult {
  const targetPath = normalizeTargetForLegacy(request.targetPath);
  if (typeof targetPath !== "string") {
    return targetPath;
  }

  if (request.newContent === undefined) {
    return legacyFailure("MISSING_NEW_CONTENT", "code.replaceFile requires newContent, including an empty string when clearing a file", "input");
  }

  if (request.governance?.accepted === false) {
    return legacyFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.replaceFile was rejected by runtime governance",
      "governance",
    );
  }

  const scopes = resolveScopes(request.requestedScopes, request.allowedScopes, "code.replaceFile");
  if (!scopes.ok) {
    return legacyFailure("SCOPE_DENIED", scopes.message, "scope");
  }

  if (request.dryRun === false && request.approval?.accepted !== true) {
    return legacyFailure("APPROVAL_REQUIRED", "code.replaceFile requires explicit approval before non-dry-run execution", "approval");
  }

  const toolCallId = request.toolCallId?.trim() || "code.replaceFile:dry-run";
  return {
    ok: true,
    plan: {
      kind: "agentCore.basicTool.code.replaceFile.plan",
      operation: "replace-file-content",
      targetPath,
      contentBytes: byteLength(request.newContent),
      expectedCurrentHash: request.expectedCurrentHash?.trim() || undefined,
      dispatch: "dry-run",
      guard: "path-scope-and-approval",
      writesFileSystem: false,
    },
    audit: {
      tool: "code.replaceFile",
      toolCallId,
      targetPath,
      workspaceRoot: request.workspaceRoot?.trim() || request.context?.workspaceRoot?.trim() || undefined,
      requestedScopes: cleanList(request.requestedScopes),
      acceptedScopes: scopes.acceptedScopes,
      dryRun: true,
      approvalRequired: true,
      unsafeSideEffects: false,
      metadata: request.metadata ?? request.context?.auditMetadata ?? {},
    },
    events: ["code.replaceFile.planned"],
  };
}

export async function executeCodeReplaceFile(
  request: CodeReplaceFileRequest = {},
): Promise<CodeToolResult<CodeReplaceFileOutput, CodeReplaceFileErrorCode>> {
  const dryRun = shouldDryRun(request.dryRun, request.context?.dryRun);
  const plan = planCodeReplaceFile({ ...request, dryRun: undefined });
  if (!plan.ok) {
    return toolFailure(plan.error.code, plan.error.message, plan.error.boundary);
  }

  const targetPath = plan.plan.targetPath;
  const outputBase = {
    kind: "agentCore.basicTool.code.replaceFile.output" as const,
    targetPath,
    contentBytes: plan.plan.contentBytes,
    expectedCurrentHash: plan.plan.expectedCurrentHash,
    bytesWritten: 0,
    changed: true,
    applied: false,
    dryRun,
    unsafeSideEffects: false as const,
  };

  if (dryRun) {
    return {
      ok: true,
      toolId: "code.replaceFile",
      output: outputBase,
      audit: [
        {
          type: "basicTool.code.replaceFile.planned",
          toolId: "code.replaceFile",
          invocationId: request.context?.invocationId ?? request.toolCallId ?? "code.replaceFile",
          dryRun: true,
          metadata: plan.audit.metadata,
        },
      ],
      events: ["code.replaceFile.planned"],
    };
  }

  const rejectedGate = gateRejected(request.governance, request.approval, request.guard, request.context?.guard);
  if (rejectedGate !== undefined) {
    return toolFailure(
      "GOVERNANCE_REJECTED",
      rejectedGate.reason ?? "code.replaceFile was rejected by runtime governance",
      "governance",
    );
  }

  if (!hasExecutionApproval(request.approval, request.governance, request.guard, request.context?.guard)) {
    return toolFailure("APPROVAL_REQUIRED", "code.replaceFile requires explicit guard approval for non-dry-run execution", "approval");
  }

  const provider = request.writer ?? request.provider;
  if (provider?.writeText === undefined) {
    return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.replaceFile", "filesystem.writeText"), "provider");
  }

  let actualCurrentHash: string | undefined;
  try {
    if (plan.plan.expectedCurrentHash !== undefined) {
      if (provider.readText === undefined) {
        return toolFailure("PROVIDER_UNAVAILABLE", providerUnavailableMessage("code.replaceFile", "filesystem.readText for hash checks"), "provider");
      }
      const current = await provider.readText({ targetPath, context: request.context?.auditMetadata });
      actualCurrentHash = sha256Text(current.content);
      if (actualCurrentHash !== plan.plan.expectedCurrentHash) {
        return toolFailure("HASH_MISMATCH", "code.replaceFile expectedCurrentHash does not match current content", "governance");
      }
    }

    const writeResult = await provider.writeText({
      targetPath,
      content: request.newContent ?? "",
      context: request.context?.auditMetadata,
    });
    return {
      ok: true,
      toolId: "code.replaceFile",
      output: {
        ...outputBase,
        actualCurrentHash,
        bytesWritten: writeResult.bytesWritten,
        applied: true,
        dryRun: false,
      },
      audit: [
        {
          type: "basicTool.code.replaceFile.applied",
          toolId: "code.replaceFile",
          invocationId: request.context?.invocationId ?? request.toolCallId ?? "code.replaceFile",
          dryRun: false,
          metadata: plan.audit.metadata,
        },
      ],
      events: ["code.replaceFile.applied"],
    };
  } catch {
    return toolFailure("PROVIDER_FAILURE", providerFailureMessage("code.replaceFile"), "provider");
  }
}
