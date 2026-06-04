/*
 * 文件定位：Agent 运行态实现层 / 沙箱命令执行器。
 * 核心目的：把 shell/process/git/rg 等 host-effect 命令统一转换成可审计、可降级的 SandboxCommandPlan。
 * 边界：工具 handler 不感知本文件；executor port 负责把真实进程执行交给本 runner。
 */

import { spawn } from "node:child_process";
import path from "node:path";

import type { BaseToolPolicyProfile, SandboxSpec } from "../runtimeAgentManifest.js";
import { createRaxcellSandboxProvider } from "./raxcellSandboxProvider.js";
import { resolveRaxcellBinaryPath, type SandboxRuntimePrepareResult } from "./sandboxRuntimeProvider.js";
import {
  runSandboxPolicyMiddleware,
  type SandboxExecutionProviderPort,
  type SandboxPolicyMiddlewareAuditEvent,
  type SandboxPolicyMiddlewareEnvironmentGapDecision,
  type SandboxProviderEnvironmentGap,
  type SandboxProviderPolicyGrant,
  type SandboxProviderRunRequest,
} from "./sandboxPolicyMiddleware.js";
import {
  createWorkspaceRollbackSandboxPlan,
  createWorkspaceRollbackSnapshot,
  finalizeWorkspaceRollbackSnapshot,
  restoreWorkspaceRollbackSnapshot,
  type WorkspaceRollbackFinalizeResult,
  type WorkspaceRollbackSnapshot,
} from "./workspaceRollbackSandbox.js";

export type SandboxCommandProviderFamily =
  | "host-observed"
  | "workspace-policy"
  | "workspace-rollback"
  | "linux-bubblewrap"
  | "macos-containerization"
  | "windows-sandbox"
  | "remote-worker";

export type SandboxCommandNetworkPolicy = "deny" | "allow" | "approval" | "provider-policy";

export type SandboxCommandFilesystemPolicy = {
  workspaceRoot: string;
  allowedReadRoots: readonly string[];
  allowedWriteRoots: readonly string[];
  readonlyRoot: boolean;
  secretGlobs: readonly string[];
  protectSecrets: boolean;
};

export type SandboxCommandRequest = {
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  toolId: string;
  command: string;
  args?: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  timeoutMs?: number;
  maxOutputBytes?: number;
  sandbox: SandboxSpec;
  preparedSandbox?: SandboxRuntimePrepareResult;
  policyProfile: BaseToolPolicyProfile;
  sandboxMode?: "none" | "workspace-rollback" | "isolated";
  filesystem?: Partial<SandboxCommandFilesystemPolicy>;
  network?: SandboxCommandNetworkPolicy;
  policyGrants?: readonly SandboxProviderPolicyGrant[];
  approval?: {
    accepted: boolean;
    grantedBy?: string;
  };
  metadata?: Readonly<Record<string, unknown>>;
};

