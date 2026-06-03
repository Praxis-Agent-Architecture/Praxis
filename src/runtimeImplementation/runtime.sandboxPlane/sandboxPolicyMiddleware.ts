/*
 * 文件定位：Agent 运行态实现层 / 沙箱策略中间件。
 * 核心目的：把 Praxis policy/governance/approval 的结果翻译给可插拔沙箱 provider。
 * 边界：本文件不替代 policy matrix，不实现沙箱 backend；provider 只报告环境事实并执行。
 */

import type { BaseToolPolicyProfile } from "../runtimeAgentManifest.js";
import type { SandboxCommandNetworkPolicy } from "./sandboxCommandRunner.js";

export type SandboxProviderFamily =
  | "host-observed"
  | "workspace-policy"
  | "workspace-rollback"
  | "linux-bubblewrap"
  | "macos-containerization"
  | "windows-sandbox"
  | "remote-worker"
  | "external";

export type SandboxProviderPolicyGrant = {
  reason: string;
  path: string;
  access?: readonly string[];
  grantedBy?: string | null;
};

export type SandboxProviderFilesystemLoweredRoot = {
  path: string;
  access: "read" | "write" | "runtime" | "scratch" | "runtime-link";
  source: "declared" | "backend-runtime" | "policy-grant";
};

export type SandboxProviderFilesystemLoweringReport = {
  declaredRoots: readonly SandboxProviderFilesystemLoweredRoot[];
  runtimeRoots: readonly SandboxProviderFilesystemLoweredRoot[];
  policyGrants: readonly SandboxProviderPolicyGrant[];
  warnings: readonly { code: string; message: string }[];
};

export type SandboxProviderBackendArtifact = {
  backend: SandboxProviderFamily;
  format: string;
  arguments: readonly string[];
  data: Readonly<Record<string, unknown>>;
  warnings: readonly { code: string; message: string }[];
};

export type SandboxProviderEnvironmentGap = {
  reason: string;
  path: string;
  required?: readonly string[];
  publicSafeMessage: string;
};

export type SandboxProviderDenial = {
  code: string;
  message: string;
  publicSafe: true;
};

