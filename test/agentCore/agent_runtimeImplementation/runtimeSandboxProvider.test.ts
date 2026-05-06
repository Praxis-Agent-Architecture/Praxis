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
      tools: praxis.tools([praxis.baseTools.shell.commandExecution()]),
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
  assert.deepEqual(result.manifest.sandbox.dependencyRefs, ["binary:bwrap"]);
  assert.equal(result.manifest.harness.sandbox.providerFamily, "linux-bubblewrap");
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
    assert.deepEqual(prepared.probe.missingDependencies, ["binary:bwrap"]);
    assert.equal(prepared.probe.dependencyChecks.some((check) => check.dependencyId === "binary:bwrap"), true);
    assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "installDependency"), true);
    assert.equal(prepared.probe.nextAction, "installDependency");
    return;
  }

  if (prepared.smoke?.status === "failed") {
    assert.equal(prepared.ready, false);
    assert.match(prepared.smoke.publicSafeMessage, /bubblewrap/);
    return;
  }

  assert.equal(prepared.ready, true);
  assert.equal(prepared.probe.dependencyChecks.some((check) => check.dependencyId === "binary:bwrap" && check.status === "available"), true);
  assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "none"), true);
  assert.equal(prepared.smoke?.status, "passed");
});

test("contract-only sandbox providers explain readiness instead of pretending to run", async () => {
  const spec = sandbox.windowsSandbox();
  const prepared = await praxis.sandboxPlane.prepareSandboxRuntime(spec, { runSmoke: true });

  assert.equal(prepared.ready, false);
  assert.equal(prepared.probe.status, "contractOnly");
  assert.equal(prepared.probe.nextAction, "manualProviderSetup");
  assert.equal(prepared.probe.selfRepairHints.some((hint) => hint.action === "manualProviderSetup"), true);
});
