/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码探索工具。
 * 核心目的：提供 代码基础工具 / 代码探索工具 中的“读取文件或代码内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type CodeReadBoundary = "input" | "contract" | "governance" | "scope" | "execution";

export type CodeReadGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeReadRange = {
  startLine?: number;
  endLine?: number;
};

export type CodeReadPayload = {
  content: string;
  encoding?: string;
  truncated?: boolean;
};

export type CodeReadProvider = (request: {
  targetPath: string;
  range?: CodeReadRange;
  maxBytes: number;
  encoding: string;
}) => CodeReadPayload | Promise<CodeReadPayload>;

export type CodeReadRequest = {
  toolCallId?: string;
  workspaceRoot?: string;
  targetPath?: string;
  range?: CodeReadRange;
  maxBytes?: number;
  encoding?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeReadGate;
  dryRun?: boolean;
  reader?: CodeReadProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeReadErrorCode =
  | "MISSING_TARGET_PATH"
  | "ABSOLUTE_TARGET_PATH"
  | "TARGET_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_RANGE"
  | "INVALID_MAX_BYTES"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "READER_NOT_INJECTED"
  | "READER_REJECTED";

export type CodeReadError = {
  code: CodeReadErrorCode;
  message: string;
  boundary: CodeReadBoundary;
  safeForRuntimeInspection: true;
};

export type CodeReadAudit = {
  tool: "code.read";
  toolCallId: string;
  targetPath: string;
  workspaceRoot?: string;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  dryRun: boolean;
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CodeReadPlan = {
  kind: "agentCore.basicTool.code.read.plan";
  operation: "read-file-or-code-content";
  targetPath: string;
  range?: CodeReadRange;
  maxBytes: number;
  encoding: string;
  dispatch: "dry-run" | "injected-reader";
  readsFileSystemDirectly: false;
};

export type CodeReadOutput = {
  kind: "agentCore.basicTool.code.read.output";
  targetPath: string;
  content: string;
  encoding: string;
  bytes: number;
  truncated: boolean;
  unsafeSideEffects: false;
};

export type CodeReadResult =
  | {
      ok: true;
      plan: CodeReadPlan;
      audit: CodeReadAudit;
      output?: CodeReadOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeReadError;
      events: readonly string[];
    };

export const codeReadDescriptor = {
  tool: "code.read",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed file/code read through an injected reader envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CodeReadErrorCode, message: string, boundary: CodeReadBoundary): CodeReadResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["code.read.rejected"],
  };
}

function normalizeRelativeTarget(targetPath: string): string | CodeReadResult {
  if (targetPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.read targetPath cannot contain NUL bytes", "input");
  }

  const trimmed = targetPath.trim();
  if (path.isAbsolute(trimmed)) {
    return failure("ABSOLUTE_TARGET_PATH", "code.read only accepts workspace-relative targetPath", "scope");
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return failure("TARGET_PATH_OUTSIDE_SCOPE", "code.read targetPath must stay inside the workspace scope", "scope");
  }

  return normalized;
}

function normalizeRange(range: CodeReadRange | undefined): CodeReadRange | CodeReadResult | undefined {
  if (range === undefined) {
    return undefined;
  }

  const startLine = range.startLine;
  const endLine = range.endLine;

  if (
    (startLine !== undefined && (!Number.isInteger(startLine) || startLine < 1)) ||
    (endLine !== undefined && (!Number.isInteger(endLine) || endLine < 1)) ||
    (startLine !== undefined && endLine !== undefined && endLine < startLine)
  ) {
    return failure("INVALID_RANGE", "code.read range must use positive line numbers with endLine >= startLine", "input");
  }

  return { startLine, endLine };
}

function normalizeMaxBytes(maxBytes: number | undefined): number | CodeReadResult {
  const resolved = maxBytes ?? 64 * 1024;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure("INVALID_MAX_BYTES", "code.read maxBytes must be a positive integer", "input");
  }

  return resolved;
}

function resolveAcceptedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | CodeReadResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code.read scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export async function planCodeRead(request: CodeReadRequest = {}): Promise<CodeReadResult> {
  if (isBlank(request.targetPath)) {
    return failure("MISSING_TARGET_PATH", "code.read requires a targetPath", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.read was rejected by runtime governance",
      "governance",
    );
  }

  const targetPath = normalizeRelativeTarget(request.targetPath ?? "");
  if (typeof targetPath !== "string") {
    return targetPath;
  }

  const range = normalizeRange(request.range);
  if (range !== undefined && "ok" in range) {
    return range;
  }

  const maxBytes = normalizeMaxBytes(request.maxBytes);
  if (typeof maxBytes !== "number") {
    return maxBytes;
  }

  const acceptedScopes = resolveAcceptedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const dispatch = request.dryRun === false ? "injected-reader" : "dry-run";
  if (dispatch === "injected-reader" && request.reader === undefined) {
    return failure("READER_NOT_INJECTED", "code.read requires an injected reader when dryRun is false", "execution");
  }

  const encoding = request.encoding?.trim() || "utf8";
  const toolCallId = request.toolCallId?.trim() || "code.read:dry-run";
  const audit: CodeReadAudit = {
    tool: "code.read",
    toolCallId,
    targetPath,
    workspaceRoot: request.workspaceRoot?.trim() || undefined,
    requestedScopes: cleanList(request.requestedScopes),
    acceptedScopes,
    dryRun: dispatch === "dry-run",
    unsafeSideEffects: false,
    metadata: request.metadata ?? {},
  };
  const plan: CodeReadPlan = {
    kind: "agentCore.basicTool.code.read.plan",
    operation: "read-file-or-code-content",
    targetPath,
    range,
    maxBytes,
    encoding,
    dispatch,
    readsFileSystemDirectly: false,
  };

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["code.read.planned"] };
  }

  try {
    const payload = await request.reader?.({ targetPath, range, maxBytes, encoding });
    const content = payload?.content ?? "";
    const outputEncoding = (payload?.encoding ?? encoding) as BufferEncoding;
    const bytes = Buffer.byteLength(content, outputEncoding);
    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.read.output",
        targetPath,
        content,
        encoding: outputEncoding,
        bytes,
        truncated: payload?.truncated ?? bytes > maxBytes,
        unsafeSideEffects: false,
      },
      events: ["code.read.injectedReaderCompleted"],
    };
  } catch (error) {
    return failure(
      "READER_REJECTED",
      error instanceof Error ? error.message : "code.read injected reader rejected the request",
      "execution",
    );
  }
}
