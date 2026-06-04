/*
 * 文件定位：Agent 运行态实现层 / Raxcell 官方沙箱 provider。
 * 核心目的：把 Praxis sandbox provider-neutral request 映射到 Raxcell prepareRun/run 协议。
 * 边界：Raxcell 只提供环境事实与执行；策略、审批、fallback 决策仍归 Praxis middleware。
 */

import { RaxcellClient } from "@praxis-ai/raxcell";
import type {
  BackendFamily,
  FileSystemLoweringReport,
  PrepareRunResponse,
  RunRequest,
  RunResponse,
} from "@praxis-ai/raxcell";

import type {
  SandboxExecutionProviderPort,
  SandboxProviderBackendArtifact,
  SandboxProviderDenial,
  SandboxProviderEnvironmentGap,
  SandboxProviderFamily,
  SandboxProviderFilesystemLoweringReport,
  SandboxProviderPolicyGrant,
  SandboxProviderPrepareRunResult,
  SandboxProviderRunRequest,
  SandboxProviderRunResult,
} from "./sandboxPolicyMiddleware.js";

export type RaxcellClientLike = Pick<RaxcellClient, "prepareRun" | "run">;

export type RaxcellSandboxProviderOptions =
  | { client: RaxcellClientLike; providerId?: string }
  | { binaryPath: string; providerId?: string };

export const raxcellSandboxProviderDescriptor = {
  surface: "runtime.sandboxPlane.raxcellSandboxProvider",
  providerFamily: "linux-bubblewrap",
  policyOwner: "praxis",
  role: "environment-and-execution",
} as const;

function clientFromOptions(options: RaxcellSandboxProviderOptions): RaxcellClientLike {
  if ("client" in options) return options.client;
  return new RaxcellClient({ binaryPath: options.binaryPath });
}

function cleanEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) output[key] = value;
  }
  return output;
}

function networkForRaxcell(value: SandboxProviderRunRequest["policy"]["network"]): string {
  if (value === "allow" || value === "deny") return value;
  return "deny";
}

function grantForRaxcell(grant: SandboxProviderPolicyGrant): NonNullable<RunRequest["policyGrants"]>[number] {
  return {
    reason: grant.reason,
    path: grant.path,
    access: grant.access === undefined ? undefined : [...grant.access],
    grantedBy: grant.grantedBy ?? null,
  };
}

export function mapSandboxProviderRequestToRaxcell(request: SandboxProviderRunRequest): RunRequest {
  return {
    kind: "raxcell.run.v1",
    backendPreference: ["linux-bubblewrap"],
    policyGrants: request.policyGrants.map(grantForRaxcell),
    action: {
      actionId: request.action.actionId,
      ownerRuntime: request.action.ownerRuntime,
      intentLabel: request.action.intentLabel,
      metadata: {
        runtimeId: request.action.runtimeId,
        sessionId: request.action.sessionId,
        toolId: request.action.toolId,
        policyProfile: request.policy.profile,
        sandboxId: request.policy.sandboxId,
        sandboxMode: request.policy.sandboxMode,
        ...request.action.metadata,
        ...request.metadata,
      },
    },
    command: {
      argv: [...request.command.argv],
      cwd: request.command.cwd,
      env: cleanEnv(request.command.env),
      stdin: request.command.stdin,
    },
    enforcement: {
      profile: request.policy.profile,
      filesystem: {
        read: [...request.filesystem.read],
        write: [...request.filesystem.write],
      },
      network: networkForRaxcell(request.policy.network),
      process: request.policy.process,
      resources: request.policy.resources,
    },
    fallback: request.fallback,
  };
}

function providerFamily(value: BackendFamily | null): SandboxProviderFamily {
  if (value === "linux-bubblewrap") return "linux-bubblewrap";
  if (value === "host-observed") return "host-observed";
  if (value === "external") return "external";
  return "external";
}

function denial(value: PrepareRunResponse["denial"] | RunResponse["denial"]): SandboxProviderDenial | null {
  if (value === null || value === undefined) return null;
  return {
    code: value.code,
    message: value.message,
    publicSafe: true,
  };
}

function environmentGap(
  value:
    | PrepareRunResponse["environmentGap"]
    | PrepareRunResponse["policyDecision"]
    | RunResponse["environmentGap"]
    | RunResponse["policyDecision"],
): SandboxProviderEnvironmentGap | null {
  if (value === null || value === undefined) return null;
  return {
    reason: value.reason,
    path: value.path ?? "",
    required: value.required,
    publicSafeMessage: value.publicSafeMessage,
  };
}

function filesystemLowering(value: FileSystemLoweringReport | null | undefined): SandboxProviderFilesystemLoweringReport | null {
  if (value === null || value === undefined) return null;
  return {
    declaredRoots: value.declaredRoots,
    runtimeRoots: value.runtimeRoots,
    policyGrants: value.policyGrants,
    warnings: value.warnings,
    effects: value.effects,
  };
}

function backendArtifacts(value: PrepareRunResponse["backendArtifacts"]): readonly SandboxProviderBackendArtifact[] {
  return value.map((artifact) => ({
    backend: providerFamily(artifact.backend),
    format: artifact.format,
    arguments: artifact.arguments,
    data: artifact.data,
    warnings: artifact.warnings,
  }));
}

function prepareResult(value: PrepareRunResponse): SandboxProviderPrepareRunResult {
  return {
    kind: "runtime.sandboxPlane.provider.prepareRunResult",
    ok: value.ok,
    providerFamily: providerFamily(value.backend),
    denial: denial(value.denial),
    environmentGap: environmentGap(value.environmentGap ?? value.policyDecision),
    filesystemLowering: filesystemLowering(value.filesystemLowering),
    backendArtifacts: backendArtifacts(value.backendArtifacts),
    metadata: {
      raxcellKind: value.kind,
      capabilityReport: value.capabilityReport,
    },
  };
}

function runResult(value: RunResponse): SandboxProviderRunResult {
  return {
    kind: "runtime.sandboxPlane.provider.runResult",
    ok: value.ok,
    providerFamily: providerFamily(value.backend),
    exitCode: value.exitCode,
    stdout: value.stdout,
    stderr: value.stderr,
    timedOut: value.timedOut,
    denial: denial(value.denial),
    environmentGap: environmentGap(value.environmentGap ?? value.policyDecision),
    filesystemLowering: filesystemLowering(value.filesystemLowering),
    metadata: {
      raxcellKind: value.kind,
      fallback: value.fallback,
      capabilityReport: value.capabilityReport,
    },
  };
}

export function createRaxcellSandboxProvider(options: RaxcellSandboxProviderOptions): SandboxExecutionProviderPort {
  const client = clientFromOptions(options);
  return {
    providerId: options.providerId ?? "raxcell",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      return prepareResult(await client.prepareRun(mapSandboxProviderRequestToRaxcell(request)));
    },
    async run(request) {
      return runResult(await client.run(mapSandboxProviderRequestToRaxcell(request)));
    },
  };
}