export type SandboxCommandPlan = {
  kind: "runtime.sandboxPlane.command.plan";
  providerFamily: SandboxCommandProviderFamily;
  requestedProviderFamily?: SandboxSpec["providerFamily"];
  mode: "none" | "workspace-rollback" | "isolated";
  applied: boolean;
  policyProfile: BaseToolPolicyProfile;
  program: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  network: SandboxCommandNetworkPolicy;
  filesystem: SandboxCommandFilesystemPolicy;
  workspaceRollback?: WorkspaceRollbackSnapshot;
  cleanup?: () => Promise<void>;
  publicSafe: true;
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxCommandDenial = {
  kind: "runtime.sandboxPlane.command.denial";
  code: "SANDBOX_PERMISSION_DENIED" | "SANDBOX_NETWORK_DENIED" | "SANDBOX_PROVIDER_UNAVAILABLE";
  message: string;
  needsApproval: boolean;
  suggestedPermission?: {
    filesystem?: "read" | "write";
    network?: true;
    paths?: readonly string[];
  };
  publicSafe: true;
};

export type SandboxCommandRunResult = {
  ok: true;
  plan: SandboxCommandPlan;
  exitCode: number;
  stdout: string;
  stderr: string;
  rollback?: WorkspaceRollbackFinalizeResult;
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
} | {
  ok: false;
  plan?: SandboxCommandPlan;
  error: {
    code: "SANDBOX_PLAN_FAILED" | "SANDBOX_COMMAND_FAILED" | "SANDBOX_DENIED";
    message: string;
    publicSafe: true;
    denial?: SandboxCommandDenial;
  };
  stdout?: string;
  stderr?: string;
  rollback?: WorkspaceRollbackFinalizeResult;
  events: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type SandboxRemoteWorkerAdapter = (request: SandboxCommandRequest, plan: SandboxCommandPlan) => Promise<{
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  events?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type SandboxCommandRunnerOptions = {
  remoteWorker?: SandboxRemoteWorkerAdapter;
  sandboxProvider?: SandboxExecutionProviderPort;
  decideEnvironmentGap?: (context: {
    request: SandboxProviderRunRequest;
    environmentGap: SandboxProviderEnvironmentGap;
  }) => Promise<SandboxPolicyMiddlewareEnvironmentGapDecision> | SandboxPolicyMiddlewareEnvironmentGapDecision;
  audit?: (event: SandboxPolicyMiddlewareAuditEvent) => Promise<void> | void;
};

export const sandboxCommandRunnerDescriptor = {
  surface: "runtime.sandboxPlane.sandboxCommandRunner",
  publicApiCandidate: "application may inject providers through runtime options",
  providers: ["host-observed", "workspace-rollback", "linux-bubblewrap", "macos-containerization", "windows-sandbox", "remote-worker"],
} as const;

function asEnvRecord(input: Readonly<Record<string, string | undefined>> | undefined): Readonly<Record<string, string | undefined>> {
  return input ?? {};
}

function truncate(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let used = 0;
  let output = "";
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (used + size > maxBytes) break;
    output += char;
    used += size;
  }
  return output;
}

function defaultModeFor(profile: BaseToolPolicyProfile): SandboxCommandPlan["mode"] {
  if (profile === "yolo") return "workspace-rollback";
  return "isolated";
}

function defaultNetworkPolicy(spec: SandboxSpec): SandboxCommandNetworkPolicy {
  const outbound = String(spec.networkPolicy?.outbound ?? spec.network);
  if (outbound === "allow" || outbound === "deny" || outbound === "approval" || outbound === "provider-policy") return outbound;
  return outbound.includes("allow") ? "allow" : outbound.includes("deny") ? "deny" : "approval";
}

function shouldProtectSecrets(profile: BaseToolPolicyProfile): boolean {
  return profile !== "bapr" && profile !== "yolo";
}

function normalizeFilesystem(input: SandboxCommandRequest, cwd: string): SandboxCommandFilesystemPolicy {
  const workspaceRoot = path.resolve(input.filesystem?.workspaceRoot ?? cwd);
  const readRoots = input.filesystem?.allowedReadRoots ?? input.sandbox.mountPolicy?.allowedReadRoots ?? ["workspace", ".rax_workspace"];
  const writeRoots = input.filesystem?.allowedWriteRoots ?? input.sandbox.mountPolicy?.allowedWriteRoots ?? ["workspace", ".rax_workspace"];
  const resolveRoot = (root: string): string => {
    if (root === "workspace" || root === "rax.workspace") return workspaceRoot;
    if (path.isAbsolute(root)) return path.resolve(root);
    return path.resolve(workspaceRoot, root);
  };
  return {
    workspaceRoot,
    allowedReadRoots: [...new Set(readRoots.map(resolveRoot))],
    allowedWriteRoots: [...new Set(writeRoots.map(resolveRoot))],
    readonlyRoot: input.filesystem?.readonlyRoot ?? input.sandbox.mountPolicy?.readonlyRoot ?? false,
    secretGlobs: input.filesystem?.secretGlobs ?? [".env", ".env.*"],
    protectSecrets: input.filesystem?.protectSecrets ?? shouldProtectSecrets(input.policyProfile),
  };
}

function familyFor(input: SandboxCommandRequest, mode: SandboxCommandPlan["mode"]): SandboxCommandProviderFamily {
  if (mode === "none") return input.sandbox.providerFamily === "workspace-policy" ? "workspace-policy" : "host-observed";
  if (mode === "workspace-rollback") return "workspace-rollback";
  const family = String(input.preparedSandbox?.providerFamily ?? input.sandbox.providerFamily ?? "");
  if (family === "linux-bubblewrap" || family === "macos-containerization" || family === "windows-sandbox" || family === "remote-worker") return family;
  return "workspace-rollback";
}

function sandboxProviderUnavailable(input: SandboxCommandRequest, providerFamily: SandboxCommandProviderFamily): Error {
  const preparedStatus = input.preparedSandbox?.probe.status ?? "not-prepared";
  return new Error(`${providerFamily} sandbox is not ready for isolated execution (${preparedStatus})`);
}

function isInsidePath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function seatbeltString(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, "\\\"")
    .replace(/\r\n|\r|\n/gu, "\\n");
}

function macosSeatbeltPlan(input: SandboxCommandRequest, base: Omit<SandboxCommandPlan, "program" | "args" | "cleanup">): Pick<SandboxCommandPlan, "program" | "args" | "metadata"> {
  const allowNetwork = base.network === "allow";
  const allowWriteRules = base.filesystem.allowedWriteRoots.map((root) => `(allow file-write* (subpath "${seatbeltString(root)}"))`).join("\n");
  const denySecrets = base.filesystem.protectSecrets ? `(deny file-read* file-write* (regex #".*/\\.env(\\..*)?$"))` : "";
  const workspaceRoot = seatbeltString(base.filesystem.workspaceRoot);
  const runtimeReadRules = ["/bin", "/sbin", "/usr", "/System", "/Library", "/private/tmp"]
    .map((root) => `(allow file-read* (subpath "${root}"))`);
  const profile = [
    "(version 1)",
    "(deny default)",
    "(allow process*)",
    ...runtimeReadRules,
    allowNetwork ? "(allow network*)" : "(deny network*)",
    `(allow file-read* (subpath "${workspaceRoot}"))`,
    allowWriteRules,
    denySecrets,
  ].filter(Boolean).join("\n");
  return {
    program: "/usr/bin/sandbox-exec",
    args: ["-p", profile, input.command, ...(input.args ?? [])],
    metadata: { ...base.metadata, seatbeltProfile: profile, executableRequired: "/usr/bin/sandbox-exec" },
  };
}

function windowsRestrictedPlan(input: SandboxCommandRequest, base: Omit<SandboxCommandPlan, "program" | "args" | "cleanup">): Pick<SandboxCommandPlan, "program" | "args" | "metadata"> {
  const payload = {
    command: input.command,
    args: input.args ?? [],
    cwd: base.cwd,
    network: base.network,
    filesystem: base.filesystem,
  };
  return {
    program: "powershell.exe",
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Write-Error 'Praxis Windows sandbox native helper is required for restricted execution'; exit 127",
    ],
    metadata: {
      ...base.metadata,
      helperContract: "praxis.windowsSandbox.restrictedProcess.v1",
      helperPayload: payload,
      providerStatus: "native-helper-required",
    },
  };
}

