import assert from "node:assert/strict";
import test from "node:test";

import {
  praxis,
  sandbox,
} from "../../../src/agentCore/index.js";

test("sandbox helpers compile into provider-aware manifest fields", () => {
  class BubblewrapAgent extends praxis.AgentArchetype {
    identity = "agent.sandbox.bwrap";
    model = praxis.model("gpt-5.4");
    sandbox = sandbox.linuxBubblewrap({ resourceLimits: { timeoutMs: 5_000, maxProcesses: 4 } });
    harness = praxis.harness({
      tools: praxis.tools([praxis.basetool.core.shellRun({ profileName: "runtimeCore" })]),
      loop: praxis.loop.single(),
    });
  }

  const result = praxis.compileAgent(BubblewrapAgent, {
    compiledAt: "2026-05-06T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.manifest.sandbox.profile, "linux-bubblewrap");
  assert.equal(result.manifest.sandbox.providerFamily, "linux-bubblewrap");
  assert.equal(result.manifest.sandbox.isolationLevel, "process-namespace");
  assert.deepEqual(result.manifest.sandbox.dependencyRefs, ["dependency.binary.bwrap"]);
  assert.equal(result.manifest.sandbox.resourceLimits.maxProcesses, 4);
  assert.equal(result.manifest.sandbox.resourceLimits.memoryWarningPercent, 85);
  assert.equal(result.manifest.sandbox.metadata?.providerVersion, "v2");
  assert.equal(result.manifest.sandbox.metadata?.fallback, "explicit-only");
  assert.equal(result.manifest.sandbox.metadata?.home, ".rax_workspace/sandbox/home");
  assert.equal(result.manifest.sandbox.metadata?.tmp, ".rax_workspace/sandbox/tmp");
  assert.equal(result.manifest.sandbox.metadata?.artifacts, ".rax_workspace/sandbox/artifacts");
  assert.equal(result.manifest.harness.sandbox.providerFamily, "linux-bubblewrap");
});

test("linux bubblewrap v2 profile variants compile into distinct mount and network policies", () => {
  const defaultBwrap = sandbox.linuxBubblewrap();
  const readonly = sandbox.linuxBubblewrapReadonly();
  const workspaceWrite = sandbox.linuxBubblewrapWorkspaceWrite();
  const networked = sandbox.linuxBubblewrapNetworked();

  assert.equal(defaultBwrap.resourceLimits.maxProcesses, 8192);
  assert.equal(defaultBwrap.resourceLimits.memoryWarningPercent, 85);
  assert.equal(defaultBwrap.mountPolicy?.readonlyRoot, true);
  assert.deepEqual(defaultBwrap.mountPolicy?.allowedWriteRoots, [".rax_workspace/sandbox", ".rax_workspace/sandbox/artifacts"]);

  assert.equal(readonly.metadata?.profileVariant, "readonly");
  assert.equal(readonly.mountPolicy?.readonlyRoot, true);
  assert.deepEqual(readonly.mountPolicy?.allowedWriteRoots, [".rax_workspace/sandbox", ".rax_workspace/artifacts"]);
  assert.equal(readonly.networkPolicy?.outbound, "deny");

  assert.equal(workspaceWrite.metadata?.profileVariant, "workspace-write");
  assert.equal(workspaceWrite.mountPolicy?.readonlyRoot, false);
  assert.deepEqual(workspaceWrite.mountPolicy?.allowedWriteRoots, ["workspace", ".rax_workspace"]);

  assert.equal(networked.metadata?.profileVariant, "networked");
  assert.equal(networked.networkPolicy?.outbound, "allow");
});

test("sandbox runtime provider probes and smoke-tests linux bubblewrap when available", async () => {
  const spec = sandbox.linuxBubblewrap({ resourceLimits: { timeoutMs: 5_000, maxOutputBytes: 16_000 } });
  const prepared = await praxis.sandboxPlane.prepareSandboxRuntime(spec, {
    cwd: process.cwd(),
    runSmoke: true,
  });

  assert.equal(prepared.providerFamily, "linux-bubblewrap");
  assert.equal(prepared.probe.publicSafeMessage.length > 0, true);

  if (process.platform !== "linux") {
    assert.equal(prepared.ready, false);
    assert.equal(prepared.probe.status, "unsupportedPlatform");
    return;
  }

  if (prepared.probe.status === "missingDependency") {
    assert.equal(prepared.ready, false);
    assert.deepEqual(prepared.probe.missingDependencies, ["dependency.binary.bwrap"]);
    assert.equal(prepared.probe.dependencyChecks.some((check) => check.dependencyId === "dependency.binary.bwrap"), true);
    assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "installDependency"), true);
    assert.equal(prepared.probe.dependencyInstallEnvelopes.some((envelope) =>
      envelope.dependencyId === "dependency.binary.bwrap" &&
      envelope.requiresApproval &&
      envelope.approvalSurface === "interface/application"
    ), true);
    assert.equal(prepared.probe.nextAction, "installDependency");
    return;
  }

  if (prepared.smoke?.status === "failed") {
    assert.equal(prepared.ready, false);
    assert.match(prepared.smoke.publicSafeMessage, /bubblewrap/);
    return;
  }

  assert.equal(prepared.ready, true);
  assert.equal(prepared.probe.dependencyChecks.some((check) => check.dependencyId === "dependency.binary.bwrap" && check.status === "available"), true);
  assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "none"), true);
  assert.equal(prepared.smoke?.status, "passed");
  assert.equal(prepared.smoke?.checks?.every((check) => check.status === "passed"), true);
  assert.equal(prepared.smoke?.metadata.networkMode, "denied");
  assert.equal(prepared.smoke?.metadata.deviceExposure, "minimal");
  assert.equal(typeof prepared.smoke?.metadata.sandboxRoot, "string");
});

test("contract-only sandbox providers explain readiness instead of pretending to run", async () => {
  const spec = sandbox.windowsSandbox();
  const prepared = await praxis.sandboxPlane.prepareSandboxRuntime(spec, { runSmoke: true });

  assert.equal(prepared.ready, false);
  if (process.platform === "win32") {
    assert.equal(prepared.probe.status, "contractOnly");
    assert.equal(prepared.probe.nextAction, "installDependency");
    assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "installDependency" && hint.requiresApproval), true);
    assert.equal(prepared.probe.dependencyInstallEnvelopes.some((envelope) =>
      envelope.dependencyId === "dependency.praxis.windowsSandboxHelper" &&
      envelope.installTarget === "provider-managed" &&
      envelope.requiresApproval &&
      envelope.approvalSurface === "interface/application"
    ), true);
    return;
  }
  assert.equal(prepared.probe.status, "unsupportedPlatform");
  assert.equal(prepared.probe.nextAction, "chooseDifferentProfile");
});
