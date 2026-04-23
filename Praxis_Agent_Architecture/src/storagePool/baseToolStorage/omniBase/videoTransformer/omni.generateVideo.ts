/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 视频转换工具。
 * 核心目的：提供 多模态基础工具 / 视频转换工具 中的“生成视频”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OmniGenerateVideoPermission = "provider:invoke" | "filesystem:write" | "omni:video:generate";

export type OmniGenerateVideoBoundary = "input" | "scope" | "permission" | "contract" | "governance";

export type OmniGenerateVideoGate = {
  accepted: boolean;
  reason?: string;
};

export type OmniGenerateVideoAspectRatio = "16:9" | "9:16" | "1:1" | "4:3";

export type OmniGenerateVideoResolution = "480p" | "720p" | "1080p";

export type OmniGenerateVideoTarget = {
  prompt: string;
  outputPath?: string;
  durationSeconds?: number;
  aspectRatio?: OmniGenerateVideoAspectRatio;
  resolution?: OmniGenerateVideoResolution;
  modelHint?: string;
  seed?: number;
};

export type OmniGenerateVideoContext = {
  invocationId?: string;
  dryRun?: boolean;
  allowedOutputRoots?: readonly string[];
  grantedPermissions?: readonly OmniGenerateVideoPermission[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OmniGenerateVideoGate;
  governance?: OmniGenerateVideoGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OmniGenerateVideoRequest = {
  target?: Partial<OmniGenerateVideoTarget>;
  context?: OmniGenerateVideoContext;
};

export type OmniGenerateVideoErrorCode =
  | "MISSING_PROMPT"
  | "OUTPUT_PATH_OUT_OF_SCOPE"
  | "INVALID_DURATION"
  | "INVALID_ASPECT_RATIO"
  | "INVALID_RESOLUTION"
  | "INVALID_SEED"
  | "PERMISSION_DENIED"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type OmniGenerateVideoError = {
  code: OmniGenerateVideoErrorCode;
  message: string;
  boundary: OmniGenerateVideoBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type OmniGenerateVideoAuditEvent = {
  type: string;
  toolId: "omni.generateVideo";
  invocationId: string;
  dryRun: true;
  outputPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniGenerateVideoOutput = {
  kind: "agentCore.basicTool.omni.generateVideo";
  target: OmniGenerateVideoTarget;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
  permissionsRequired: readonly OmniGenerateVideoPermission[];
  requiresTapApproval: true;
  generationEnvelope: {
    providerInvoked: false;
    outputWritten: false;
    plannedAsset: "video";
  };
};

export type OmniGenerateVideoResult =
  | {
      ok: true;
      toolId: "omni.generateVideo";
      output: OmniGenerateVideoOutput;
      audit: readonly OmniGenerateVideoAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "omni.generateVideo";
      error: OmniGenerateVideoError;
      audit: readonly OmniGenerateVideoAuditEvent[];
      events: readonly string[];
    };

export const omniGenerateVideoDescriptor = {
  toolId: "omni.generateVideo",
  capability: "generate-video",
  route: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["provider:invoke", "filesystem:write", "omni:video:generate"],
} as const;

function cleanList<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function invocationId(context: OmniGenerateVideoContext | undefined): string {
  return context?.invocationId?.trim() || "omni.generateVideo:dry-run";
}

function auditEvent(
  type: string,
  context: OmniGenerateVideoContext | undefined,
  outputPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OmniGenerateVideoAuditEvent {
  return {
    type,
    toolId: omniGenerateVideoDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: true,
    outputPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OmniGenerateVideoErrorCode,
  message: string,
  boundary: OmniGenerateVideoBoundary,
  context: OmniGenerateVideoContext | undefined,
  outputPath?: string,
): OmniGenerateVideoResult {
  return {
    ok: false,
    toolId: omniGenerateVideoDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.omni.generateVideo.rejected", context, outputPath, { code })],
    events: ["basicTool.omni.generateVideo.rejected"],
  };
}

function normalizePath(value: string | undefined): string | undefined {
  const raw = value?.trim() ?? "";
  if (raw.length === 0 || raw.includes("\0")) {
    return undefined;
  }

  const absolute = raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw);
  const normalized = raw.replaceAll("\\", "/").replace(/\/+/g, "/");
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    return undefined;
  }

  return `${absolute ? "/" : ""}${parts.join("/")}`;
}

function normalizeRoot(root: string): string {
  const normalized = normalizePath(root) ?? root.trim().replaceAll("\\", "/");
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
}

function ensureOutputScope(
  outputPath: string | undefined,
  context: OmniGenerateVideoContext | undefined,
): OmniGenerateVideoResult | undefined {
  if (outputPath === undefined) {
    return undefined;
  }

  const roots = cleanList(context?.allowedOutputRoots).map(normalizeRoot);
  if (roots.length === 0) {
    return undefined;
  }

  const allowed = roots.some((root) => outputPath === root || outputPath.startsWith(`${root}/`));
  if (allowed) {
    return undefined;
  }

  return failure(
    "OUTPUT_PATH_OUT_OF_SCOPE",
    "omni.generateVideo outputPath must stay inside the declared output roots",
    "scope",
    context,
    outputPath,
  );
}

function ensurePermissions(
  outputPath: string | undefined,
  context: OmniGenerateVideoContext | undefined,
): OmniGenerateVideoResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = omniGenerateVideoDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure("PERMISSION_DENIED", `omni.generateVideo is missing permission: ${missing[0]}`, "permission", context, outputPath);
}

function ensureScopes(outputPath: string | undefined, context: OmniGenerateVideoContext | undefined): OmniGenerateVideoResult | undefined {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (requested.length === 0 || denied.length === 0) {
    return undefined;
  }

  return failure("SCOPE_DENIED", `omni.generateVideo scope ${denied[0]} is outside runtime governance`, "scope", context, outputPath);
}

function normalizeAspectRatio(
  value: string | undefined,
  context: OmniGenerateVideoContext | undefined,
  outputPath: string | undefined,
): OmniGenerateVideoAspectRatio | OmniGenerateVideoResult {
  if (value === undefined || value.trim() === "") {
    return "16:9";
  }

  if (value === "16:9" || value === "9:16" || value === "1:1" || value === "4:3") {
    return value;
  }

  return failure("INVALID_ASPECT_RATIO", "omni.generateVideo aspectRatio is not supported by the base primitive", "input", context, outputPath);
}

function normalizeResolution(
  value: string | undefined,
  context: OmniGenerateVideoContext | undefined,
  outputPath: string | undefined,
): OmniGenerateVideoResolution | OmniGenerateVideoResult {
  if (value === undefined || value.trim() === "") {
    return "720p";
  }

  if (value === "480p" || value === "720p" || value === "1080p") {
    return value;
  }

  return failure("INVALID_RESOLUTION", "omni.generateVideo resolution must be 480p, 720p, or 1080p", "input", context, outputPath);
}

function ensurePositiveInteger(
  value: number | undefined,
  code: "INVALID_DURATION" | "INVALID_SEED",
  message: string,
  context: OmniGenerateVideoContext | undefined,
  outputPath: string | undefined,
): number | undefined | OmniGenerateVideoResult {
  if (value === undefined) {
    return undefined;
  }

  if (Number.isInteger(value) && value >= 0) {
    return value;
  }

  return failure(code, message, "input", context, outputPath);
}

function ensureGates(outputPath: string | undefined, context: OmniGenerateVideoContext | undefined): OmniGenerateVideoResult | undefined {
  if (context?.dryRun === false) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "first-round omni.generateVideo does not invoke providers or write files",
      "contract",
      context,
      outputPath,
    );
  }

  if (context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      context.contract.reason ?? "omni.generateVideo was rejected by runtime contract surface",
      "contract",
      context,
      outputPath,
    );
  }

  if (context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      context.governance.reason ?? "omni.generateVideo was rejected by runtime governance",
      "governance",
      context,
      outputPath,
    );
  }

  return undefined;
}

