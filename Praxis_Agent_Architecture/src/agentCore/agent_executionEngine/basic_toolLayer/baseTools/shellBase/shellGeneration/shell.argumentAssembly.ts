/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 生成。
 * 核心目的：提供 Shell 基础工具 / Shell 生成 中的“组装命令参数”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ShellArgumentAssemblyPermission = "shell:generate";

export type ShellArgumentAssemblyBoundary = "input" | "permission" | "contract" | "governance";

export type ShellArgumentAssemblyContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  grantedPermissions?: readonly ShellArgumentAssemblyPermission[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ShellArgumentValue =
  | string
  | number
  | boolean
  | {
      value?: string | number | boolean;
      sensitive?: boolean;
    };

export type ShellOptionArgument = {
  name?: string;
  value?: ShellArgumentValue;
  joinWithEquals?: boolean;
};

export type ShellArgumentAssemblyRequest = {
  executable?: string;
  positional?: readonly ShellArgumentValue[];
  options?: readonly ShellOptionArgument[];
  context?: ShellArgumentAssemblyContext;
};

export type ShellArgumentAssemblyErrorCode =
  | "MISSING_EXECUTABLE"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "REAL_EXECUTION_BLOCKED";

export type ShellArgumentAssemblyError = {
  code: ShellArgumentAssemblyErrorCode;
  message: string;
  boundary: ShellArgumentAssemblyBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type ShellArgumentAssemblyAuditEvent = {
  type: string;
  toolId: "shell.argumentAssembly";
  invocationId: string;
  dryRun: boolean;
  argvPreview: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type ShellArgumentToken = {
  raw: string;
  rendered: string;
  sensitive: boolean;
};

export type ShellArgumentAssemblyOutput = {
  kind: "agentCore.basicTool.shell.argumentAssembly";
  executable: string;
  argv: readonly string[];
  renderedTokens: readonly ShellArgumentToken[];
  redactedPreview: readonly string[];
  requiredPermission: ShellArgumentAssemblyPermission;
  dryRun: true;
  executionBlocked: true;
  unsafeSideEffects: false;
};

export type ShellArgumentAssemblyResult =
  | {
      ok: true;
      toolId: "shell.argumentAssembly";
      output: ShellArgumentAssemblyOutput;
      audit: readonly ShellArgumentAssemblyAuditEvent[];
      events: readonly string[];
    }
  | {
      ok: false;
      toolId: "shell.argumentAssembly";
      error: ShellArgumentAssemblyError;
      audit: readonly ShellArgumentAssemblyAuditEvent[];
      events: readonly string[];
    };

export const shellArgumentAssemblyDescriptor = {
  toolId: "shell.argumentAssembly",
  capability: "shell-argument-assembly",
  route: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellGeneration",
  defaultDryRun: true,
  tapOwnsApproval: true,
  requiredPermission: "shell:generate",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function dryRunEnabled(context: ShellArgumentAssemblyContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: ShellArgumentAssemblyContext | undefined): string {
  return context?.invocationId?.trim() || "shell.argumentAssembly:dry-run";
}

function cleanPermissions(
  permissions: readonly ShellArgumentAssemblyPermission[] | undefined,
): readonly ShellArgumentAssemblyPermission[] {
  return [...new Set((permissions ?? []).filter((permission): permission is ShellArgumentAssemblyPermission => permission === "shell:generate"))];
}

function normalizeArgumentValue(value: ShellArgumentValue): { raw: string; sensitive: boolean } | undefined {
  if (typeof value === "object" && value !== null) {
    if (value.value === undefined) {
      return undefined;
    }

    return {
      raw: String(value.value),
      sensitive: value.sensitive === true,
    };
  }

  return {
    raw: String(value),
    sensitive: false,
  };
}

export function quoteShellArgument(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(value)) {
    return value;
  }

  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function auditEvent(
  type: string,
  context: ShellArgumentAssemblyContext | undefined,
  argvPreview: readonly string[],
  metadata?: Readonly<Record<string, unknown>>,
): ShellArgumentAssemblyAuditEvent {
  return {
    type,
    toolId: shellArgumentAssemblyDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    argvPreview,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellArgumentAssemblyErrorCode,
  message: string,
  boundary: ShellArgumentAssemblyBoundary,
  context: ShellArgumentAssemblyContext | undefined,
  argvPreview: readonly string[] = [],
): ShellArgumentAssemblyResult {
  return {
    ok: false,
    toolId: shellArgumentAssemblyDescriptor.toolId,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    audit: [auditEvent("agentCore.basicTool.shell.argumentAssembly.rejected", context, argvPreview, { code })],
    events: ["basicTool.shell.argumentAssembly.rejected"],
  };
}

function ensurePermissions(
  context: ShellArgumentAssemblyContext | undefined,
): ShellArgumentAssemblyResult | undefined {
  if (context?.grantedPermissions === undefined) {
    return undefined;
  }

  const granted = cleanPermissions(context.grantedPermissions);
  if (granted.includes(shellArgumentAssemblyDescriptor.requiredPermission)) {
    return undefined;
  }

  return failure(
    "PERMISSION_DENIED",
    "shell.argumentAssembly is missing permission: shell:generate",
    "permission",
    context,
  );
}

function ensureDryRunOnly(
  context: ShellArgumentAssemblyContext | undefined,
): ShellArgumentAssemblyResult | undefined {
  if (dryRunEnabled(context)) {
    return undefined;
  }

  return failure(
    "REAL_EXECUTION_BLOCKED",
    "shell.argumentAssembly only creates a dry-run argv envelope in the first implementation",
    "contract",
    context,
  );
}

function appendOption(
  tokens: ShellArgumentToken[],
  option: ShellOptionArgument,
  context: ShellArgumentAssemblyContext | undefined,
): ShellArgumentAssemblyResult | undefined {
  const name = option.name?.trim() ?? "";
  if (name.length === 0 || !/^-{1,2}[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) {
    return failure("INVALID_ARGUMENT", "shell.argumentAssembly option names must be non-empty flag tokens", "input", context);
  }

  const normalized = option.value === undefined ? undefined : normalizeArgumentValue(option.value);
  if (option.value !== undefined && normalized === undefined) {
    return failure("INVALID_ARGUMENT", "shell.argumentAssembly option values must be defined scalar values", "input", context);
  }

  if (normalized === undefined) {
    tokens.push({ raw: name, rendered: quoteShellArgument(name), sensitive: false });
    return undefined;
  }

  if (option.joinWithEquals === true) {
    const raw = `${name}=${normalized.raw}`;
    tokens.push({
      raw,
      rendered: quoteShellArgument(raw),
      sensitive: normalized.sensitive,
    });
    return undefined;
  }

  tokens.push({ raw: name, rendered: quoteShellArgument(name), sensitive: false });
  tokens.push({
    raw: normalized.raw,
    rendered: quoteShellArgument(normalized.raw),
    sensitive: normalized.sensitive,
  });
  return undefined;
}

export function assembleShellArguments(request: ShellArgumentAssemblyRequest = {}): ShellArgumentAssemblyResult {
  const executable = request.executable?.trim() ?? "";
  if (executable.length === 0) {
    return failure("MISSING_EXECUTABLE", "shell.argumentAssembly requires a non-empty executable", "input", request.context);
  }

  const permissionFailure = ensurePermissions(request.context);
  if (permissionFailure !== undefined) {
    return permissionFailure;
  }

  const realExecutionFailure = ensureDryRunOnly(request.context);
  if (realExecutionFailure !== undefined) {
    return realExecutionFailure;
  }

  const tokens: ShellArgumentToken[] = [
    { raw: executable, rendered: quoteShellArgument(executable), sensitive: false },
  ];

  for (const option of request.options ?? []) {
    const optionFailure = appendOption(tokens, option, request.context);
    if (optionFailure !== undefined) {
      return optionFailure;
    }
  }

  for (const positional of request.positional ?? []) {
    const normalized = normalizeArgumentValue(positional);
    if (normalized === undefined) {
      return failure(
        "INVALID_ARGUMENT",
        "shell.argumentAssembly positional arguments must be defined scalar values",
        "input",
        request.context,
      );
    }

    tokens.push({
      raw: normalized.raw,
      rendered: quoteShellArgument(normalized.raw),
      sensitive: normalized.sensitive,
    });
  }

  if (tokens.some((token) => isBlank(token.raw))) {
    return failure("INVALID_ARGUMENT", "shell.argumentAssembly does not accept blank argument tokens", "input", request.context);
  }

  const argv = tokens.map((token) => token.raw);
  const redactedPreview = tokens.map((token) => (token.sensitive ? "[redacted]" : token.rendered));

  return {
    ok: true,
    toolId: shellArgumentAssemblyDescriptor.toolId,
    output: {
      kind: "agentCore.basicTool.shell.argumentAssembly",
      executable,
      argv,
      renderedTokens: tokens,
      redactedPreview,
      requiredPermission: shellArgumentAssemblyDescriptor.requiredPermission,
      dryRun: true,
      executionBlocked: true,
      unsafeSideEffects: false,
    },
    audit: [
      auditEvent("agentCore.basicTool.shell.argumentAssembly.dryRun", request.context, redactedPreview, {
        argc: argv.length,
      }),
    ],
    events: ["basicTool.shell.argumentAssembly.assembled"],
  };
}