export type SandboxProviderRunRequest = {
  kind: "runtime.sandboxPlane.provider.runRequest";
  action: {
    actionId: string;
    runtimeId: string;
    sessionId: string;
    toolId: string;
    ownerRuntime: "praxis" | string;
    intentLabel: string;
    metadata: Readonly<Record<string, unknown>>;
  };
  command: {
    argv: readonly string[];
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    stdin: string | null;
  };
  policy: {
    profile: BaseToolPolicyProfile;
    sandboxId: string;
    sandboxMode: "none" | "workspace-rollback" | "isolated";
    network: SandboxCommandNetworkPolicy;
    process: Readonly<Record<string, unknown>>;
    resources: Readonly<Record<string, unknown>>;
  };
  filesystem: {
    workspaceRoot: string;
    read: readonly string[];
    write: readonly string[];
    readonlyRoot: boolean;
    protectSecrets: boolean;
  };
  policyGrants: readonly SandboxProviderPolicyGrant[];
  fallback: {
    mode: string;
  };
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxProviderPrepareRunResult = {
  kind: "runtime.sandboxPlane.provider.prepareRunResult";
  ok: boolean;
  providerFamily: SandboxProviderFamily;
  denial?: SandboxProviderDenial | null;
  environmentGap?: SandboxProviderEnvironmentGap | null;
  filesystemLowering?: SandboxProviderFilesystemLoweringReport | null;
  backendArtifacts: readonly SandboxProviderBackendArtifact[];
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxProviderRunResult = {
  kind: "runtime.sandboxPlane.provider.runResult";
  ok: boolean;
  providerFamily: SandboxProviderFamily;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  denial?: SandboxProviderDenial | null;
  environmentGap?: SandboxProviderEnvironmentGap | null;
  filesystemLowering?: SandboxProviderFilesystemLoweringReport | null;
  metadata: Readonly<Record<string, unknown>>;
};

export type SandboxExecutionProviderPort = {
  providerId: string;
  providerFamily: SandboxProviderFamily;
  prepareRun(request: SandboxProviderRunRequest): Promise<SandboxProviderPrepareRunResult>;
  run(request: SandboxProviderRunRequest): Promise<SandboxProviderRunResult>;
};

export type SandboxPolicyMiddlewareEnvironmentGapDecision =
  | { type: "grant"; grants: readonly SandboxProviderPolicyGrant[] }
  | { type: "rewrite"; request: SandboxProviderRunRequest; reason: string }
  | { type: "deny"; reason: string };

export type SandboxPolicyMiddlewareResult =
  | {
      ok: true;
      request: SandboxProviderRunRequest;
      prepared: SandboxProviderPrepareRunResult;
      result: SandboxProviderRunResult;
      events: readonly string[];
    }
  | {
      ok: false;
      request: SandboxProviderRunRequest;
      prepared?: SandboxProviderPrepareRunResult;
      error: {
        code: "SANDBOX_PREPARE_FAILED" | "SANDBOX_DENIED" | "SANDBOX_RUN_FAILED";
        message: string;
        publicSafe: true;
        denial?: SandboxProviderDenial | null;
      };
      events: readonly string[];
    };

export type SandboxPolicyMiddlewareAuditEvent = {
  type: string;
  actionId: string;
  sessionId: string;
  toolId: string;
  providerId: string;
  providerFamily: SandboxProviderFamily;
  payload: Readonly<Record<string, unknown>>;
};

export const sandboxPolicyMiddlewareDescriptor = {
  surface: "runtime.sandboxPlane.sandboxPolicyMiddleware",
  policyOwner: "praxis",
  providerRole: "environment-and-execution",
  publicSafe: true,
} as const;

function appendGrant(
  request: SandboxProviderRunRequest,
  grants: readonly SandboxProviderPolicyGrant[],
): SandboxProviderRunRequest {
  return {
    ...request,
    policyGrants: [...request.policyGrants, ...grants],
  };
}

function prepareFailureMessage(prepared: SandboxProviderPrepareRunResult): string {
  return prepared.environmentGap?.publicSafeMessage
    ?? prepared.denial?.message
    ?? "sandbox provider prepareRun failed";
}

async function audit(
  input: {
    audit?: (event: SandboxPolicyMiddlewareAuditEvent) => Promise<void> | void;
    provider: SandboxExecutionProviderPort;
    request: SandboxProviderRunRequest;
    type: string;
    payload: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  await input.audit?.({
    type: input.type,
    actionId: input.request.action.actionId,
    sessionId: input.request.action.sessionId,
    toolId: input.request.action.toolId,
    providerId: input.provider.providerId,
    providerFamily: input.provider.providerFamily,
    payload: input.payload,
  });
}

export async function runSandboxPolicyMiddleware(input: {
  provider: SandboxExecutionProviderPort;
  request: SandboxProviderRunRequest;
  decideEnvironmentGap?: (context: {
    request: SandboxProviderRunRequest;
    prepared: SandboxProviderPrepareRunResult;
    environmentGap: SandboxProviderEnvironmentGap;
  }) => Promise<SandboxPolicyMiddlewareEnvironmentGapDecision> | SandboxPolicyMiddlewareEnvironmentGapDecision;
  audit?: (event: SandboxPolicyMiddlewareAuditEvent) => Promise<void> | void;
}): Promise<SandboxPolicyMiddlewareResult> {
  let request = input.request;
  const events: string[] = [];
  let prepared = await input.provider.prepareRun(request);
  events.push("runtime.sandbox.middleware.prepareRun");
  await audit({
    ...input,
    request,
    type: "runtime.sandbox.middleware.prepareRun",
    payload: {
      ok: prepared.ok,
      environmentGap: prepared.environmentGap ?? null,
      denial: prepared.denial ?? null,
      filesystemLowering: prepared.filesystemLowering ?? null,
      backendArtifacts: prepared.backendArtifacts,
    },
  });

  if (!prepared.ok && prepared.environmentGap !== undefined && prepared.environmentGap !== null) {
    const decision = await input.decideEnvironmentGap?.({
      request,
      prepared,
      environmentGap: prepared.environmentGap,
    }) ?? { type: "deny" as const, reason: prepared.environmentGap.publicSafeMessage };
    events.push(`runtime.sandbox.middleware.policyApplied.${decision.type}`);
    await audit({
      ...input,
      request,
      type: "runtime.sandbox.middleware.policyApplied",
      payload: {
        decision: decision.type,
        reason: "reason" in decision ? decision.reason : undefined,
        grants: "grants" in decision ? decision.grants : undefined,
      },
    });

    if (decision.type === "deny") {
      return {
        ok: false,
        request,
        prepared,
        error: {
          code: "SANDBOX_DENIED",
          message: decision.reason,
          publicSafe: true,
          denial: prepared.denial,
        },
        events,
      };
    }
    request = decision.type === "grant" ? appendGrant(request, decision.grants) : decision.request;
    prepared = await input.provider.prepareRun(request);
    events.push("runtime.sandbox.middleware.prepareRun.afterPolicy");
    await audit({
      ...input,
      request,
      type: "runtime.sandbox.middleware.prepareRun.afterPolicy",
      payload: {
        ok: prepared.ok,
        environmentGap: prepared.environmentGap ?? null,
        denial: prepared.denial ?? null,
        filesystemLowering: prepared.filesystemLowering ?? null,
        backendArtifacts: prepared.backendArtifacts,
      },
    });
  }

  if (!prepared.ok) {
    return {
      ok: false,
      request,
      prepared,
      error: {
        code: "SANDBOX_PREPARE_FAILED",
        message: prepareFailureMessage(prepared),
        publicSafe: true,
        denial: prepared.denial,
      },
      events,
    };
  }

  const result = await input.provider.run(request);
  events.push("runtime.sandbox.provider.run");
  await audit({
    ...input,
    request,
    type: "runtime.sandbox.provider.run",
    payload: {
      ok: result.ok,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      denial: result.denial ?? null,
      environmentGap: result.environmentGap ?? null,
      filesystemLowering: result.filesystemLowering ?? null,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      request,
      prepared,
      error: {
        code: "SANDBOX_RUN_FAILED",
        message: result.denial?.message ?? "sandbox provider run failed",
        publicSafe: true,
        denial: result.denial,
      },
      events,
    };
  }

  return { ok: true, request, prepared, result, events };
}
