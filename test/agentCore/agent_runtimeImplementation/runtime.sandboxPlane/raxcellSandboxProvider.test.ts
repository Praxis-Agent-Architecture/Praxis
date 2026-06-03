import assert from "node:assert/strict";
import test from "node:test";

import {
  createRaxcellSandboxProvider,
  mapSandboxProviderRequestToRaxcell,
} from "../../../../src/runtimeImplementation/runtime.sandboxPlane/raxcellSandboxProvider.js";
import type { SandboxProviderRunRequest } from "../../../../src/runtimeImplementation/runtime.sandboxPlane/sandboxPolicyMiddleware.js";

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
      metadata: { approvalScopeKey: "shell.run:command:abc" },
    },
    command: {
      argv: ["sh", "-lc", "printf ok"],
      cwd: "/workspace/project",
      env: { A: "1", OMIT: undefined },
      stdin: null,
    },
    policy: {
      profile: "standard",
      sandboxId: "sandbox.linuxBubblewrap",
      sandboxMode: "isolated",
      network: "deny",
      process: { spawn: true },
      resources: { timeoutMs: 1000, maxOutputBytes: 4096 },
    },
    filesystem: {
      workspaceRoot: "/workspace/project",
      read: ["/workspace/project"],
      write: ["/workspace/project/.rax_workspace"],
      readonlyRoot: true,
      protectSecrets: true,
    },
    policyGrants: [{
      reason: "cwd-outside-declared-roots",
      path: "/workspace/project",
      access: ["read"],
      grantedBy: "praxis-policy",
    }],
    fallback: { mode: "none" },
    metadata: { sandboxPlanStatus: "ready" },
    ...input,
  };
}

test("Raxcell provider mapper preserves Praxis policy signal without inventing policy", () => {
  const mapped = mapSandboxProviderRequestToRaxcell(request());

  assert.equal(mapped.kind, "raxcell.run.v1");
  assert.deepEqual(mapped.backendPreference, ["linux-bubblewrap"]);
  assert.deepEqual(mapped.policyGrants, [{
    reason: "cwd-outside-declared-roots",
    path: "/workspace/project",
    access: ["read"],
    grantedBy: "praxis-policy",
  }]);
  assert.equal(mapped.action.ownerRuntime, "praxis");
  assert.equal(mapped.action.metadata?.toolId, "shell.run");
  assert.deepEqual(mapped.command.env, { A: "1" });
  assert.deepEqual(mapped.enforcement.filesystem, {
    read: ["/workspace/project"],
    write: ["/workspace/project/.rax_workspace"],
  });
  assert.equal(mapped.enforcement.network, "deny");
  assert.deepEqual(mapped.fallback, { mode: "none" });
});

test("Raxcell provider normalizes prepareRun policyDecision into an environment gap", async () => {
  const seen: unknown[] = [];
  const provider = createRaxcellSandboxProvider({
    client: {
      async prepareRun(runRequest) {
        seen.push(runRequest);
        return {
          kind: "raxcell.prepareRunResult.v1",
          ok: false,
          backend: "linux-bubblewrap",
          denial: {
            code: "POLICY_DECISION_REQUIRED",
            message: "upper runtime grant required",
            publicSafe: true,
          },
          policyDecision: {
            reason: "cwd-outside-declared-roots",
            path: "/workspace/project",
            required: ["filesystem.read"],
            publicSafeMessage: "cwd requires upper runtime grant",
          },
          filesystemLowering: null,
          backendArtifacts: [],
          capabilityReport: null,
        };
      },
      async run() {
        throw new Error("run should not be called");
      },
    },
  });

  const prepared = await provider.prepareRun(request());

  assert.equal(seen.length, 1);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.environmentGap?.reason, "cwd-outside-declared-roots");
  assert.equal(prepared.denial?.code, "POLICY_DECISION_REQUIRED");
});