export async function createSandboxCommandPlan(input: SandboxCommandRequest): Promise<SandboxCommandPlan> {
  const cwd = path.resolve(input.cwd ?? input.filesystem?.workspaceRoot ?? process.cwd());
  const mode = input.sandboxMode ?? defaultModeFor(input.policyProfile);
  const filesystem = normalizeFilesystem(input, cwd);
  const network = input.network ?? defaultNetworkPolicy(input.sandbox);
  const providerFamily = familyFor(input, mode);
  const base: Omit<SandboxCommandPlan, "program" | "args" | "cleanup"> = {
    kind: "runtime.sandboxPlane.command.plan",
    providerFamily,
    requestedProviderFamily: input.sandbox.providerFamily,
    mode,
    applied: mode !== "none",
    policyProfile: input.policyProfile,
    cwd,
    env: asEnvRecord(input.env),
    network,
    filesystem,
    publicSafe: true,
    events: [`runtime.sandboxPlane.command.plan.${providerFamily}`],
    metadata: {
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      invocationId: input.invocationId,
      toolId: input.toolId,
      profile: input.policyProfile,
      sandboxId: input.sandbox.sandboxId,
      ...(input.metadata ?? {}),
    },
  };

  let plan: SandboxCommandPlan;
  if (providerFamily === "linux-bubblewrap") {
    if (input.preparedSandbox?.ready !== true) throw sandboxProviderUnavailable(input, providerFamily);
    plan = { ...base, program: input.command, args: input.args ?? [] };
  } else if (providerFamily === "macos-containerization") {
    if (input.preparedSandbox !== undefined && input.preparedSandbox.ready !== true) throw sandboxProviderUnavailable(input, providerFamily);
    plan = { ...base, ...macosSeatbeltPlan(input, base) };
  } else if (providerFamily === "windows-sandbox") {
    if (input.preparedSandbox !== undefined && input.preparedSandbox.ready !== true) throw sandboxProviderUnavailable(input, providerFamily);
    plan = { ...base, ...windowsRestrictedPlan(input, base) };
  } else {
    plan = {
      ...base,
      program: input.command,
      args: input.args ?? [],
    };
  }

  if (providerFamily === "workspace-rollback") {
    const rollbackPlan = createWorkspaceRollbackSandboxPlan({
      workspaceRoot: filesystem.workspaceRoot,
      sessionId: input.sessionId,
      invocationId: input.invocationId,
    });
    const snapshot = await createWorkspaceRollbackSnapshot(rollbackPlan);
    plan = {
      ...plan,
      workspaceRollback: snapshot,
      events: [...plan.events, "runtime.sandboxPlane.workspaceRollback.snapshotCreated"],
    };
  }
  return plan;
}

