/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“解码演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type OfficeSlidesDecodeBoundary = "input" | "scope" | "governance" | "permission" | "execution";

export type OfficeSlidesDecodePermission = "filesystem:read" | "office:read";

export type OfficeSlidesDecodeGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficeSlidesDecodeContext = {
  toolCallId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesDecodePermission[];
  governance?: OfficeSlidesDecodeGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesDecodeRequest = {
  presentationPath?: string;
  maxSlides?: number;
  includeSpeakerNotes?: boolean;
  includeImages?: boolean;
  context?: OfficeSlidesDecodeContext;
  decoder?: OfficeSlidesDecodeExecutor;
};

export type OfficeSlidesDecodedSlide = {
  slideNumber: number;
  title?: string;
  textBlocks: readonly string[];
  speakerNotes?: string;
  imageRefs?: readonly string[];
};

export type OfficeSlidesDecodeExecution = {
  slides: readonly OfficeSlidesDecodedSlide[];
  warnings?: readonly string[];
};

export type OfficeSlidesDecodeExecutor = (request: {
  presentationPath: string;
  maxSlides: number;
  includeSpeakerNotes: boolean;
  includeImages: boolean;
  commandPreview: readonly string[];
}) => OfficeSlidesDecodeExecution | Promise<OfficeSlidesDecodeExecution>;

export type OfficeSlidesDecodeErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "NUL_BYTE_IN_PATH"
  | "ABSOLUTE_PRESENTATION_PATH"
  | "PRESENTATION_PATH_OUTSIDE_SCOPE"
  | "INVALID_MAX_SLIDES"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "DECODER_NOT_INJECTED"
  | "DECODER_REJECTED";

export type OfficeSlidesDecodeError = {
  code: OfficeSlidesDecodeErrorCode;
  message: string;
  boundary: OfficeSlidesDecodeBoundary;
  publicSafe: true;
};

export type OfficeSlidesDecodeAudit = {
  tool: "office.slidesDecode";
  toolCallId: string;
  presentationPath?: string;
  workspaceRoot?: string;
  dryRun: boolean;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  permissionsRequired: readonly OfficeSlidesDecodePermission[];
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesDecodePlan = {
  kind: "agentCore.basicTool.office.slidesDecode.plan";
  operation: "presentation-decode";
  presentationPath: string;
  maxSlides: number;
  includeSpeakerNotes: boolean;
  includeImages: boolean;
  commandPreview: readonly string[];
  dispatch: "dry-run" | "injected-decoder";
  readsFileDirectly: false;
};

export type OfficeSlidesDecodeOutput = {
  kind: "agentCore.basicTool.office.slidesDecode.output";
  slides: readonly OfficeSlidesDecodedSlide[];
  warnings: readonly string[];
  unsafeSideEffects: false;
};

export type OfficeSlidesDecodeResult =
  | {
      ok: true;
      plan: OfficeSlidesDecodePlan;
      audit: OfficeSlidesDecodeAudit;
      output?: OfficeSlidesDecodeOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficeSlidesDecodeError;
      audit: OfficeSlidesDecodeAudit;
      events: readonly string[];
    };

export const officeSlidesDecodeDescriptor = {
  tool: "office.slidesDecode",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.presentations",
  purpose: "plan a governed presentation decode through an injected decoder envelope",
  permissionsRequired: ["filesystem:read", "office:read"],
  defaultDispatch: "dry-run",
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: OfficeSlidesDecodeContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditFor(
  context: OfficeSlidesDecodeContext | undefined,
  presentationPath: string | undefined,
  acceptedScopes: readonly string[] = [],
): OfficeSlidesDecodeAudit {
  return {
    tool: "office.slidesDecode",
    toolCallId: context?.toolCallId?.trim() || "office.slidesDecode:dry-run",
    presentationPath,
    workspaceRoot: context?.workspaceRoot?.trim() || undefined,
    dryRun: dryRunEnabled(context),
    requestedScopes: cleanList(context?.requestedScopes),
    acceptedScopes,
    permissionsRequired: officeSlidesDecodeDescriptor.permissionsRequired,
    unsafeSideEffects: false,
    metadata: context?.auditMetadata ?? {},
  };
}

function failure(
  code: OfficeSlidesDecodeErrorCode,
  message: string,
  boundary: OfficeSlidesDecodeBoundary,
  context: OfficeSlidesDecodeContext | undefined,
  presentationPath?: string,
): OfficeSlidesDecodeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    audit: auditFor(context, presentationPath),
    events: ["office.slidesDecode.rejected"],
  };
}

function normalizePresentationPath(
  presentationPath: string | undefined,
  context: OfficeSlidesDecodeContext | undefined,
): string | OfficeSlidesDecodeResult {
  const rawPath = presentationPath?.trim() ?? "";
  if (rawPath.length === 0) {
    return failure("MISSING_PRESENTATION_PATH", "office.slidesDecode requires presentationPath", "input", context, presentationPath);
  }

  if (rawPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", "office.slidesDecode presentationPath cannot contain NUL bytes", "input", context);
  }

  const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    return failure(
      "ABSOLUTE_PRESENTATION_PATH",
      "office.slidesDecode only accepts workspace-relative presentationPath",
      "scope",
      context,
      normalized,
    );
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "PRESENTATION_PATH_OUTSIDE_SCOPE",
      "office.slidesDecode presentationPath must stay inside workspace scope",
      "scope",
      context,
      normalized,
    );
  }

  const allowedRoots = cleanList(context?.allowedPresentationRoots).map((root) => path.posix.normalize(root.replaceAll("\\", "/")));
  if (allowedRoots.length > 0) {
    const inScope = allowedRoots.some((root) => root === "." || normalized === root || normalized.startsWith(`${root}/`));
    if (!inScope) {
      return failure(
        "PRESENTATION_PATH_OUTSIDE_SCOPE",
        "office.slidesDecode presentationPath is outside allowed presentation roots",
        "scope",
        context,
        normalized,
      );
    }
  }

  return normalized;
}

