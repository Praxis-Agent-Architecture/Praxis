/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 办公文档基础工具 / 演示文稿工具。
 * 核心目的：提供 办公文档基础工具 / 演示文稿工具 中的“编辑演示文稿”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";

export type OfficeSlidesEditBoundary = "input" | "scope" | "governance" | "permission" | "contract";

export type OfficeSlidesEditPermission = "filesystem:read" | "filesystem:write" | "office:read" | "office:write";

export type OfficeSlidesEditGate = {
  accepted: boolean;
  reason?: string;
};

export type OfficeSlidesEditContext = {
  toolCallId?: string;
  workspaceRoot?: string;
  dryRun?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  allowedPresentationRoots?: readonly string[];
  grantedPermissions?: readonly OfficeSlidesEditPermission[];
  governance?: OfficeSlidesEditGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesEditOperationKind =
  | "set-text"
  | "insert-slide"
  | "delete-slide"
  | "replace-image"
  | "set-speaker-notes";

export type OfficeSlidesEditOperation = {
  kind: OfficeSlidesEditOperationKind;
  slideNumber?: number;
  target?: string;
  value?: string;
};

export type OfficeSlidesEditRequest = {
  presentationPath?: string;
  outputPath?: string;
  operations?: readonly OfficeSlidesEditOperation[];
  context?: OfficeSlidesEditContext;
};

export type OfficeSlidesEditErrorCode =
  | "MISSING_PRESENTATION_PATH"
  | "MISSING_OPERATIONS"
  | "INVALID_OPERATION"
  | "NUL_BYTE_IN_PATH"
  | "ABSOLUTE_PRESENTATION_PATH"
  | "PRESENTATION_PATH_OUTSIDE_SCOPE"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "GOVERNANCE_REJECTED"
  | "REAL_EXECUTION_BLOCKED";

export type OfficeSlidesEditError = {
  code: OfficeSlidesEditErrorCode;
  message: string;
  boundary: OfficeSlidesEditBoundary;
  publicSafe: true;
};

export type OfficeSlidesEditAudit = {
  tool: "office.slidesEdit";
  toolCallId: string;
  presentationPath?: string;
  outputPath?: string;
  workspaceRoot?: string;
  dryRun: boolean;
  requestedScopes: readonly string[];
  acceptedScopes: readonly string[];
  permissionsRequired: readonly OfficeSlidesEditPermission[];
  unsafeSideEffects: true;
  metadata: Readonly<Record<string, unknown>>;
};

export type OfficeSlidesEditPlan = {
  kind: "agentCore.basicTool.office.slidesEdit.plan";
  operation: "presentation-edit";
  presentationPath: string;
  outputPath?: string;
  operations: readonly OfficeSlidesEditOperation[];
  commandPreview: readonly string[];
  dryRun: true;
  executionBlocked: true;
  writesFile: true;
  tapOwnsApproval: true;
};

export type OfficeSlidesEditResult =
  | {
      ok: true;
      plan: OfficeSlidesEditPlan;
      audit: OfficeSlidesEditAudit;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OfficeSlidesEditError;
      audit: OfficeSlidesEditAudit;
      events: readonly string[];
    };

export const officeSlidesEditDescriptor = {
  tool: "office.slidesEdit",
  route: "agent_executionEngine.basic_toolLayer.baseTools.officeBase.presentations",
  purpose: "plan a governed presentation edit while blocking real file writes in the first implementation",
  permissionsRequired: ["filesystem:read", "filesystem:write", "office:read", "office:write"],
  defaultDispatch: "dry-run",
  unsafeSideEffects: true,
  tapOwnsApproval: true,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function dryRunEnabled(context: OfficeSlidesEditContext | undefined): boolean {
  return context?.dryRun !== false;
}

function auditFor(
  context: OfficeSlidesEditContext | undefined,
  presentationPath: string | undefined,
  outputPath: string | undefined,
  acceptedScopes: readonly string[] = [],
): OfficeSlidesEditAudit {
  return {
    tool: "office.slidesEdit",
    toolCallId: context?.toolCallId?.trim() || "office.slidesEdit:dry-run",
    presentationPath,
    outputPath,
    workspaceRoot: context?.workspaceRoot?.trim() || undefined,
    dryRun: dryRunEnabled(context),
    requestedScopes: cleanList(context?.requestedScopes),
    acceptedScopes,
    permissionsRequired: officeSlidesEditDescriptor.permissionsRequired,
    unsafeSideEffects: true,
    metadata: context?.auditMetadata ?? {},
  };
}

function failure(
  code: OfficeSlidesEditErrorCode,
  message: string,
  boundary: OfficeSlidesEditBoundary,
  context: OfficeSlidesEditContext | undefined,
  presentationPath?: string,
  outputPath?: string,
): OfficeSlidesEditResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    audit: auditFor(context, presentationPath, outputPath),
    events: ["office.slidesEdit.rejected"],
  };
}

