import path from "node:path";

import type { CodeToolAuditEvent, CodeToolResult } from "../../_shared/baseToolAdapter.js";

export type CodeReadBoundary = "input" | "contract" | "governance" | "scope" | "resource" | "execution" | "provider";

export type CodeReadGate = {
  accepted?: boolean;
  allowed?: boolean;
  reason?: string;
};

export type CodeReadRange = {
  startLine?: number;
  endLine?: number;
};

export type CodeReadTarget = {
  targetPath: string;
  range?: CodeReadRange;
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
  context?: CodeReadContext;
}) => CodeReadPayload | Promise<CodeReadPayload>;

export type CodeReadContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CodeReadGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CodeReadRequest = {
  context?: CodeReadContext;
  toolCallId?: string;
  workspaceRoot?: string;
  targetPath?: string;
  targetPaths?: readonly string[];
  targets?: readonly CodeReadTarget[];
  range?: CodeReadRange;
  maxBytes?: number;
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
  encoding?: string;
  includeLineNumbers?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  governance?: CodeReadGate;
  dryRun?: boolean;
  reader?: CodeReadProvider;
  provider?: CodeReadProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CodeReadErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_TARGET_PATH"
  | "ABSOLUTE_TARGET_PATH"
  | "TARGET_PATH_OUTSIDE_SCOPE"
  | "NUL_BYTE_IN_PATH"
  | "INVALID_TARGETS"
  | "INVALID_RANGE"
  | "INVALID_MAX_BYTES"
  | "INVALID_ENCODING"
  | "SCOPE_DENIED"
  | "GOVERNANCE_REJECTED"
  | "READER_NOT_INJECTED"
  | "READER_REJECTED";

export type CodeReadError = {
  code: CodeReadErrorCode;
  message: string;
  boundary: CodeReadBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeReadAudit = {
  tool: "code.read";
  toolCallId: string;
  targetPath: string;
  targetPaths: readonly string[];
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
  targetPaths: readonly string[];
  range?: CodeReadRange;
  maxBytes: number;
  maxBytesPerFile: number;
  maxTotalBytes: number;
  encoding: string;
  includeLineNumbers: boolean;
  dispatch: "dry-run" | "injected-reader";
  readsFileSystemDirectly: false;
};

export type CodeReadFileOutput = {
  targetPath: string;
  content: string;
  encoding: string;
  bytes: number;
  truncated: boolean;
  range?: CodeReadRange;
};

export type CodeReadOutput = {
  kind: "agentCore.basicTool.code.read.output";
  targetPath: string;
  targetPaths: readonly string[];
  content: string;
  files: readonly CodeReadFileOutput[];
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

type NormalizedReadTarget = {
  targetPath: string;
  range?: CodeReadRange;
};

type NormalizedReadRequest = {
  toolCallId: string;
  context: CodeReadContext;
  targetPath: string;
  targets: readonly NormalizedReadTarget[];
  range?: CodeReadRange;
  maxBytesPerFile: number;
  maxTotalBytes: number;
  encoding: string;
  includeLineNumbers: boolean;
  acceptedScopes: readonly string[];
  provider?: CodeReadProvider;
  metadata: Readonly<Record<string, unknown>>;
};

export const codeReadDescriptor = {
  tool: "code.read",
  toolId: "code.read",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.explore",
  purpose: "prepare or run a governed file/code read through an injected reader envelope",
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  defaultMaxBytesPerFile: 64 * 1024,
  defaultMaxTotalBytes: 256 * 1024,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: unknown): readonly string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

function failure(code: CodeReadErrorCode, message: string, boundary: CodeReadBoundary): CodeReadResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    events: ["code.read.rejected"],
  };
}

function toolFailure(
  code: CodeReadErrorCode,
  message: string,
  boundary: CodeReadBoundary,
  context: CodeReadContext | undefined,
): CodeToolResult<CodeReadOutput, CodeReadErrorCode> {
  return {
    ok: false,
    toolId: "code.read",
    error: { code, message, boundary, safeForRuntimeInspection: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.code.read.rejected", context, { code, boundary })],
    events: ["code.read.rejected"],
  };
}

function auditEvent(
  type: string,
  context: CodeReadContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): CodeToolAuditEvent {
  return {
    type,
    toolId: "code.read",
    invocationId: stringValue(context?.invocationId)?.trim() || "code.read:dry-run",
    dryRun: context?.dryRun !== false,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function guardRejected(guard: CodeReadGate | undefined): boolean {
  return guard?.accepted === false || guard?.allowed === false;
}

function normalizeRange(value: unknown): CodeReadRange | CodeReadResult | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return failure("INVALID_RANGE", "code.read range must be an object", "input");
  }
  const startLine = value.startLine;
  const endLine = value.endLine;
  if (
    (startLine !== undefined && (!Number.isInteger(startLine) || Number(startLine) < 1)) ||
    (endLine !== undefined && (!Number.isInteger(endLine) || Number(endLine) < 1)) ||
    (startLine !== undefined && endLine !== undefined && Number(endLine) < Number(startLine))
  ) {
    return failure("INVALID_RANGE", "code.read range must use positive line numbers with endLine >= startLine", "input");
  }
  return {
    startLine: typeof startLine === "number" ? startLine : undefined,
    endLine: typeof endLine === "number" ? endLine : undefined,
  };
}

function normalizePositiveInteger(value: unknown, fallback: number, errorCode: CodeReadErrorCode): number | CodeReadResult {
  if (value !== undefined && typeof value !== "number") {
    return failure(errorCode, "code.read byte limits must be positive integers", "resource");
  }
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure(errorCode, "code.read byte limits must be positive integers", "resource");
  }
  return resolved;
}

function normalizeTargetPath(targetPath: string, workspaceRoot?: string, allowedRoots: readonly string[] = []): string | CodeReadResult {
  if (targetPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "code.read targetPath cannot contain NUL bytes", "input");
  }

  const trimmed = targetPath.trim();
  if (path.isAbsolute(trimmed)) {
    const allowed = [workspaceRoot, ...allowedRoots].filter((root): root is string => typeof root === "string" && root.trim().length > 0);
    const normalizedAbsolute = path.resolve(trimmed);
    if (allowed.length === 0) {
      return failure("ABSOLUTE_TARGET_PATH", "code.read absolute targetPath requires workspaceRoot or allowedRoots", "scope");
    }
    const insideAllowed = allowed.some((root) => {
      const normalizedRoot = path.resolve(root);
      return normalizedAbsolute === normalizedRoot || normalizedAbsolute.startsWith(`${normalizedRoot}${path.sep}`);
    });
    if (!insideAllowed) {
      return failure("TARGET_PATH_OUTSIDE_SCOPE", "code.read targetPath must stay inside workspaceRoot or allowedRoots", "scope");
    }
    return normalizedAbsolute;
  }

  const normalized = path.posix.normalize(trimmed.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return failure("TARGET_PATH_OUTSIDE_SCOPE", "code.read targetPath must stay inside the workspace scope", "scope");
  }

  return normalized;
}

