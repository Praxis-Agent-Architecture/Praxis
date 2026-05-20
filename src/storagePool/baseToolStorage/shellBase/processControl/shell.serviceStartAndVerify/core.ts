/*
 * 文件定位：storagePool / shellBase / processControl / shell.serviceStartAndVerify core。
 * 核心目的：定义通用长生命周期 service/process/daemon 启动与健康验证的 baseTool 合同。
 */

import type {
  BaseToolShellServiceStatus,
  BaseToolShellServiceVerification,
} from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { ShellProcessSpawningPermission } from "../shell.processSpawning/core.js";
import {
  approvalRecord,
  cleanStringList,
  normalizeDirectory,
  readRecord,
  safeMetadata,
  stringValue,
  trimmedString,
} from "../_shared/processControlJson.js";
import { plannedLifecycleStatusSnapshot } from "../_shared/serviceLifecycle.js";
import {
  describeShellWorkspaceWrite,
  shellWorkspaceWriteGuardMessage,
} from "../../_shared/workspaceWriteGuard.js";

export type ShellServiceStartAndVerifyPermission =
  | ShellProcessSpawningPermission
  | "shell:service:verify";

export type ShellServiceStartAndVerifyBoundary =
  | "input"
  | "scope"
  | "permission"
  | "approval"
  | "contract"
  | "resource";

export type ShellServiceStartAndVerifyContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  dryRun?: boolean;
  allowedWorkingDirectories?: readonly string[];
  grantedPermissions?: readonly ShellServiceStartAndVerifyPermission[];
  approval?: {
    accepted: boolean;
    approvalId?: string;
    reason?: string;
  };
  guard?: {
    accepted?: boolean;
    allowed?: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellServiceStartAndVerifyTarget = {
  command: string;
  args?: readonly string[];
  workingDirectory?: string;
  shell: "sh" | "bash" | "zsh";
  serviceId: string;
  launchMode: "background" | "detached";
  restartPolicy: "none" | "on-failure";
  outputBufferLimitBytes: number;
  captureOutput: boolean;
  verification: BaseToolShellServiceVerification;
};

export type ShellServiceStartAndVerifyRequest = {
  target?: Omit<Partial<ShellServiceStartAndVerifyTarget>, "verification"> & {
    verification?: unknown;
    probe?: unknown;
  };
  riskLevel?: "low" | "medium" | "high";
  context?: ShellServiceStartAndVerifyContext;
};

export type ShellServiceStartAndVerifyErrorCode =
  | "MISSING_COMMAND"
  | "INVALID_ARGS"
  | "INVALID_SHELL"
  | "INVALID_CWD"
  | "INVALID_SERVICE_ID"
  | "INVALID_LAUNCH_MODE"
  | "INVALID_RESTART_POLICY"
  | "INVALID_CAPTURE_OUTPUT"
  | "INVALID_VERIFICATION"
  | "MISSING_VERIFICATION"
  | "MISSING_VERIFICATION_URL"
  | "MISSING_VERIFICATION_COMMAND"
  | "MISSING_VERIFICATION_PATTERN"
  | "INVALID_VERIFICATION_TIMEOUT"
  | "INVALID_OUTPUT_BUFFER"
  | "SCOPE_REJECTED"
  | "PERMISSION_DENIED"
  | "APPROVAL_REJECTED"
  | "WORKSPACE_WRITE_REQUIRES_CODE_TOOL"
  | "REAL_EXECUTION_BLOCKED";

export type ShellServiceStartAndVerifyError = {
  code: ShellServiceStartAndVerifyErrorCode;
  message: string;
  boundary: ShellServiceStartAndVerifyBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellServiceStartAndVerifyAuditEvent = {
  type: string;
  toolId: "shell.serviceStartAndVerify";
  invocationId: string;
  dryRun: boolean;
  workingDirectory?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellServiceStartAndVerifyOutput = {
  kind: "agentCore.basicTool.shell.serviceStartAndVerify";
  target: ShellServiceStartAndVerifyTarget;
  commandPreview: readonly string[];
  permissionsRequired: readonly ShellServiceStartAndVerifyPermission[];
  approvalId?: string;
  serviceContract: {
    startsService: true;
    verifiesReachability: true;
    runtimeOwnsLifecycle: true;
    finalAnswerRequiresVerifiedReachability: true;
  };
  dryRun: boolean;
  executionBlocked: boolean;
  providerCalled?: boolean;
  unsafeSideEffects: false;
  resultEnvelope: Readonly<Record<string, unknown>> & {
    planned?: true;
    serviceHandle?: string;
    serviceStatus?: BaseToolShellServiceStatus | "planned";
    statusSnapshot: Readonly<Record<string, unknown>>;
    failureReason?: string;
    recommendedNextActions?: readonly string[];
  };
};

export type ShellServiceStartAndVerifyResult =
  | {
      ok: true;
      toolId: "shell.serviceStartAndVerify";
      output: ShellServiceStartAndVerifyOutput;
      audit: readonly ShellServiceStartAndVerifyAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.serviceStartAndVerify";
      error: ShellServiceStartAndVerifyError;
      audit: readonly ShellServiceStartAndVerifyAuditEvent[];
      events: readonly string[];
    };

export const shellServiceStartAndVerifyDescriptor = {
  toolId: "shell.serviceStartAndVerify",
  capability: "shell-service-start-and-verify",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.processControl",
  defaultDryRun: true,
  tapOwnsApproval: true,
  permissionsRequired: ["shell:execute", "shell:service:verify"] as readonly ShellServiceStartAndVerifyPermission[],
  unsafeSideEffects: false,
} as const;

const defaultTimeoutMs = 30_000;
const defaultIntervalMs = 500;
const defaultMaxAttempts = 60;
const minTimeoutMs = 100;
const maxTimeoutMs = 120_000;
const minIntervalMs = 50;
const defaultOutputBufferLimitBytes = 64 * 1024;
const maxOutputBufferLimitBytes = 10 * 1024 * 1024;

function dryRunEnabled(context: ShellServiceStartAndVerifyContext | undefined): boolean {
  return readRecord(context)?.dryRun !== false;
}

function invocationId(context: ShellServiceStartAndVerifyContext | undefined): string {
  return trimmedString(readRecord(context)?.invocationId) || "shell.serviceStartAndVerify:dry-run";
}

function auditEvent(
  type: string,
  context: ShellServiceStartAndVerifyContext | undefined,
  workingDirectory?: string,
  metadata?: Readonly<Record<string, unknown>>,
): ShellServiceStartAndVerifyAuditEvent {
  return {
    type,
    toolId: shellServiceStartAndVerifyDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    workingDirectory,
    metadata: {
      ...safeMetadata(readRecord(context)?.auditMetadata),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellServiceStartAndVerifyErrorCode,
  message: string,
  boundary: ShellServiceStartAndVerifyBoundary,
  context: ShellServiceStartAndVerifyContext | undefined,
  workingDirectory?: string,
): ShellServiceStartAndVerifyResult {
  return {
    ok: false,
    toolId: shellServiceStartAndVerifyDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.serviceStartAndVerify.rejected", context, workingDirectory, { code })],
    events: ["basicTool.shell.serviceStartAndVerify.rejected"],
  };
}

function cleanArgs(
  value: unknown,
  context: ShellServiceStartAndVerifyContext | undefined,
  workingDirectory?: string,
): readonly string[] | ShellServiceStartAndVerifyResult | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    return failure("INVALID_ARGS", "shell.serviceStartAndVerify args must be an array of strings", "input", context, workingDirectory);
  }
  if (value.some((item) => typeof item !== "string" || item.includes("\0"))) {
    return failure("INVALID_ARGS", "shell.serviceStartAndVerify args must contain safe strings", "input", context, workingDirectory);
  }
  return value;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return undefined;
  return value;
}

function assertHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function verificationTiming(
  verification: Readonly<Record<string, unknown>>,
  context: ShellServiceStartAndVerifyContext | undefined,
  workingDirectory?: string,
): { timeoutMs: number; intervalMs: number; maxAttempts: number } | ShellServiceStartAndVerifyResult {
  const timeoutMs = boundedInteger(verification.timeoutMs, defaultTimeoutMs, minTimeoutMs, maxTimeoutMs);
  if (timeoutMs === undefined) {
    return failure("INVALID_VERIFICATION_TIMEOUT", "shell.serviceStartAndVerify verification.timeoutMs must be an integer between 100 and 120000", "resource", context, workingDirectory);
  }
  const intervalMs = boundedInteger(verification.intervalMs, defaultIntervalMs, minIntervalMs, maxTimeoutMs);
  if (intervalMs === undefined) {
    return failure("INVALID_VERIFICATION_TIMEOUT", "shell.serviceStartAndVerify verification.intervalMs must be an integer between 50 and 120000", "resource", context, workingDirectory);
  }
  const maxAttempts = boundedInteger(verification.maxAttempts, defaultMaxAttempts, 1, 1_000);
  if (maxAttempts === undefined) {
    return failure("INVALID_VERIFICATION_TIMEOUT", "shell.serviceStartAndVerify verification.maxAttempts must be an integer between 1 and 1000", "resource", context, workingDirectory);
  }
  return { timeoutMs, intervalMs, maxAttempts };
}

function normalizeVerification(
  value: unknown,
  context: ShellServiceStartAndVerifyContext | undefined,
  workingDirectory?: string,
): BaseToolShellServiceVerification | ShellServiceStartAndVerifyResult {
  const verification = readRecord(value);
  if (verification === undefined) {
    return failure("MISSING_VERIFICATION", "shell.serviceStartAndVerify requires a verification contract", "input", context, workingDirectory);
  }
  const timing = verificationTiming(verification, context, workingDirectory);
  if ("ok" in timing) return timing;
  const kind = stringValue(verification.kind) ?? stringValue(verification.type);
  if (kind === "process") return { kind, ...timing };
  if (kind === "tcp") {
    const port = verification.port;
    if (typeof port !== "number" || !Number.isInteger(port) || port <= 0 || port > 65_535) {
      return failure("INVALID_VERIFICATION", "tcp verification requires an integer port between 1 and 65535", "input", context, workingDirectory);
    }
    return { kind, port, host: trimmedString(verification.host), ...timing };
  }
  if (kind === "http") {
    const url = trimmedString(verification.url);
    if (url === undefined) {
      return failure("MISSING_VERIFICATION_URL", "http verification requires a URL", "input", context, workingDirectory);
    }
    if (!assertHttpUrl(url)) {
      return failure("INVALID_VERIFICATION", "http verification url must be an http(s) URL", "input", context, workingDirectory);
    }
    const expectedStatus = verification.expectedStatus;
    if (expectedStatus !== undefined && (typeof expectedStatus !== "number" || !Number.isInteger(expectedStatus))) {
      return failure("INVALID_VERIFICATION", "http verification expectedStatus must be an integer", "input", context, workingDirectory);
    }
    const method = verification.method === "GET" || verification.method === "HEAD" || verification.method === "POST"
      ? verification.method
      : undefined;
    return {
      kind,
      url,
      expectedStatus,
      expectedText: trimmedString(verification.expectedText),
      method,
      ...timing,
    };
  }
  if (kind === "log") {
    const pattern = trimmedString(verification.pattern);
    if (pattern === undefined) {
      return failure("MISSING_VERIFICATION_PATTERN", "log verification requires a pattern", "input", context, workingDirectory);
    }
    const stream = verification.stream === "stdout" || verification.stream === "stderr" || verification.stream === "both"
      ? verification.stream
      : undefined;
    return { kind, pattern, stream, regex: verification.regex === true, ...timing };
  }
  if (kind === "command") {
    const command = trimmedString(verification.command);
    if (command === undefined) {
      return failure("MISSING_VERIFICATION_COMMAND", "command verification requires a command", "input", context, workingDirectory);
    }
    const args = cleanArgs(verification.args, context, workingDirectory);
    if (args !== undefined && "ok" in args) return args;
    return {
      kind,
      command,
      args,
      cwd: trimmedString(verification.cwd),
      expectedText: trimmedString(verification.expectedText),
      ...timing,
    };
  }
  return failure("INVALID_VERIFICATION", "verification kind must be process, tcp, http, log, or command", "input", context, workingDirectory);
}

function normalizeTarget(
  target: ShellServiceStartAndVerifyRequest["target"] | undefined,
  context: ShellServiceStartAndVerifyContext | undefined,
): ShellServiceStartAndVerifyOutput["target"] | ShellServiceStartAndVerifyResult {
  const targetRecord = readRecord(target);
  const workingDirectoryForAudit = stringValue(targetRecord?.workingDirectory);
  const command = trimmedString(targetRecord?.command) ?? "";
  if (command.length === 0) {
    return failure("MISSING_COMMAND", "shell.serviceStartAndVerify requires a non-empty command", "input", context, workingDirectoryForAudit);
  }
  const workspaceWriteReason = describeShellWorkspaceWrite(command);
  if (workspaceWriteReason !== undefined) {
    return failure("WORKSPACE_WRITE_REQUIRES_CODE_TOOL", shellWorkspaceWriteGuardMessage(workspaceWriteReason), "contract", context, workingDirectoryForAudit);
  }
  const args = cleanArgs(targetRecord?.args, context, workingDirectoryForAudit);
  if (args !== undefined && "ok" in args) return args;

  const shell = stringValue(targetRecord?.shell) ?? "sh";
  if (shell !== "sh" && shell !== "bash" && shell !== "zsh") {
    return failure("INVALID_SHELL", "shell.serviceStartAndVerify shell must be sh, bash, or zsh", "input", context, workingDirectoryForAudit);
  }
  const workingDirectory = trimmedString(targetRecord?.workingDirectory);
  if (targetRecord?.workingDirectory !== undefined && workingDirectory === undefined) {
    return failure("INVALID_CWD", "shell.serviceStartAndVerify workingDirectory must be a safe path string", "input", context, workingDirectoryForAudit);
  }
  const serviceId = trimmedString(targetRecord?.serviceId) ?? `${invocationId(context)}:service`;
  if (targetRecord?.serviceId !== undefined && serviceId.length === 0) {
    return failure("INVALID_SERVICE_ID", "shell.serviceStartAndVerify serviceId must be a non-empty string", "input", context, workingDirectoryForAudit);
  }
  const launchMode = stringValue(targetRecord?.launchMode) ?? "background";
  if (launchMode !== "background" && launchMode !== "detached") {
    return failure("INVALID_LAUNCH_MODE", "shell.serviceStartAndVerify launchMode must be background or detached", "input", context, workingDirectoryForAudit);
  }
  const restartPolicy = stringValue(targetRecord?.restartPolicy) ?? "none";
  if (restartPolicy !== "none" && restartPolicy !== "on-failure") {
    return failure("INVALID_RESTART_POLICY", "shell.serviceStartAndVerify restartPolicy must be none or on-failure", "input", context, workingDirectoryForAudit);
  }
  if (targetRecord?.captureOutput !== undefined && typeof targetRecord.captureOutput !== "boolean") {
    return failure("INVALID_CAPTURE_OUTPUT", "shell.serviceStartAndVerify captureOutput must be boolean when provided", "input", context, workingDirectoryForAudit);
  }
  const outputBufferLimitBytes = targetRecord?.outputBufferLimitBytes === undefined ? defaultOutputBufferLimitBytes : targetRecord.outputBufferLimitBytes;
  if (typeof outputBufferLimitBytes !== "number" || !Number.isInteger(outputBufferLimitBytes) || outputBufferLimitBytes < 0 || outputBufferLimitBytes > maxOutputBufferLimitBytes) {
    return failure("INVALID_OUTPUT_BUFFER", `shell.serviceStartAndVerify outputBufferLimitBytes must be an integer between 0 and ${maxOutputBufferLimitBytes}`, "resource", context, workingDirectoryForAudit);
  }
  const verification = normalizeVerification(targetRecord?.verification ?? targetRecord?.probe, context, workingDirectoryForAudit);
  if ("ok" in verification) return verification;

  return {
    command,
    args,
    workingDirectory: workingDirectory === undefined ? undefined : normalizeDirectory(workingDirectory),
    shell,
    serviceId,
    launchMode,
    restartPolicy,
    outputBufferLimitBytes,
    captureOutput: targetRecord?.captureOutput !== false,
    verification,
  };
}

function ensureScope(
  workingDirectory: string | undefined,
  context: ShellServiceStartAndVerifyContext | undefined,
): ShellServiceStartAndVerifyResult | undefined {
  if (workingDirectory === undefined) return undefined;
  const allowedDirectories = cleanStringList(readRecord(context)?.allowedWorkingDirectories).map(normalizeDirectory);
  if (allowedDirectories.length === 0) return undefined;
  const allowed = allowedDirectories.some((directory) => directory === "/" || workingDirectory === directory || workingDirectory.startsWith(`${directory}/`));
  if (allowed) return undefined;
  return failure("SCOPE_REJECTED", "shell.serviceStartAndVerify workingDirectory is outside allowed execution scope", "scope", context, workingDirectory);
}

function ensurePermissions(
  workingDirectory: string | undefined,
  context: ShellServiceStartAndVerifyContext | undefined,
): ShellServiceStartAndVerifyResult | undefined {
  if (readRecord(context)?.grantedPermissions === undefined) return undefined;
  const granted = cleanStringList(readRecord(context)?.grantedPermissions);
  const missing = shellServiceStartAndVerifyDescriptor.permissionsRequired.filter((permission) => !granted.includes(permission));
  if (missing.length === 0) return undefined;
  return failure("PERMISSION_DENIED", `shell.serviceStartAndVerify is missing permissions: ${missing.join(", ")}`, "permission", context, workingDirectory);
}

function ensureDryRunOnly(
  workingDirectory: string | undefined,
  context: ShellServiceStartAndVerifyContext | undefined,
): ShellServiceStartAndVerifyResult | undefined {
  if (dryRunEnabled(context)) return undefined;
  return failure("REAL_EXECUTION_BLOCKED", "shell.serviceStartAndVerify only returns a dry-run plan from core; real execution must go through runtime provider", "contract", context, workingDirectory);
}

export function planShellServiceStartAndVerify(request: ShellServiceStartAndVerifyRequest = {}): ShellServiceStartAndVerifyResult {
  const target = normalizeTarget(request.target, request.context);
  if ("ok" in target) return target;
  const scopeFailure = ensureScope(target.workingDirectory, request.context);
  if (scopeFailure !== undefined) return scopeFailure;
  const permissionFailure = ensurePermissions(target.workingDirectory, request.context);
  if (permissionFailure !== undefined) return permissionFailure;
  const realExecutionFailure = ensureDryRunOnly(target.workingDirectory, request.context);
  if (realExecutionFailure !== undefined) return realExecutionFailure;

  const approval = approvalRecord(request.context);
  if (approval?.accepted === false) {
    return failure("APPROVAL_REJECTED", stringValue(approval.reason) ?? "shell.serviceStartAndVerify approval was rejected by TAP governance", "approval", request.context, target.workingDirectory);
  }
  const verificationKind = target.verification.kind;

  return {
    ok: true,
    toolId: shellServiceStartAndVerifyDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.serviceStartAndVerify",
      target,
      commandPreview: [target.shell, "-lc", target.command],
      permissionsRequired: shellServiceStartAndVerifyDescriptor.permissionsRequired,
      approvalId: trimmedString(approval?.approvalId),
      serviceContract: {
        startsService: true,
        verifiesReachability: true,
        runtimeOwnsLifecycle: true,
        finalAnswerRequiresVerifiedReachability: true,
      },
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
      resultEnvelope: {
        planned: true,
        serviceHandle: target.serviceId,
        serviceStatus: "planned",
        statusSnapshot: plannedLifecycleStatusSnapshot({
          handle: target.serviceId,
          lifecycleKind: "service",
          verificationState: "not-started",
          command: target.command,
          cwd: target.workingDirectory,
          verificationKind,
          url: target.verification.kind === "http" ? target.verification.url : undefined,
          expectedStatus: target.verification.kind === "http" ? target.verification.expectedStatus : undefined,
          summary: "service launch and reachability verification are planned, not completed",
        }),
        recommendedNextActions: ["execute through runtime, then verify reachability before reporting the service as ready"],
      },
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.serviceStartAndVerify.dryRun", request.context, target.workingDirectory, {
        serviceId: target.serviceId,
        verificationKind,
      }),
    ],
    events: ["basicTool.shell.serviceStartAndVerify.dryRun"],
  };
}
