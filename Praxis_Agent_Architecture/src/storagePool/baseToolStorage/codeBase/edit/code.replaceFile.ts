/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码编辑工具。
 * 核心目的：提供 代码基础工具 / 代码编辑工具 中的“替换文件内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type CodeReplaceFileBoundary = "input" | "contract" | "governance" | "scope" | "approval";

export type CodeReplaceFileGate = {
  accepted: boolean;
  reason?: string;
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
  dryRun?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeReplaceFileErrorCode =
  | "MISSING_TARGET_PATH"
  | "MISSING_NEW_CONTENT"
  | "ABSOLUTE_TARGET_PATH"
  | "TARGET_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "APPROVAL_REQUIRED";

export type CodeReplaceFileError = {
  code: CodeReplaceFileErrorCode;
  message: string;
  boundary: CodeReplaceFileBoundary;
  safeForRuntimeInspection: true;
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
  purpose: "plan a governed whole-file replacement without writing to disk in the first implementation pass",
  defaultDispatch: "dry-run",
  approvalRequired: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CodeReplaceFileErrorCode,
  message: string,
  boundary: CodeReplaceFileBoundary,
): CodeReplaceFileResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["code.replaceFile.rejected"],
  };
}

function normalizeRelativeTarget(targetPath: string): string | CodeReplaceFileResult {
  if (targetPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.replaceFile targetPath cannot contain NUL bytes", "input");
  }

  const trimmed = targetPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure("ABSOLUTE_TARGET_PATH", "code.replaceFile only accepts workspace-relative targetPath", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return failure("TARGET_PATH_OUTSIDE_SCOPE", "code.replaceFile targetPath must stay inside the workspace scope", "scope");
  }

  return normalized;
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | CodeReplaceFileResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.replaceFile scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planCodeReplaceFile(request: CodeReplaceFileRequest = {}): CodeReplaceFileResult {
  if (isBlank(request.targetPath)) {
    return failure("MISSING_TARGET_PATH", "code.replaceFile requires a targetPath", "input");
  }

  if (request.newContent === undefined) {
    return failure("MISSING_NEW_CONTENT", "code.replaceFile requires newContent, including an empty string when clearing a file", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.replaceFile was rejected by runtime governance",
      "governance",
    );
  }

  const targetPath = normalizeRelativeTarget(request.targetPath ?? "");
  if (typeof targetPath !== "string") {
    return targetPath;
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  if (request.dryRun === false && request.approval?.accepted !== true) {
    return failure("APPROVAL_REQUIRED", "code.replaceFile requires explicit approval before any non-dry-run wiring", "approval");
  }

  const dryRun = true;
  const requestedScopes = cleanList(request.requestedScopes);
  const toolCallId = request.toolCallId?.trim() || "code.replaceFile:dry-run";

  return {
    ok: true,
    plan: {
      kind: "agentCore.basicTool.code.replaceFile.plan",
      operation: "replace-file-content",
      targetPath,
      contentBytes: Buffer.byteLength(request.newContent, "utf8"),
      expectedCurrentHash: request.expectedCurrentHash?.trim() || undefined,
      dispatch: "dry-run",
      guard: "path-scope-and-approval",
      writesFileSystem: false,
    },
    audit: {
      tool: "code.replaceFile",
      toolCallId,
      targetPath,
      workspaceRoot: request.workspaceRoot?.trim() || undefined,
      requestedScopes,
      acceptedScopes,
      dryRun,
      approvalRequired: true,
      unsafeSideEffects: false,
      metadata: request.metadata ?? {},
    },
    events: ["code.replaceFile.planned"],
  };
}
