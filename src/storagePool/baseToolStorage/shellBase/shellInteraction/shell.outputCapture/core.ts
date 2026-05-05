/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 交互。
 * 核心目的：提供 Shell 基础工具 / Shell 交互 中的“捕获输出”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import { jsonRecord, optionalStringArray, stringList, stringValue, trimmedString } from "../_shared/jsonBoundary.js";

export type ShellOutputCapturePermission = "shell:output:capture";

export type ShellOutputCaptureBoundary = "input" | "permission" | "scope" | "resource" | "contract";

export type ShellOutputStream = "stdout" | "stderr" | "combined";

export type ShellOutputCaptureContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellOutputCapturePermission[];
  allowedSessionIds?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellOutputChunk = {
  stream: ShellOutputStream;
  text: string;
  receivedAtMs?: number;
};

export type ShellOutputCaptureTarget = {
  sessionId: string;
  streams?: readonly ShellOutputStream[];
  maxBytes?: number;
  chunks?: readonly ShellOutputChunk[];
  redactionPatterns?: readonly string[];
};

export type ShellOutputCaptureRequest = {
  target?: Partial<ShellOutputCaptureTarget>;
  context?: ShellOutputCaptureContext;
};

export type ShellOutputCaptureErrorCode =
  | "MISSING_SESSION_ID"
  | "INVALID_STREAM"
  | "INVALID_CHUNK"
  | "INVALID_MAX_BYTES"
  | "INVALID_REDACTION_PATTERN"
  | "PERMISSION_DENIED"
  | "SCOPE_REJECTED"
  | "REAL_CAPTURE_BLOCKED";