function parseSandboxDenial(plan: SandboxCommandPlan, stderr: string, exitCode: number): SandboxCommandDenial | undefined {
  const text = stderr.toLowerCase();
  if (exitCode === 0) return undefined;
  if (text.includes("operation not permitted") || text.includes("permission denied") || text.includes("sandbox") || text.includes("denied")) {
    const network = text.includes("network") || text.includes("socket");
    return {
      kind: "runtime.sandboxPlane.command.denial",
      code: network ? "SANDBOX_NETWORK_DENIED" : "SANDBOX_PERMISSION_DENIED",
      message: network ? "sandbox blocked network access" : "sandbox blocked filesystem or process access",
      needsApproval: true,
      suggestedPermission: network ? { network: true } : { filesystem: "write", paths: plan.filesystem.allowedWriteRoots },
      publicSafe: true,
    };
  }
  if (plan.providerFamily === "windows-sandbox" && exitCode === 127) {
    return {
      kind: "runtime.sandboxPlane.command.denial",
      code: "SANDBOX_PROVIDER_UNAVAILABLE",
      message: "Windows restricted sandbox helper is not available",
      needsApproval: false,
      publicSafe: true,
    };
  }
  return undefined;
}

function providerFromOptions(options: SandboxCommandRunnerOptions): SandboxExecutionProviderPort | undefined {
  if (options.sandboxProvider !== undefined) return options.sandboxProvider;
  const binaryPath = resolveRaxcellBinaryPath();
  return binaryPath === undefined
    ? undefined
    : createRaxcellSandboxProvider({ binaryPath });
}