function normalizeScopedPath(
  value: string | undefined,
  fieldName: "presentationPath" | "outputPath",
  context: OfficeSlidesEditContext | undefined,
): string | OfficeSlidesEditResult | undefined {
  const rawPath = value?.trim() ?? "";
  if (rawPath.length === 0) {
    if (fieldName === "presentationPath") {
      return failure("MISSING_PRESENTATION_PATH", "office.slidesEdit requires presentationPath", "input", context, value);
    }

    return undefined;
  }

  if (rawPath.includes("\0")) {
    return failure("NUL_BYTE_IN_PATH", `office.slidesEdit ${fieldName} cannot contain NUL bytes`, "input", context);
  }

  const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    return failure(
      "ABSOLUTE_PRESENTATION_PATH",
      `office.slidesEdit only accepts workspace-relative ${fieldName}`,
      "scope",
      context,
      normalized,
    );
  }

  if (normalized === ".." || normalized.startsWith("../")) {
    return failure(
      "PRESENTATION_PATH_OUTSIDE_SCOPE",
      `office.slidesEdit ${fieldName} must stay inside workspace scope`,
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
        `office.slidesEdit ${fieldName} is outside allowed presentation roots`,
        "scope",
        context,
        normalized,
      );
    }
  }

  return normalized;
}

function normalizeOperations(
  operations: readonly OfficeSlidesEditOperation[] | undefined,
  context: OfficeSlidesEditContext | undefined,
): readonly OfficeSlidesEditOperation[] | OfficeSlidesEditResult {
  if (operations === undefined || operations.length === 0) {
    return failure("MISSING_OPERATIONS", "office.slidesEdit requires at least one edit operation", "input", context);
  }

  const normalized = operations.map((operation) => ({
    ...operation,
    target: operation.target?.trim() || undefined,
    value: operation.value?.trim() || undefined,
  }));
  const invalid = normalized.some((operation) => {
    const knownKind =
      operation.kind === "set-text" ||
      operation.kind === "insert-slide" ||
      operation.kind === "delete-slide" ||
      operation.kind === "replace-image" ||
      operation.kind === "set-speaker-notes";
    const validSlide = operation.slideNumber === undefined || (Number.isInteger(operation.slideNumber) && operation.slideNumber >= 1);
    return !knownKind || !validSlide;
  });

  if (invalid) {
    return failure("INVALID_OPERATION", "office.slidesEdit operations must use known kinds and positive slide numbers", "input", context);
  }

  return normalized;
}

function resolveScopes(context: OfficeSlidesEditContext | undefined): readonly string[] | OfficeSlidesEditResult {
  const requested = cleanList(context?.requestedScopes);
  const allowed = cleanList(context?.allowedScopes);
  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `office.slidesEdit scope ${denied[0]} is outside runtime governance`, "scope", context);
  }

  return requested;
}

function ensurePermissions(
  context: OfficeSlidesEditContext | undefined,
  presentationPath: string,
  outputPath: string | undefined,
): OfficeSlidesEditResult | undefined {
  const granted = cleanList(context?.grantedPermissions);
  if (granted.length === 0) {
    return undefined;
  }

  const missing = officeSlidesEditDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `office.slidesEdit is missing permissions: ${missing.join(", ")}`,
      "permission",
      context,
      presentationPath,
      outputPath,
    );
  }

  return undefined;
}

function buildCommandPreview(request: {
  presentationPath: string;
  outputPath?: string;
  operationCount: number;
}): readonly string[] {
  return [
    "office-slides-edit",
    "--dry-run",
    "--operation-count",
    String(request.operationCount),
    "--input",
    request.presentationPath,
    ...(request.outputPath === undefined ? [] : ["--output", request.outputPath]),
  ];
}

export function planOfficeSlidesEdit(request: OfficeSlidesEditRequest = {}): OfficeSlidesEditResult {
  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "office.slidesEdit was rejected by runtime governance",
      "governance",
      request.context,
    );
  }

  const presentationPath = normalizeScopedPath(request.presentationPath, "presentationPath", request.context);
  if (typeof presentationPath !== "string") {
    return (
      presentationPath ??
      failure("MISSING_PRESENTATION_PATH", "office.slidesEdit requires presentationPath", "input", request.context)
    );
  }

  const outputPath = normalizeScopedPath(request.outputPath, "outputPath", request.context);
  if (outputPath !== undefined && typeof outputPath !== "string") {
    return outputPath;
  }

  const operations = normalizeOperations(request.operations, request.context);
  if ("ok" in operations) {
    return operations;
  }

  const acceptedScopes = resolveScopes(request.context);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const permissionFailure = ensurePermissions(request.context, presentationPath, outputPath);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  if (!dryRunEnabled(request.context)) {
    return failure(
      "REAL_EXECUTION_BLOCKED",
      "office.slidesEdit only returns a guarded dry-run edit plan in the first implementation",
      "contract",
      request.context,
      presentationPath,
      outputPath,
    );
  }

  const plan: OfficeSlidesEditPlan = {
    kind: "agentCore.basicTool.office.slidesEdit.plan",
    operation: "presentation-edit",
    presentationPath,
    outputPath,
    operations,
    commandPreview: buildCommandPreview({ presentationPath, outputPath, operationCount: operations.length }),
    dryRun: true,
    executionBlocked: true,
    writesFile: true,
    tapOwnsApproval: true,
  };

  return {
    ok: true,
    plan,
    audit: auditFor(request.context, presentationPath, outputPath, acceptedScopes),
    events: ["office.slidesEdit.planned"],
  };
}
