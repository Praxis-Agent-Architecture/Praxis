import assert from "node:assert/strict";
import test from "node:test";

import {
  PraxisAgent,
  compileAgent,
  harness,
  loop,
  model,
} from "../../../src/agentCore/index.js";
import { planRaxDeveloperCommand } from "../../../src/rax_packageManager/raxDeveloperCommandContract.js";

class RaxContractAgent extends PraxisAgent {
  identity = "agent.rax.contract";
  model = model("gpt-5.4");
  harness = harness({
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 0 }),
  });
}

test("rax developer command contract plans inspect/test/run/build without runtime backdoors", () => {
  const compiled = compileAgent(RaxContractAgent, {
    compiledAt: "2026-05-04T00:00:00.000Z",
    manifestId: "manifest.rax.contract",
  });
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const inspect = planRaxDeveloperCommand({
    command: "inspect",
    input: { kind: "manifest", manifest: compiled.manifest },
    runtimeId: "runtime.rax",
  });

  assert.equal(inspect.ok, true);
  if (!inspect.ok) return;
  assert.equal(inspect.plan.usesPublicAgentCoreApi, true);
  assert.equal(inspect.plan.unsafeSideEffects, false);
  assert.deepEqual(inspect.plan.steps, ["resolve-input", "validate-manifest", "inspect-manifest"]);
  assert.equal(inspect.plan.manifestInspection?.identityId, "agent.rax.contract");

  const run = planRaxDeveloperCommand({
    command: "run",
    input: { kind: "agentFile", path: "agent.ts", exportName: "default" },
    cwd: "/workspace/project",
  });

  assert.equal(run.ok, true);
  if (!run.ok) return;
  assert.equal(run.plan.execution, "runManifest");
  assert.deepEqual(run.plan.steps, ["resolve-input", "compile-agent", "validate-manifest", "run-manifest"]);

  const dryTest = planRaxDeveloperCommand({
    command: "test",
    input: { kind: "agentFile", path: "agent.ts" },
  });
  assert.equal(dryTest.ok, true);
  if (dryTest.ok) {
    assert.deepEqual(dryTest.plan.steps, [
      "resolve-input",
      "compile-agent",
      "validate-manifest",
      "inspect-manifest",
      "readiness-check",
    ]);
    assert.equal(dryTest.plan.execution, "dry-run");
  }

  const dev = planRaxDeveloperCommand({
    command: "dev",
    input: { kind: "agentFile", path: "agent.ts" },
  });
  assert.equal(dev.ok, true);
  if (dev.ok) {
    assert.equal(dev.plan.steps.includes("watch"), true);
    assert.equal(dev.plan.execution, "runManifest");
  }

  const build = planRaxDeveloperCommand({
    command: "build",
    input: { kind: "manifest", manifest: compiled.manifest },
  });
  assert.equal(build.ok, true);
  if (build.ok) {
    assert.deepEqual(build.plan.steps, ["resolve-input", "validate-manifest", "emit-manifest"]);
  }
});

test("rax developer command contract keeps package and remote resolution deferred", () => {
  const packageInput = planRaxDeveloperCommand({
    command: "inspect",
    input: { kind: "package", packageName: "tap/office" },
  });

  assert.equal(packageInput.ok, false);
  if (!packageInput.ok) {
    assert.equal(packageInput.error.code, "PACKAGE_INSTALL_DEFERRED");
    assert.equal(packageInput.error.publicSafe, true);
  }

  const missingAgentFile = planRaxDeveloperCommand({
    command: "run",
    input: { kind: "agentFile", path: " " },
  });

  assert.equal(missingAgentFile.ok, false);
  if (!missingAgentFile.ok) {
    assert.equal(missingAgentFile.error.code, "MISSING_AGENT_FILE");
    assert.equal(missingAgentFile.error.internalDetailExposed, false);
  }
});
