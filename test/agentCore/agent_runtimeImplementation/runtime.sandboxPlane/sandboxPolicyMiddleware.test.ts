import assert from "node:assert/strict";
import test from "node:test";

import {
  runSandboxPolicyMiddleware,
  type SandboxExecutionProviderPort,
  type SandboxProviderRunRequest,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxPolicyMiddleware.js";

function provider(input: {
  prepareRun?: SandboxExecutionProviderPort["prepareRun"];
  run?: SandboxExecutionProviderPort["run"];
} = {}): SandboxExecutionProviderPort {
  return {
    providerId: "test-provider",
    providerFamily: "linux-bubblewrap",
    async prepareRun(request) {
      return input.prepareRun?.(request) ?? {
        kind: "runtime.sandboxPlane.provider.prepareRunResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        filesystemLowering: {
          declaredRoots: request.filesystem.read.map((path) => ({ path, access: "read" as const, source: "declared" as const })),
          runtimeRoots: [],
          policyGrants: request.policyGrants,
          warnings: [],
        },
        backendArtifacts: [],
        metadata: {},
      };
    },
    async run(request) {
      return input.run?.(request) ?? {
        kind: "runtime.sandboxPlane.provider.runResult",
        ok: true,
        providerFamily: "linux-bubblewrap",
        exitCode: 0,
        stdout: `ran:${request.command.argv.join(" ")}`,
        stderr: "",
        timedOut: false,
        filesystemLowering: null,
        metadata: {},
      };
    },
  };
}

function request(input: Partial<SandboxProviderRunRequest> = {}): SandboxProviderRunRequest {
  return {
    kind: "runtime.sandboxPlane.provider.runRequest",
    action: {
      actionId: "call-1",
      runtimeId: "runtime-1",
      sessionId: "session-1",
      toolId: "shell.run",
      ownerRuntime: "praxis",
      intentLabel: "shell command",
      metadata: {},
    },
    command: {
      argv: ["sh", "-lc", "printf ok"],
      cwd: "/workspace/project",
      env: {},
      stdin: null,
    },
    policy: {
      profile: "standard",
      sandboxId: "sandbox.linuxBubblewrap",
      sandboxMode: "isolated",
      network: "deny",
      process: { spawn: true },
      resources: { timeoutMs: 1000 },
    },
    filesystem: {
      workspaceRoot: "/workspace/project",
      read: ["/workspace/project"],
      write: ["/workspace/project/.rax_workspace"],
      readonlyRoot: true,
      protectSecrets: true,
    },
    policyGrants: [],
    fallback: { mode: "none" },
    metadata: {},
    ...input,
  };
}

test("sandbox policy middleware treats provider policyDecision as an environment gap and applies Praxis grants", async () => {
  const seen: SandboxProviderRunRequest[] = [];
  const events: unknown[] = [];
  const result = await runSandboxPolicyMiddleware({
    provider: provider({
      async prepareRun(runRequest) {
        seen.push(runRequest);
        if (runRequest.policyGrants.length === 0) {
          return {
            kind: "runtime.sandboxPlane.provider.prepareRunResult",
            ok: false,
            providerFamily: "linux-bubblewrap",
            environmentGap: {
              reason: "cwd-outside-declared-roots",
              path: runRequest.command.cwd,
              required: ["filesystem.read"],
              publicSafeMessage: "cwd needs upper runtime grant",
            },
            denial: {
              code: "POLICY_DECISION_REQUIRED",
              message: "upper runtime grant required",
              publicSafe: true,
            },
            filesystemLowering: null,
            backendArtifacts: [],
            metadata: {},
          };
        }
        return {
          kind: "runtime.sandboxPlane.provider.prepareRunResult",
          ok: true,
          providerFamily: "linux-bubblewrap",
          filesystemLowering: {
            declaredRoots: [],
            runtimeRoots: [],
            policyGrants: runRequest.policyGrants,
            warnings: [],
          },
          backendArtifacts: [],
          metadata: {},
        };
      },
    }),
    request: request({ filesystem: { ...request().filesystem, read: [], write: [] } }),
    decideEnvironmentGap: async ({ environmentGap }) => ({
      type: "grant",
      grants: [{
        reason: environmentGap.reason,
        path: environmentGap.path,
        access: ["read"],
        grantedBy: "praxis-policy",
      }],
    }),
    audit: async (event) => { events.push(event); },
  });

  assert.equal(result.ok, true);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1]?.policyGrants, [{
    reason: "cwd-outside-declared-roots",
    path: "/workspace/project",
    access: ["read"],
    grantedBy: "praxis-policy",
  }]);
  assert.equal(events.some((event) => JSON.stringify(event).includes("runtime.sandbox.middleware.policyApplied")), true);
});

test("sandbox policy middleware denies provider environment gaps when Praxis policy denies", async () => {
  const result = await runSandboxPolicyMiddleware({
    provider: provider({
      async prepareRun(runRequest) {
        return {
          kind: "runtime.sandboxPlane.provider.prepareRunResult",
          ok: false,
          providerFamily: "linux-bubblewrap",
          environmentGap: {
            reason: "cwd-outside-declared-roots",
            path: runRequest.command.cwd,
            required: ["filesystem.write"],
            publicSafeMessage: "cwd needs upper runtime grant",
          },
          denial: {
            code: "POLICY_DECISION_REQUIRED",
            message: "upper runtime grant required",
            publicSafe: true,
          },
          filesystemLowering: null,
          backendArtifacts: [],
          metadata: {},
        };
      },
    }),
    request: request(),
    decideEnvironmentGap: async () => ({ type: "deny", reason: "Praxis policy denied cwd grant" }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SANDBOX_DENIED");
  assert.match(result.error.message, /Praxis policy denied/u);
});