function normalizeTargets(request: CodeReadRequest, context: CodeReadContext): readonly NormalizedReadTarget[] | CodeReadResult {
  const requestTargets: NormalizedReadTarget[] = [];
  const workspaceRoot = context.workspaceRoot ?? request.workspaceRoot;
  const allowedRoots = cleanList(context.allowedRoots);

  if (!isBlank(request.targetPath)) {
    const range = normalizeRange(request.range);
    if (range !== undefined && "ok" in range) return range;
    const targetPath = normalizeTargetPath(String(request.targetPath), workspaceRoot, allowedRoots);
    if (typeof targetPath !== "string") return targetPath;
    requestTargets.push({ targetPath, range });
  }

  if (Array.isArray(request.targetPaths)) {
    for (const rawTarget of request.targetPaths) {
      if (typeof rawTarget !== "string" || rawTarget.trim().length === 0) {
        return failure("INVALID_TARGETS", "code.read targetPaths must contain non-empty strings", "input");
      }
      const targetPath = normalizeTargetPath(rawTarget, workspaceRoot, allowedRoots);
      if (typeof targetPath !== "string") return targetPath;
      requestTargets.push({ targetPath });
    }
  }

  if (Array.isArray(request.targets)) {
    for (const rawTarget of request.targets) {
      if (!isRecord(rawTarget) || isBlank(rawTarget.targetPath)) {
        return failure("INVALID_TARGETS", "code.read targets must contain targetPath strings", "input");
      }
      const range = normalizeRange(rawTarget.range);
      if (range !== undefined && "ok" in range) return range;
      const targetPath = normalizeTargetPath(String(rawTarget.targetPath), workspaceRoot, allowedRoots);
      if (typeof targetPath !== "string") return targetPath;
      requestTargets.push({ targetPath, range });
    }
  }

  if (requestTargets.length === 0) {
    return failure("MISSING_TARGET_PATH", "code.read requires targetPath, targetPaths, or targets", "input");
  }

  const deduped = new Map<string, NormalizedReadTarget>();
  for (const target of requestTargets) {
    const key = `${target.targetPath}:${target.range?.startLine ?? ""}:${target.range?.endLine ?? ""}`;
    deduped.set(key, target);
  }
  return [...deduped.values()];
}