function toProviderRunRequest(input: SandboxCommandRequest, plan: SandboxCommandPlan): SandboxProviderRunRequest {
  return {
    kind: "runtime.sandboxPlane.provider.runRequest",
    action: {
      actionId: input.invocationId,
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      toolId: input.toolId,
      ownerRuntime: "praxis",
      intentLabel: `${input.toolId} command`,
      metadata: input.metadata ?? {},
    },
    command: {
      argv: [input.command, ...(input.args ?? [])],
      cwd: plan.cwd,
      env: plan.env,
      stdin: null,
    },
    policy: {
      profile: input.policyProfile,
      sandboxId: input.sandbox.sandboxId,
      sandboxMode: plan.mode,
      network: plan.network,
      process: { spawn: true },
      resources: {
        timeoutMs: input.timeoutMs ?? input.sandbox.resourceLimits.timeoutMs,
        maxOutputBytes: input.maxOutputBytes ?? input.sandbox.resourceLimits.maxOutputBytes,
        maxProcesses: input.sandbox.resourceLimits.maxProcesses,
      },
    },
    filesystem: {
      workspaceRoot: plan.filesystem.workspaceRoot,
      read: plan.filesystem.allowedReadRoots,
      write: plan.filesystem.allowedWriteRoots,
      readonlyRoot: plan.filesystem.readonlyRoot,
      protectSecrets: plan.filesystem.protectSecrets,
    },
    policyGrants: input.policyGrants ?? [],
    fallback: { mode: "none" },
    metadata: {
      providerFamily: plan.providerFamily,
      requestedProviderFamily: plan.requestedProviderFamily ?? "",
      policyProfile: plan.policyProfile,
      secretGlobs: plan.filesystem.secretGlobs,
      protectSecrets: plan.filesystem.protectSecrets,
      approvalAccepted: input.approval?.accepted === true,
      approvalGrantedBy: input.approval?.grantedBy ?? null,
    },
  };
}

function grantAccessForGap(gap: SandboxProviderEnvironmentGap): readonly string[] {
  const access = [...new Set((gap.required ?? [])
    .map((value) => value.toLowerCase())
    .filter((value) => value === "read" || value === "write"))];
  return access.length > 0 ? access : ["read"];
}

function defaultEnvironmentGapDecision(context: {
  request: SandboxProviderRunRequest;
  environmentGap: SandboxProviderEnvironmentGap;
}): SandboxPolicyMiddlewareEnvironmentGapDecision {
  const gap = context.environmentGap;
  if (context.request.metadata.approvalAccepted === true && gap.reason === "path-outside-declared-roots") {
    return {
      type: "grant",
      grants: [{
        reason: gap.reason,
        path: gap.path,
        access: grantAccessForGap(gap),
        grantedBy: typeof context.request.metadata.approvalGrantedBy === "string"
          ? context.request.metadata.approvalGrantedBy
          : "praxis-human-approval",
      }],
    };
  }
  if (gap.reason !== "cwd-outside-declared-roots") {
    return { type: "deny", reason: gap.publicSafeMessage };
  }
  const cwd = path.resolve(gap.path);
  const writeRoot = context.request.filesystem.write.find((root) => isInsidePath(root, cwd));
  if (writeRoot !== undefined) {
    return {
      type: "grant",
      grants: [{ reason: gap.reason, path: gap.path, access: ["write"], grantedBy: "praxis-policy" }],
    };
  }
  const readRoot = context.request.filesystem.read.find((root) => isInsidePath(root, cwd));
  if (readRoot !== undefined) {
    return {
      type: "grant",
      grants: [{ reason: gap.reason, path: gap.path, access: ["read"], grantedBy: "praxis-policy" }],
    };
  }
  return { type: "deny", reason: gap.publicSafeMessage };
}

