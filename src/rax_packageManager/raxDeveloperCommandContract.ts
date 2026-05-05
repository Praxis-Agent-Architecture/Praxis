/*
 * 文件定位：rax 包管理/开发者命令合同层。
 * 核心目的：定义 rax inspect/test/run/dev/build 的 v1 行为形状，暂不实现完整包管理。
 * 边界：只使用 agentCore 公共 API，不深 import runtime.* 内部文件，不执行网络安装。
 */

import {
  inspectAgentManifest,
  validateAgentManifest,
  type AgentManifest,
  type AgentManifestInspection,
  type AgentManifestValidationResult,
} from "../agentCore/index.js";

export type RaxDeveloperCommandName = "inspect" | "test" | "run" | "dev" | "build";

export type RaxDeveloperInput =
  | { kind: "agentFile"; path: string; exportName?: string }
  | { kind: "manifest"; manifest: AgentManifest }
  | { kind: "package"; packageName: string; version?: string }
  | { kind: "remoteSignedAgent"; signedAgentId: string };

export type RaxDeveloperCommandRequest = {
  command?: RaxDeveloperCommandName;
  input?: RaxDeveloperInput;
  cwd?: string;
  runtimeId?: string;
  dryRun?: boolean;
};

export type RaxDeveloperCommandStep =
  | "resolve-input"
  | "compile-agent"
  | "validate-manifest"
  | "inspect-manifest"
  | "readiness-check"
  | "run-manifest"
  | "watch"
  | "emit-manifest";

export type RaxDeveloperCommandPlan = {
  command: RaxDeveloperCommandName;
  inputKind: RaxDeveloperInput["kind"];
  runtimeId?: string;
  cwd?: string;
  steps: readonly RaxDeveloperCommandStep[];
  manifestInspection?: AgentManifestInspection;
  validation?: AgentManifestValidationResult;
  execution: "none" | "dry-run" | "runManifest";
  packageInstallDeferred: true;
  usesPublicAgentCoreApi: true;
  unsafeSideEffects: false;
};

export type RaxDeveloperCommandError = {
  code:
    | "MISSING_COMMAND"
    | "MISSING_INPUT"
    | "MISSING_AGENT_FILE"
    | "MISSING_PACKAGE_NAME"
    | "MISSING_SIGNED_AGENT_ID"
    | "INVALID_MANIFEST"
    | "PACKAGE_INSTALL_DEFERRED";
  message: string;
  boundary: "input" | "manifest" | "package";
  publicSafe: true;
  internalDetailExposed: false;
};

export type RaxDeveloperCommandResult =
  | {
      ok: true;
      plan: RaxDeveloperCommandPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RaxDeveloperCommandError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: RaxDeveloperCommandError["code"],
  message: string,
  boundary: RaxDeveloperCommandError["boundary"],
): RaxDeveloperCommandResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["rax.command.rejected"],
  };
}

function stepsForCommand(command: RaxDeveloperCommandName, input: RaxDeveloperInput): readonly RaxDeveloperCommandStep[] {
  const compileSteps: RaxDeveloperCommandStep[] =
    input.kind === "agentFile" ? ["resolve-input", "compile-agent", "validate-manifest"] : ["resolve-input"];

  if (input.kind === "manifest") {
    compileSteps.push("validate-manifest");
  }

  if (command === "inspect") {
    return [...compileSteps, "inspect-manifest"];
  }

  if (command === "test") {
    return [...compileSteps, "inspect-manifest", "readiness-check"];
  }

  if (command === "run") {
    return [...compileSteps, "run-manifest"];
  }

  if (command === "dev") {
    return [...compileSteps, "inspect-manifest", "readiness-check", "watch", "run-manifest"];
  }

  return [...compileSteps, "emit-manifest"];
}

function validateInput(input: RaxDeveloperInput | undefined): RaxDeveloperCommandResult | undefined {
  if (input === undefined) {
    return failure("MISSING_INPUT", "rax command requires an input", "input");
  }

  if (input.kind === "agentFile" && isBlank(input.path)) {
    return failure("MISSING_AGENT_FILE", "rax agentFile input requires a path", "input");
  }

  if (input.kind === "package" && isBlank(input.packageName)) {
    return failure("MISSING_PACKAGE_NAME", "rax package input requires a package name", "input");
  }

  if (input.kind === "remoteSignedAgent" && isBlank(input.signedAgentId)) {
    return failure("MISSING_SIGNED_AGENT_ID", "rax remoteSignedAgent input requires a signed agent id", "input");
  }

  return undefined;
}

export function planRaxDeveloperCommand(request?: RaxDeveloperCommandRequest): RaxDeveloperCommandResult {
  if (request === undefined || request.command === undefined) {
    return failure("MISSING_COMMAND", "rax developer command requires a command", "input");
  }

  const inputError = validateInput(request.input);
  if (inputError !== undefined) {
    return inputError;
  }

  const input = request.input;
  if (input === undefined) {
    return failure("MISSING_INPUT", "rax command requires an input", "input");
  }

  if (input.kind === "package" || input.kind === "remoteSignedAgent") {
    return failure(
      "PACKAGE_INSTALL_DEFERRED",
      "rax package and remote signed agent resolution are contract-only in v1",
      "package",
    );
  }

  let validation: AgentManifestValidationResult | undefined;
  let manifestInspection: AgentManifestInspection | undefined;
  if (input.kind === "manifest") {
    validation = validateAgentManifest(input.manifest);
    if (!validation.ok) {
      return failure("INVALID_MANIFEST", validation.error.message, "manifest");
    }

    manifestInspection = inspectAgentManifest(validation.manifest);
  }

  return {
    ok: true,
    plan: {
      command: request.command,
      inputKind: input.kind,
      runtimeId: request.runtimeId?.trim() || undefined,
      cwd: request.cwd?.trim() || undefined,
      steps: stepsForCommand(request.command, input),
      manifestInspection,
      validation,
      execution: request.command === "run" || request.command === "dev"
        ? "runManifest"
        : request.command === "test"
          ? "dry-run"
          : "none",
      packageInstallDeferred: true,
      usesPublicAgentCoreApi: true,
      unsafeSideEffects: false,
    },
    events: [`rax.command.${request.command}.planned`],
  };
}