function normalizeMaxSlides(maxSlides: number | undefined, context: OfficeSlidesDecodeContext | undefined): number | OfficeSlidesDecodeResult {
  const resolved = maxSlides ?? 30;
  if (!Number.isInteger(resolved) || resolved < 1) {
    return failure("INVALID_MAX_SLIDES", "office.slidesDecode maxSlides must be a positive integer", "input", context);
  }

  return resolved;
}

function resolveScopes(context: OfficeSlidesDecodeContext | undefined): readonly string[] | OfficeSlidesDecodeResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.slidesDecode scope ${denied[0]} is outside runtime governance`, "scope", context);
  }

  return requested;
}

function ensurePermissions(context: OfficeSlidesDecodeContext | undefined, presentationPath: string): OfficeSlidesDecodeResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesDecodeDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `office.slidesDecode is missing permissions: ${missing.join(", ")}`,
      "permission",
      context,
      presentationPath,
    );
  }

  return undefined;
}

function buildCommandPreview(request: {
  presentationPath: string;
  maxSlides: number;
  includeSpeakerNotes: boolean;
  includeImages: boolean;
}): readonly string[] {
  return [
    "office-slides-decode",
    "--max-slides",
    String(request.maxSlides),
    ...(request.includeSpeakerNotes ? ["--speaker-notes"] : []),
    ...(request.includeImages ? ["--images"] : []),
    "--",
    request.presentationPath,
  ];
}

export async function planOfficeSlidesDecode(request: OfficeSlidesDecodeRequest = {}): Promise<OfficeSlidesDecodeResult> {
  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.slidesDecode was rejected by runtime governance",
      "governance",
      request.context,
    );
  }

  const presentationPath = normalizePresentationPath(request.presentationPath, request.context);
  if (typeof presentationPath !== "string") {
    return presentationPath;
  }

  const maxSlides = normalizeMaxSlides(request.maxSlides, request.context);
  if (typeof maxSlides !== "number") {
    return maxSlides;
  }

  const acceptedScopes = resolveScopes(request.context);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const permissionFailure = ensurePermissions(request.context, presentationPath);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const dispatch = dryRunEnabled(request.context) ? "dry-run" : "injected-decoder";
  if (dispatch === "injected-decoder" && request.decoder === undefined) {
    return failure(
      "DECODER_NOT_INJECTED",
      "office.slidesDecode requires an injected decoder when dryRun is false",
      "execution",
      request.context,
      presentationPath,
    );
  }

  const includeSpeakerNotes = request.includeSpeakerNotes === true;
  const includeImages = request.includeImages === true;
  const commandPreview = buildCommandPreview({ presentationPath, maxSlides, includeSpeakerNotes, includeImages });
  const plan: OfficeSlidesDecodePlan = {
    kind: "agentCore.basicTool.office.slidesDecode.plan",
    operation: "presentation-decode",
    presentationPath,
    maxSlides,
    includeSpeakerNotes,
    includeImages,
    commandPreview,
    dispatch,
    readsFileDirectly: false,
  };
  const audit = auditFor(request.context, presentationPath, acceptedScopes);

  if (dispatch === "dry-run") {
    return { ok: true, plan, audit, events: ["office.slidesDecode.planned"] };
  }

  try {
    const execution = await request.decoder?.({ presentationPath, maxSlides, includeSpeakerNotes, includeImages, commandPreview });
    if (execution === undefined) {
      return failure("DECODER_REJECTED", "office.slidesDecode decoder returned no envelope", "execution", request.context, presentationPath);
    }

    return {
      ok: true,
      plan,
      audit,
      output: {
        kind: "agentCore.basicTool.office.slidesDecode.output",
        slides: execution.slides.slice(0, maxSlides),
        warnings: execution.warnings ?? [],
        unsafeSideEffects: false,
      },
      events: ["office.slidesDecode.injectedDecoderCompleted"],
    };
  } catch (error) {
    return failure(
      "DECODER_REJECTED",
      error instanceof Error ? error.message : "office.slidesDecode decoder rejected the request",
      "execution",
      request.context,
      presentationPath,
    );
  }
}