async function runProviderSandboxCommand(
  input: SandboxCommandRequest,
  plan: SandboxCommandPlan,
  options: SandboxCommandRunnerOptions,
): Promise<SandboxCommandRunResult> {
  const provider = providerFromOptions(options);
  if (provider === undefined) {
    return {
      ok: false,
      plan,
      error: {
        code: "SANDBOX_DENIED",
        message: "Raxcell sandbox provider is not configured",
        publicSafe: true,
        denial: {
          kind: "runtime.sandboxPlane.command.denial",
          code: "SANDBOX_PROVIDER_UNAVAILABLE",
          message: "Raxcell sandbox provider is not configured",
          needsApproval: false,
          publicSafe: true,
        },
      },
      events: [...plan.events, "runtime.sandboxPlane.command.denied"],
      metadata: { providerFamily: plan.providerFamily, providerUnavailable: "raxcell provider is not configured" },
    };
  }
  const middlewareResult = await runSandboxPolicyMiddleware({
    provider,
    request: toProviderRunRequest(input, plan),
    decideEnvironmentGap: async ({ request, environmentGap }) =>
      options.decideEnvironmentGap?.({ request, environmentGap }) ?? defaultEnvironmentGapDecision({ request, environmentGap }),
    audit: options.audit,
  });
  if (!middlewareResult.ok) {
    return {
      ok: false,
      plan,
      error: {
        code: "SANDBOX_DENIED",
        message: middlewareResult.error.message,
        publicSafe: true,
        denial: {
          kind: "runtime.sandboxPlane.command.denial",
          code: middlewareResult.error.code === "SANDBOX_PREPARE_FAILED" ? "SANDBOX_PROVIDER_UNAVAILABLE" : "SANDBOX_PERMISSION_DENIED",
          message: middlewareResult.error.message,
          needsApproval: false,
          publicSafe: true,
        },
      },
      stdout: "",
      stderr: "",
      events: [...plan.events, ...middlewareResult.events, "runtime.sandboxPlane.command.denied"],
      metadata: { providerFamily: plan.providerFamily, middlewareError: middlewareResult.error.code },
    };
  }
  return {
    ok: true,
    plan: {
      ...plan,
      metadata: {
        ...plan.metadata,
        providerPrepare: middlewareResult.prepared,
        providerRequest: middlewareResult.request,
      },
    },
    exitCode: middlewareResult.result.exitCode ?? 0,
    stdout: middlewareResult.result.stdout,
    stderr: middlewareResult.result.stderr,
    events: [...plan.events, ...middlewareResult.events, "runtime.sandboxPlane.command.completed"],
    metadata: {
      providerFamily: plan.providerFamily,
      providerId: provider.providerId,
      ...(middlewareResult.result.timedOut ? { timedOut: true } : {}),
      providerRun: {
        denial: middlewareResult.result.denial ?? null,
        filesystemLowering: middlewareResult.result.filesystemLowering ?? null,
      },
    },
  };
}