export function planOmniGenerateVideo(request: OmniGenerateVideoRequest = {}): OmniGenerateVideoResult {
  const prompt = request.target?.prompt?.trim() ?? "";
  if (prompt.length === 0) {
    return failure("MISSING_PROMPT", "omni.generateVideo requires target.prompt", "input", request.context);
  }

  const outputPath = normalizePath(request.target?.outputPath);
  const durationSeconds = ensurePositiveInteger(
    request.target?.durationSeconds,
    "INVALID_DURATION",
    "omni.generateVideo durationSeconds must be a non-negative integer",
    request.context,
    outputPath,
  );
  if (typeof durationSeconds === "object") {
    return durationSeconds;
  }

  const seed = ensurePositiveInteger(
    request.target?.seed,
    "INVALID_SEED",
    "omni.generateVideo seed must be a non-negative integer",
    request.context,
    outputPath,
  );
  if (typeof seed === "object") {
    return seed;
  }

  const aspectRatio = normalizeAspectRatio(request.target?.aspectRatio, request.context, outputPath);
  if (typeof aspectRatio !== "string") {
    return aspectRatio;
  }

  const resolution = normalizeResolution(request.target?.resolution, request.context, outputPath);
  if (typeof resolution !== "string") {
    return resolution;
  }

  const outputScope = ensureOutputScope(outputPath, request.context);
  if (outputScope !== undefined) {
    return outputScope;
  }

  const permissions = ensurePermissions(outputPath, request.context);
  if (permissions !== undefined) {
    return permissions;
  }

  const scopes = ensureScopes(outputPath, request.context);
  if (scopes !== undefined) {
    return scopes;
  }

  const gates = ensureGates(outputPath, request.context);
  if (gates !== undefined) {
    return gates;
  }

  const target: OmniGenerateVideoTarget = {
    prompt,
    outputPath,
    durationSeconds: durationSeconds ?? 5,
    aspectRatio,
    resolution,
    modelHint: request.target?.modelHint?.trim() || undefined,
    seed,
  };

  return {
    ok: true,
    toolId: omniGenerateVideoDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.omni.generateVideo",
      target,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      permissionsRequired: omniGenerateVideoDescriptor.permissionsRequired,
      requiresTapApproval: true,
      generationEnvelope: {
        providerInvoked: false,
        outputWritten: false,
        plannedAsset: "video",
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.omni.generateVideo.dryRun", request.context, outputPath, {
        promptLength: prompt.length,
        durationSeconds: target.durationSeconds,
        aspectRatio,
        resolution,
      }),
    ],
    events: ["basicTool.omni.generateVideo.dryRun"],
  };
}