function resolveAcceptedScopes(requestedScopes: unknown, allowedScopes: unknown): readonly string[] | CodeReadResult {
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

function normalizeRequest(value: unknown): NormalizedReadRequest | CodeReadResult {
  if (!isRecord(value)) {
    return failure("INVALID_REQUEST", "code.read request must be a JSON object", "input");
  }
  const request = value as CodeReadRequest;
  const context = isRecord(request.context) ? request.context : {};
  const governance = request.governance ?? context.guard;
  if (guardRejected(governance)) {
    return failure("GOVERNANCE_REJECTED", governance?.reason ?? "code.read was rejected by runtime governance", "governance");
  }

  const targets = normalizeTargets(request, context);
  if ("ok" in targets) return targets;

  const maxBytesPerFile = normalizePositiveInteger(
    request.maxBytesPerFile ?? request.maxBytes,
    codeReadDescriptor.defaultMaxBytesPerFile,
    "INVALID_MAX_BYTES",
  );
  if (typeof maxBytesPerFile !== "number") return maxBytesPerFile;
  const maxTotalBytes = normalizePositiveInteger(request.maxTotalBytes, codeReadDescriptor.defaultMaxTotalBytes, "INVALID_MAX_BYTES");
  if (typeof maxTotalBytes !== "number") return maxTotalBytes;
  const encoding = request.encoding === undefined ? "utf8" : stringValue(request.encoding)?.trim();
  if (encoding === undefined || encoding.length === 0 || encoding.includes("\0")) {
    return failure("INVALID_ENCODING", "code.read encoding must be a safe string", "input");
  }
  const acceptedScopes = resolveAcceptedScopes(
    request.requestedScopes ?? context.requestedScopes,
    request.allowedScopes ?? context.allowedScopes,
  );
  if ("ok" in acceptedScopes) return acceptedScopes;

  return {
    toolCallId: request.toolCallId?.trim() || context.invocationId?.trim() || "code.read:dry-run",
    context: {
      ...context,
      dryRun: request.dryRun ?? context.dryRun,
      workspaceRoot: context.workspaceRoot ?? request.workspaceRoot,
    },
    targetPath: targets[0]?.targetPath ?? "",
    targets,
    range: targets[0]?.range,
    maxBytesPerFile,
    maxTotalBytes,
    encoding,
    includeLineNumbers: request.includeLineNumbers ?? false,
    acceptedScopes,
    provider: request.reader ?? request.provider,
    metadata: request.metadata ?? {},
  };
}

function applyRange(content: string, range: CodeReadRange | undefined): string {
  if (range === undefined || (range.startLine === undefined && range.endLine === undefined)) {
    return content;
  }
  const lines = content.split(/\r?\n/u);
  const start = Math.max((range.startLine ?? 1) - 1, 0);
  const end = range.endLine === undefined ? lines.length : range.endLine;
  return lines.slice(start, end).join("\n");
}

function withLineNumbers(content: string, startLine = 1): string {
  return content
    .split(/\r?\n/u)
    .map((line, index) => `${startLine + index}: ${line}`)
    .join("\n");
}

function truncateByBytes(content: string, encoding: BufferEncoding, maxBytes: number): { content: string; truncated: boolean; bytes: number } {
  const bytes = Buffer.byteLength(content, encoding);
  if (bytes <= maxBytes) {
    return { content, truncated: false, bytes };
  }
  let end = content.length;
  while (end > 0 && Buffer.byteLength(content.slice(0, end), encoding) > maxBytes) {
    end -= 1;
  }
  const truncatedContent = content.slice(0, end);
  return { content: truncatedContent, truncated: true, bytes: Buffer.byteLength(truncatedContent, encoding) };
}

function buildPlan(normalized: NormalizedReadRequest): CodeReadPlan {
  return {
    kind: "agentCore.basicTool.code.read.plan",
    operation: "read-file-or-code-content",
    targetPath: normalized.targetPath,
    targetPaths: normalized.targets.map((target) => target.targetPath),
    range: normalized.range,
    maxBytes: normalized.maxBytesPerFile,
    maxBytesPerFile: normalized.maxBytesPerFile,
    maxTotalBytes: normalized.maxTotalBytes,
    encoding: normalized.encoding,
    includeLineNumbers: normalized.includeLineNumbers,
    dispatch: normalized.context.dryRun === false ? "injected-reader" : "dry-run",
    readsFileSystemDirectly: false,
  };
}

function buildAudit(normalized: NormalizedReadRequest): CodeReadAudit {
  return {
    tool: "code.read",
    toolCallId: normalized.toolCallId,
    targetPath: normalized.targetPath,
    targetPaths: normalized.targets.map((target) => target.targetPath),
    workspaceRoot: normalized.context.workspaceRoot,
    requestedScopes: cleanList(normalized.context.requestedScopes),
    acceptedScopes: normalized.acceptedScopes,
    dryRun: normalized.context.dryRun !== false,
    unsafeSideEffects: false,
    metadata: {
      ...(normalized.context.auditMetadata ?? {}),
      ...normalized.metadata,
    },
  };
}

export async function planCodeRead(request: unknown = {}): Promise<CodeReadResult> {
  const normalized = normalizeRequest(request);
  if ("ok" in normalized) {
    return normalized;
  }
  const plan = buildPlan(normalized);
  const audit = buildAudit(normalized);
  if (plan.dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["code.read.planned"] };
  }
  if (normalized.provider === undefined) {
    return failure("READER_NOT_INJECTED", "code.read requires an injected reader when dryRun is false", "provider");
  }

  try {
    const files: CodeReadFileOutput[] = [];
    let totalBytes = 0;
    let totalTruncated = false;
    for (const target of normalized.targets) {
      const payload = await normalized.provider({
        targetPath: target.targetPath,
        range: target.range,
        maxBytes: normalized.maxBytesPerFile,
        encoding: normalized.encoding,
        context: normalized.context,
      });
      const outputEncoding = (payload.encoding ?? normalized.encoding) as BufferEncoding;
      const ranged = applyRange(payload.content, target.range);
      const lineNumbered = normalized.includeLineNumbers ? withLineNumbers(ranged, target.range?.startLine ?? 1) : ranged;
      const perFile = truncateByBytes(lineNumbered, outputEncoding, normalized.maxBytesPerFile);
      const remaining = Math.max(normalized.maxTotalBytes - totalBytes, 0);
      const totalLimited = truncateByBytes(perFile.content, outputEncoding, remaining);
      const bytes = totalLimited.bytes;
      totalBytes += bytes;
      totalTruncated ||= Boolean(payload.truncated) || perFile.truncated || totalLimited.truncated || totalBytes >= normalized.maxTotalBytes;
      files.push({
        targetPath: target.targetPath,
        content: totalLimited.content,
        encoding: outputEncoding,
        bytes,
        truncated: Boolean(payload.truncated) || perFile.truncated || totalLimited.truncated,
        range: target.range,
      });
      if (totalBytes >= normalized.maxTotalBytes) {
        break;
      }
    }

    const content = files.length === 1
      ? files[0]?.content ?? ""
      : files.map((file) => `===== ${file.targetPath} =====\n${file.content}`).join("\n");
    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.code.read.output",
        targetPath: normalized.targetPath,
        targetPaths: normalized.targets.map((target) => target.targetPath),
        content,
        files,
        encoding: normalized.encoding,
        bytes: totalBytes,
        truncated: totalTruncated,
        unsafeSideEffects: false,
      },
      events: ["code.read.injectedReaderCompleted"],
    };
  } catch (error) {
    return failure(
      "READER_REJECTED",
      error instanceof Error ? error.message : "code.read injected reader rejected the request",
      "provider",
    );
  }
}

export async function executeCodeRead(
  request: CodeReadRequest = {},
): Promise<CodeToolResult<CodeReadOutput, CodeReadErrorCode>> {
  const result = await planCodeRead(request);
  if (!result.ok) {
    return toolFailure(result.error.code, result.error.message, result.error.boundary, request.context);
  }
  if (result.output === undefined) {
    return {
      ok: true,
      toolId: "code.read",
      output: {
        kind: "agentCore.basicTool.code.read.output",
        targetPath: result.plan.targetPath,
        targetPaths: result.plan.targetPaths,
        content: "",
        files: [],
        encoding: result.plan.encoding,
        bytes: 0,
        truncated: false,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.code.read.dryRun", request.context, result.audit.metadata)],
      events: ["code.read.dryRun"],
    };
  }
  return {
    ok: true,
    toolId: "code.read",
    output: result.output,
    audit: [auditEvent("agentCore.basicTool.code.read.provider", request.context, result.audit.metadata)],
    events: result.events,
  };
}
