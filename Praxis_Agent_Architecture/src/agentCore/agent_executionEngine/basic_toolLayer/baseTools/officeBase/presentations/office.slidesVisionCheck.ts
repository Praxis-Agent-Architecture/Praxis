/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“视觉检查演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OfficeSlidesVisionCheckPermission = "filesystem:read" | "office:slides:read" | "vision:read";

export type OfficeSlidesVisionCheckErrorBoundary = "input" | "scope" | "permission" | "contract";

export type OfficeSlidesVisionCheckKind = "renderability" | "layout-overlap" | "text-legibility" | "asset-presence";

export type OfficeSlidesVisionCheckContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesVisionCheckPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesVisionCheckTarget = {
  presentationPath: string;
  checks: readonly OfficeSlidesVisionCheckKind[];
  slideNumbers: readonly number[];
  renderScale: number;
};

export type OfficeSlidesVisionCheckRequest = {
  target?: Partial<OfficeSlidesVisionCheckTarget>;
  context?: OfficeSlidesVisionCheckContext;
};

export type OfficeSlidesVisionCheckErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "INVALID_CHECK"
  | "INVALID_SLIDE_NUMBER"
  | "INVALID_RENDER_SCALE"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesVisionCheckError = {
  code: OfficeSlidesVisionCheckErrorCode;
  message: string;
  boundary: OfficeSlidesVisionCheckErrorBoundary;
  publicSafe: true;
};

export type OfficeSlidesVisionCheckAuditEvent = {
  type: string;
  toolId: "office.slidesVisionCheck";
  invocationId: string;
  dryRun: boolean;
  presentationPath?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesVisionCheckOutput = {
  kind: "agentCore.basicTool.office.slidesVisionCheck";
  target: OfficeSlidesVisionCheckTarget;
  actionPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  permissionsRequired: readonly OfficeSlidesVisionCheckPermission[];
  unsafeSideEffects: false;
  resultEnvelope: {
    findings: readonly {
      slideNumber: number;
      check: OfficeSlidesVisionCheckKind;
      severity: "info" | "warning" | "error";
      message: string;
    }[];
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type OfficeSlidesVisionCheckResult =
  | {
      ok: true;
      toolId: "office.slidesVisionCheck";
      output: OfficeSlidesVisionCheckOutput;
      audit: readonly OfficeSlidesVisionCheckAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "office.slidesVisionCheck";
      error: OfficeSlidesVisionCheckError;
      audit: readonly OfficeSlidesVisionCheckAuditEvent[];
      events: readonly string[];
    };

export const officeSlidesVisionCheckDescriptor = {
  toolId: "office.slidesVisionCheck",
  capability: "check-presentation-vision",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.presentations",
  defaultDryRun: true,
  tapOwnsApproval: true,
  unsafeSideEffects: false,
  permissionsRequired: ["filesystem:read", "office:slides:read", "vision:read"],
} as const;

const supportedChecks: readonly OfficeSlidesVisionCheckKind[] = [
  "renderability",
  "layout-overlap",
  "text-legibility",
  "asset-presence",
];

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function dryRunEnabled(context: OfficeSlidesVisionCheckContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: OfficeSlidesVisionCheckContext | undefined): string {
  return context?.invocationId?.trim() || "office.slidesVisionCheck:dry-run";
}

function normalizeRoot(root: string): string {
  const trimmed = root.trim();
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function hasPathTraversal(presentationPath: string): boolean {
  return presentationPath.split(/[\\/]+/).some((segment) => segment === "..");
}

function auditEvent(
  type: string,
  context: OfficeSlidesVisionCheckContext | undefined,
  presentationPath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): OfficeSlidesVisionCheckAuditEvent {
  return {
    type,
    toolId: officeSlidesVisionCheckDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    presentationPath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: OfficeSlidesVisionCheckErrorCode,
  message: string,
  boundary: OfficeSlidesVisionCheckErrorBoundary,
  context: OfficeSlidesVisionCheckContext | undefined,
  presentationPath?: string,
): OfficeSlidesVisionCheckResult {
  return {
    ok: false,
    toolId: officeSlidesVisionCheckDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true },
    audit: [auditEvent("agentCore.basicTool.office.slidesVisionCheck.rejected", context, presentationPath, { code })],
    events: ["basicTool.office.slidesVisionCheck.rejected"],
  };
}

function normalizePresentationPath(
  presentationPath: string | undefined,
  context: OfficeSlidesVisionCheckContext | undefined,
): string | OfficeSlidesVisionCheckResult {
  const normalized = presentationPath?.trim() ?? "";
  if (normalized.length === 0) {
    return failure(
      "MISSING_PRESENTATION_PATH",
      "office.slidesVisionCheck requires target.presentationPath",
      "input",
      context,
      presentationPath,
    );
  }

  if (hasPathTraversal(normalized)) {
    return failure(
      "SCOPE_REJECTED",
      "office.slidesVisionCheck target.presentationPath must not escape its presentation scope",
      "scope",
      context,
      normalized,
    );
  }

  return normalized;
}

function normalizeChecks(
  checks: readonly OfficeSlidesVisionCheckKind[] | undefined,
  context: OfficeSlidesVisionCheckContext | undefined,
  presentationPath: string,
): readonly OfficeSlidesVisionCheckKind[] | OfficeSlidesVisionCheckResult {
  if (checks === undefined || checks.length === 0) {
    return ["renderability", "layout-overlap", "text-legibility"];
  }

  const normalized = cleanList(checks);
  const invalid = normalized.find((check) => !supportedChecks.includes(check));
  if (invalid !== undefined) {
    return failure(
      "INVALID_CHECK",
      "office.slidesVisionCheck target.checks contains an unsupported check",
      "input",
      context,
      presentationPath,
    );
  }

  return normalized;
}

function normalizeSlideNumbers(
  slideNumbers: readonly number[] | undefined,
  context: OfficeSlidesVisionCheckContext | undefined,
  presentationPath: string,
): readonly number[] | OfficeSlidesVisionCheckResult {
  if (slideNumbers === undefined || slideNumbers.length === 0) {
    return [];
  }

  const invalid = slideNumbers.find((slideNumber) => !Number.isInteger(slideNumber) || slideNumber <= 0);
  if (invalid !== undefined) {
    return failure(
      "INVALID_SLIDE_NUMBER",
      "office.slidesVisionCheck target.slideNumbers must contain positive integers",
      "input",
      context,
      presentationPath,
    );
  }

  return [...new Set(slideNumbers)];
}

function normalizeRenderScale(
  renderScale: number | undefined,
  context: OfficeSlidesVisionCheckContext | undefined,
  presentationPath: string,
): number | OfficeSlidesVisionCheckResult {
  if (renderScale === undefined) {
    return 1;
  }

  if (Number.isFinite(renderScale) && renderScale > 0 && renderScale <= 4) {
    return renderScale;
  }

  return failure(
    "INVALID_RENDER_SCALE",
    "office.slidesVisionCheck target.renderScale must be greater than 0 and no more than 4",
    "input",
    context,
    presentationPath,
  );
}

function normalizeTarget(
  target: Partial<OfficeSlidesVisionCheckTarget> | undefined,
  context: OfficeSlidesVisionCheckContext | undefined,
): OfficeSlidesVisionCheckTarget | OfficeSlidesVisionCheckResult {
  const presentationPath = normalizePresentationPath(target?.presentationPath, context);
  if (typeof presentationPath !== "string") {
    return presentationPath;
  }

  const checks = normalizeChecks(target?.checks, context, presentationPath);
  if ("ok" in checks) {
    return checks;
  }

  const slideNumbers = normalizeSlideNumbers(target?.slideNumbers, context, presentationPath);
  if ("ok" in slideNumbers) {
    return slideNumbers;
  }

  const renderScale = normalizeRenderScale(target?.renderScale, context, presentationPath);
  if (typeof renderScale !== "number") {
    return renderScale;
  }

  return {
    presentationPath,
    checks,
    slideNumbers,
    renderScale,
  };
}

function ensureScope(
  target: OfficeSlidesVisionCheckTarget,
  context: OfficeSlidesVisionCheckContext | undefined,
): OfficeSlidesVisionCheckResult | undefined {
  const allowedRoots = cleanList(context?.allowedPresentationRoots).map(normalizeRoot);
  if (allowedRoots.length === 0) {
    return undefined;
  }

  const allowed = allowedRoots.some(
    (root) => target.presentationPath === root || target.presentationPath.startsWith(`${root}/`),
  );
  if (allowed) {
    return undefined;
  }

  return failure(
    "SCOPE_REJECTED",
    "office.slidesVisionCheck target presentation is outside the allowed presentation roots",
    "scope",
    context,
    target.presentationPath,
  );
}

function ensurePermissions(
  target: OfficeSlidesVisionCheckTarget,
  context: OfficeSlidesVisionCheckContext | undefined,
): OfficeSlidesVisionCheckResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesVisionCheckDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    `office.slidesVisionCheck is missing permissions: ${missing.join(", ")}`,
    "permission",
    context,
    target.presentationPath,
  );
}

function blockRealExecution(
  target: OfficeSlidesVisionCheckTarget,
  context: OfficeSlidesVisionCheckContext | undefined,
): OfficeSlidesVisionCheckResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "office.slidesVisionCheck only returns a guarded dry-run plan in the first implementation",
    "contract",
    context,
    target.presentationPath,
  );
}