export type ShellOutputCaptureError = {
  code: ShellOutputCaptureErrorCode;
  message: string;
  boundary: ShellOutputCaptureBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellOutputCaptureAuditEvent = {
  type: string;
  toolId: "shell.outputCapture";
  invocationId: string;
  dryRun: boolean;
  sessionId?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellCapturedOutputChunk = {
  stream: ShellOutputStream;
  text: string;
  bytes: number;
  receivedAtMs?: number;
};

export type ShellOutputCaptureOutput = {
  kind: "agentCore.basicTool.shell.outputCapture";
  sessionId: string;
  streams: readonly ShellOutputStream[];
  chunks: readonly ShellCapturedOutputChunk[];
  totalBytes: number;
  truncated: boolean;
  requiredPermission: ShellOutputCapturePermission;
  dryRun: boolean;
  realBufferReadBlocked: boolean;
  unsafeSideEffects: false;
};

export type ShellOutputCaptureResult =
  | {
      ok: true;
      toolId: "shell.outputCapture";
      output: ShellOutputCaptureOutput;
      audit: readonly ShellOutputCaptureAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.outputCapture";
      error: ShellOutputCaptureError;
      audit: readonly ShellOutputCaptureAuditEvent[];
      events: readonly string[];
    };

export const shellOutputCaptureDescriptor = {
  toolId: "shell.outputCapture",
  capability: "shell-output-capture",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellInteraction",
  defaultDryRun: true,
  defaultStreams: ["stdout", "stderr"],
  defaultMaxBytes: 64_000,
  requiredPermission: "shell:output:capture",
  tapOwnsApproval: true,
  unsafeSideEffects: false,
} as const;

const maxCaptureBytes = 1_048_576;
const validStreams = new Set<ShellOutputStream>(["stdout", "stderr", "combined"]);

function cleanStringList<T extends string>(values: unknown): readonly T[] {
  return stringList(values) as readonly T[];
}

function dryRunEnabled(context: ShellOutputCaptureContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellOutputCaptureContext | undefined): string {
  return trimmedString(jsonRecord(context)?.invocationId) ?? "shell.outputCapture:dry-run";
}

function auditEvent(
  type: string,
  context: ShellOutputCaptureContext | undefined,
  sessionId: string | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellOutputCaptureAuditEvent {
  return {
    type,
    toolId: shellOutputCaptureDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    sessionId,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellOutputCaptureErrorCode,
  message: string,
  boundary: ShellOutputCaptureBoundary,
  context: ShellOutputCaptureContext | undefined,
  sessionId?: string,
): ShellOutputCaptureResult {
  return {
    ok: false,
    toolId: shellOutputCaptureDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.outputCapture.rejected", context, sessionId, { code })],
    events: ["basicTool.shell.outputCapture.rejected"],
  };
}

function ensureDryRunOnly(
  context: ShellOutputCaptureContext | undefined,
  sessionId: string | undefined,
): ShellOutputCaptureResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_CAPTURE_BLOCKED",
    "shell.outputCapture only captures supplied output chunks in the first implementation",
    "contract",
    context,
    sessionId,
  );
}

function ensurePermission(
  context: ShellOutputCaptureContext | undefined,
  sessionId: string | undefined,
): ShellOutputCaptureResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  if (cleanStringList(context.grantedPermissions).includes(shellOutputCaptureDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.outputCapture is missing permission: shell:output:capture",
    "permission",
    context,
    sessionId,
  );
}

function normalizeStreams(
  streams: unknown,
  context: ShellOutputCaptureContext | undefined,
  sessionId: string,
): readonly ShellOutputStream[] | ShellOutputCaptureResult {
  const normalized = cleanStringList(streams ?? shellOutputCaptureDescriptor.defaultStreams);
  if (normalized.length === 0 || normalized.some((stream) => !validStreams.has(stream as ShellOutputStream))) {
    return failure("INVALID_STREAM", "shell.outputCapture streams must be stdout, stderr, or combined", "input", context, sessionId);
  }

  return normalized as readonly ShellOutputStream[];
}

function normalizeChunks(
  chunks: unknown,
  context: ShellOutputCaptureContext | undefined,
  sessionId: string,
): readonly ShellOutputChunk[] | ShellOutputCaptureResult {
  const normalized = chunks === undefined ? [] : Array.isArray(chunks) ? chunks : undefined;
  if (normalized === undefined) {
    return failure("INVALID_CHUNK", "shell.outputCapture chunks must be an array", "input", context, sessionId);
  }

  const output: ShellOutputChunk[] = [];
  for (const rawChunk of normalized) {
    const chunk = jsonRecord(rawChunk);
    const stream = stringValue(chunk?.stream) as ShellOutputStream | undefined;
    const text = stringValue(chunk?.text);
    if (stream === undefined || !validStreams.has(stream) || text === undefined || text.includes("\0")) {
      return failure("INVALID_CHUNK", "shell.outputCapture chunks must contain safe stream text", "input", context, sessionId);
    }

    const receivedAtMs = chunk?.receivedAtMs;
    if (receivedAtMs !== undefined && (typeof receivedAtMs !== "number" || !Number.isFinite(receivedAtMs) || receivedAtMs < 0)) {
      return failure("INVALID_CHUNK", "shell.outputCapture chunk receivedAtMs must be non-negative", "input", context, sessionId);
    }
    output.push({ stream, text, receivedAtMs });
  }

  return output;
}

function compileRedactions(
  patterns: unknown,
  context: ShellOutputCaptureContext | undefined,
  sessionId: string,
): readonly RegExp[] | ShellOutputCaptureResult {
  const normalized = optionalStringArray(patterns);
  if (!normalized.ok) {
    return failure("INVALID_REDACTION_PATTERN", "shell.outputCapture redactionPatterns must be a string array", "input", context, sessionId);
  }

  const compiled: RegExp[] = [];
  for (const pattern of normalized.values) {
    try {
      compiled.push(new RegExp(pattern, "g"));
    } catch {
      return failure("INVALID_REDACTION_PATTERN", "shell.outputCapture redactionPatterns must be valid regex strings", "input", context, sessionId);
    }
  }

  return compiled;
}

function applyRedactions(text: string, patterns: readonly RegExp[]): string {
  return patterns.reduce((current, pattern) => current.replace(pattern, "[redacted]"), text);
}

function captureChunks(
  chunks: readonly ShellOutputChunk[],
  streams: readonly ShellOutputStream[],
  maxBytes: number,
  redactions: readonly RegExp[],
): { chunks: readonly ShellCapturedOutputChunk[]; totalBytes: number; truncated: boolean } {
  const captured: ShellCapturedOutputChunk[] = [];
  let totalBytes = 0;
  let truncated = false;

  for (const chunk of chunks) {
    if (!streams.includes(chunk.stream)) {
      continue;
    }

    const redacted = applyRedactions(chunk.text, redactions);
    const bytes = Buffer.byteLength(redacted);
    const remaining = maxBytes - totalBytes;
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    const text = bytes <= remaining ? redacted : Buffer.from(redacted).subarray(0, remaining).toString("utf8");
    const capturedBytes = Buffer.byteLength(text);
    captured.push({ stream: chunk.stream, text, bytes: capturedBytes, receivedAtMs: chunk.receivedAtMs });
    totalBytes += capturedBytes;

    if (bytes > remaining) {
      truncated = true;
      break;
    }
  }

  return { chunks: captured, totalBytes, truncated };
}

export function captureShellOutput(
  request: ShellOutputCaptureRequest = {},
): ShellOutputCaptureResult {
  const requestRecord = jsonRecord(request) ?? {};
  const context = jsonRecord(requestRecord.context) as ShellOutputCaptureContext | undefined;
  const target = jsonRecord(requestRecord.target);
  const sessionId = trimmedString(target?.sessionId);
  const dryRunFailure = ensureDryRunOnly(context, sessionId);
  if (dryRunFailure !== undefined) {
    return dryRunFailure;
  }

  const permissionFailure = ensurePermission(context, sessionId);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  if (sessionId === undefined) {
    return failure("MISSING_SESSION_ID", "shell.outputCapture requires target.sessionId", "input", context);
  }

  const allowedSessionIds = optionalStringArray(context?.allowedSessionIds, { trim: true });
  if (!allowedSessionIds.ok) {
    return failure("SCOPE_REJECTED", "shell.outputCapture allowedSessionIds must be a string array", "scope", context, sessionId);
  }

  if (context?.allowedSessionIds !== undefined && !allowedSessionIds.values.includes(sessionId)) {
    return failure("SCOPE_REJECTED", "shell.outputCapture sessionId is outside allowed capture scope", "scope", context, sessionId);
  }

  const streams = normalizeStreams(target?.streams, context, sessionId);
  if ("ok" in streams) {
    return streams;
  }

  const chunks = normalizeChunks(target?.chunks, context, sessionId);
  if ("ok" in chunks) {
    return chunks;
  }

  const maxBytes = target?.maxBytes === undefined ? shellOutputCaptureDescriptor.defaultMaxBytes : target.maxBytes;
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > maxCaptureBytes) {
    return failure(
      "INVALID_MAX_BYTES",
      "shell.outputCapture maxBytes must be between 1 and 1048576",
      "resource",
      context,
      sessionId,
    );
  }

  const redactions = compileRedactions(target?.redactionPatterns, context, sessionId);
  if ("ok" in redactions) {
    return redactions;
  }

  const captured = captureChunks(chunks, streams, maxBytes, redactions);

  return {
    ok: true,
    toolId: shellOutputCaptureDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.outputCapture",
      sessionId,
      streams,
      chunks: captured.chunks,
      totalBytes: captured.totalBytes,
      truncated: captured.truncated,
      requiredPermission: shellOutputCaptureDescriptor.requiredPermission,
      dryRun: true,
      realBufferReadBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.outputCapture.dryRun", context, sessionId, {
        chunkCount: captured.chunks.length,
        totalBytes: captured.totalBytes,
        truncated: captured.truncated,
      }),
    ],
    events: [captured.truncated ? "basicTool.shell.outputCapture.truncated" : "basicTool.shell.outputCapture.captured"],
  };
}