function spawnPlan(plan: SandboxCommandPlan, input: SandboxCommandRequest): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.program, [...plan.args], {
      cwd: plan.cwd,
      env: { ...process.env, ...plan.env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let terminateTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const settle = (result: { exitCode: number; stdout: string; stderr: string; timedOut?: boolean }): void => {
      if (settled) return;
      settled = true;
      if (terminateTimer !== undefined) clearTimeout(terminateTimer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      resolve(result);
    };
    const max = input.maxOutputBytes ?? input.sandbox.resourceLimits.maxOutputBytes ?? 256_000;
    child.stdout.on("data", (chunk) => { stdout = truncate(stdout + String(chunk), max); });
    child.stderr.on("data", (chunk) => { stderr = truncate(stderr + String(chunk), max); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (terminateTimer !== undefined) clearTimeout(terminateTimer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", (exitCode) => settle({ exitCode: timedOut ? 124 : exitCode ?? 0, stdout, stderr, ...(timedOut ? { timedOut: true } : {}) }));
    const timeout = input.timeoutMs ?? input.sandbox.resourceLimits.timeoutMs;
    if (timeout !== undefined && timeout > 0) {
      terminateTimer = setTimeout(() => {
        timedOut = true;
        stderr = truncate(`${stderr}${stderr.length > 0 ? "\n" : ""}Praxis sandbox command timed out after ${timeout}ms`, max);
        if (!child.killed) child.kill("SIGTERM");
        killTimer = setTimeout(() => {
          if (!settled) child.kill("SIGKILL");
          settle({ exitCode: 124, stdout, stderr, timedOut: true });
        }, 250);
        killTimer.unref();
      }, timeout).unref();
    }
  });
}

export function createLocalSandboxRemoteWorkerAdapter(input: {
  workerId?: string;
} = {}): SandboxRemoteWorkerAdapter {
  return async (request, plan) => {
    const result = await spawnPlan(plan, request);
    return {
      ...result,
      events: ["runtime.sandboxPlane.remoteWorker.localAdapter.completed"],
      metadata: {
        workerId: input.workerId ?? "local-remote-worker",
        adapter: "local",
      },
    };
  };
}

export async function runSandboxCommand(
  input: SandboxCommandRequest,
  options: SandboxCommandRunnerOptions = {},
): Promise<SandboxCommandRunResult> {
  let plan: SandboxCommandPlan | undefined;
  let rollback: WorkspaceRollbackFinalizeResult | undefined;
  try {
    plan = await createSandboxCommandPlan(input);
    if (plan.providerFamily === "remote-worker" && options.remoteWorker === undefined) {
      await plan.cleanup?.();
      return {
        ok: false,
        plan,
        error: {
          code: "SANDBOX_DENIED",
          message: "remote-worker sandbox adapter is not available",
          publicSafe: true,
          denial: {
            kind: "runtime.sandboxPlane.command.denial",
            code: "SANDBOX_PROVIDER_UNAVAILABLE",
            message: "remote-worker sandbox adapter is not available",
            needsApproval: false,
            publicSafe: true,
          },
        },
        events: [...plan.events, "runtime.sandboxPlane.command.denied"],
        metadata: { providerFamily: plan.providerFamily, providerUnavailable: "remote-worker adapter is not configured" },
      };
    }
    if (plan.providerFamily === "linux-bubblewrap") {
      const result = await runProviderSandboxCommand(input, plan, options);
      await plan.cleanup?.();
      return result;
    }
    const remote = plan.providerFamily === "remote-worker"
      ? await options.remoteWorker?.(input, plan)
      : undefined;
    const result = remote ?? await spawnPlan(plan, input);
    if (plan.workspaceRollback !== undefined) {
      rollback = await finalizeWorkspaceRollbackSnapshot(plan.workspaceRollback);
      if (result.exitCode !== 0) await restoreWorkspaceRollbackSnapshot(plan.workspaceRollback, rollback);
    }
    const denial = result.timedOut === true ? undefined : parseSandboxDenial(plan, result.stderr ?? "", result.exitCode);
    await plan.cleanup?.();
    if (denial !== undefined) {
      return {
        ok: false,
        plan,
        error: { code: "SANDBOX_DENIED", message: denial.message, publicSafe: true, denial },
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        rollback,
        events: [...plan.events, ...(remote?.events ?? []), "runtime.sandboxPlane.command.denied"],
        metadata: { ...(remote?.metadata ?? {}), providerFamily: plan.providerFamily, ...(result.timedOut ? { timedOut: true } : {}) },
      };
    }
    return {
      ok: true,
      plan,
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      rollback,
      events: [...plan.events, ...(remote?.events ?? []), "runtime.sandboxPlane.command.completed"],
      metadata: { ...(remote?.metadata ?? {}), providerFamily: plan.providerFamily, ...(result.timedOut ? { timedOut: true } : {}) },
    };
  } catch (error) {
    if (plan?.workspaceRollback !== undefined) {
      rollback = await finalizeWorkspaceRollbackSnapshot(plan.workspaceRollback);
      await restoreWorkspaceRollbackSnapshot(plan.workspaceRollback, rollback);
    }
    await plan?.cleanup?.();
    return {
      ok: false,
      plan,
      error: {
        code: "SANDBOX_COMMAND_FAILED",
        message: error instanceof Error ? error.message : "sandbox command failed",
        publicSafe: true,
      },
      rollback,
      events: [...(plan?.events ?? []), "runtime.sandboxPlane.command.failed"],
      metadata: { providerFamily: plan?.providerFamily },
    };
  }
}