function actionPreview(target: OfficeSlidesVisionCheckTarget): readonly string[] {
  return [
    "office.slidesVisionCheck",
    "--input",
    target.presentationPath,
    "--checks",
    target.checks.join(","),
    "--slides",
    target.slideNumbers.length === 0 ? "all" : target.slideNumbers.join(","),
    "--render-scale",
    String(target.renderScale),
  ];
}

export function planOfficeSlidesVisionCheck(
  request: OfficeSlidesVisionCheckRequest = {},
): OfficeSlidesVisionCheckResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) {
    return target;
  }

  const scopeFailure = ensureScope(target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  const permissionFailure = ensurePermissions(target, request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = blockRealExecution(target, request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  return {
    ok: true,
    toolId: officeSlidesVisionCheckDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.office.slidesVisionCheck",
      target,
      actionPreview: actionPreview(target),
      dryRun: true,
      executionBlocked: true,
      permissionsRequired: officeSlidesVisionCheckDescriptor.permissionsRequired,
      unsafeSideEffects: false,
      resultEnvelope: {
        findings: [],
        metadata: {
          vision: "not-executed",
          formatFamily: "presentation",
        },
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.office.slidesVisionCheck.dryRun", request.context, target.presentationPath, {
        checks: target.checks,
        slideNumbers: target.slideNumbers,
        renderScale: target.renderScale,
      }),
    ],
    events: ["basicTool.office.slidesVisionCheck.dryRun"],
  };
}
