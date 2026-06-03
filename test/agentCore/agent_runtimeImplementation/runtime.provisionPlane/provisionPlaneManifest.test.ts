import assert from "node:assert/strict";
import test from "node:test";

import {
  PraxisAgent,
  compileAgent,
  harness,
  loop,
  model,
  policy,
  praxis,
  sandbox,
  tools,
} from "../../../../src/agentCore/index.js";

class CapabilityAgent extends PraxisAgent {
  identity = "agent.capability.manifest";
  model = model("gpt-5.4");
  sandbox = sandbox.linuxBubblewrapReadonly();
  capabilities = praxis.capabilities([
    praxis.capability.sandbox({ isolation: "strong", fallback: false }),
    praxis.capability.codeIntelligence({ languages: ["typescript"] }),
    praxis.dependency.binary("rg"),
  ]);
  harness = harness({
    tools: tools([]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 0 }),
  });
}

class RootlessContainerAgent extends PraxisAgent {
  identity = "agent.rootless.container";
  model = model("gpt-5.4");
  sandbox = sandbox.rootlessContainer();
  harness = harness({
    tools: tools([]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 0 }),
  });
}

class RemoteWorkerAgent extends PraxisAgent {
  identity = "agent.remote.worker";
  model = model("gpt-5.4");
  sandbox = sandbox.remoteWorker();
  harness = harness({
    tools: tools([]),
    policy: policy({ allowProviderCall: true, allowToolExecution: true }),
    loop: loop.standard({ maxModelTurns: 1, maxToolCalls: 0 }),
  });
}

test("compileAgent preserves capability and dependency declarations as manifest facts", () => {
  const result = compileAgent(CapabilityAgent, { compiledAt: "2026-05-25T00:00:00.000Z" });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const capabilityIds = result.manifest.capabilities.map((capability) => capability.capabilityId);
  assert.ok(capabilityIds.includes("capability.sandbox.strong"));
  assert.ok(capabilityIds.includes("capability.codeIntelligence"));
  assert.ok(result.manifest.capabilities.some((capability) => capability.metadata?.source === "legacy-sandbox-field"));

  const dependencyIds = result.manifest.dependencies.map((dependency) => dependency.dependencyId);
  assert.ok(dependencyIds.includes("dependency.binary.raxcell"));
  assert.ok(dependencyIds.includes("dependency.binary.rg"));
  assert.deepEqual(result.manifest.harness.capabilities, result.manifest.capabilities);
  assert.deepEqual(result.manifest.harness.dependencies, result.manifest.dependencies);
});

test("built-in sandbox manifest dependencies have registered dependency sources", () => {
  for (const agent of [RootlessContainerAgent, RemoteWorkerAgent]) {
    const result = compileAgent(agent, { compiledAt: "2026-05-25T00:00:00.000Z" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;

    for (const dependency of result.manifest.dependencies) {
      const source = praxis.dependencyPlane.lookupDependencySource(dependency.dependencyId);
      assert.equal(source.ok, true, `${dependency.dependencyId} should be registered`);
    }
  }
});

test("createProvisionPlan expands profiles into official components and deduplicated dependencies", () => {
  const result = compileAgent(CapabilityAgent, { compiledAt: "2026-05-25T00:00:00.000Z" });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const plan = praxis.provision.createProvisionPlan({
    capabilities: result.manifest.capabilities,
    dependencies: result.manifest.dependencies,
    mode: "prepareTrusted",
  });

  assert.equal(plan.mode, "prepareTrusted");
  assert.ok(plan.components.some((component) => component.componentId === "component.lsp.typescript"));
  assert.ok(plan.dependencies.some((dependency) => dependency.dependencyId === "dependency.lsp.typescriptLanguageServer"));
  assert.equal(
    plan.dependencies.filter((dependency) => dependency.dependencyId === "dependency.binary.raxcell").length,
    1,
  );
  assert.deepEqual(plan.missingComponents, []);
  assert.equal(plan.readiness, "ready");
});

test("createProvisionPlan canonicalizes direct dependency ids before deduplication", () => {
  const plan = praxis.provision.createProvisionPlan({
    capabilities: [
      praxis.capability.sandbox({ isolation: "strong", fallback: false }),
    ],
    dependencies: [
      {
        dependencyId: "binary:bwrap",
        kind: "binary",
        required: true,
      },
    ],
  });

  assert.equal(
    plan.dependencies.filter((dependency) => dependency.dependencyId === "dependency.binary.bwrap").length,
    1,
  );
  assert.equal(plan.dependencies.some((dependency) => dependency.dependencyId === "binary:bwrap"), false);
});

test("createProvisionPlan preserves unknown custom dependency kinds", () => {
  const plan = praxis.provision.createProvisionPlan({
    dependencies: [
      praxis.dependency.custom("vendor.customAnalyzer", {
        kind: "custom",
        required: true,
        sourceRef: "project:custom-analyzer",
      }),
    ],
  });

  assert.equal(plan.dependencies.length, 1);
  assert.equal(plan.dependencies[0]?.dependencyId, "vendor.customAnalyzer");
  assert.equal(plan.dependencies[0]?.kind, "custom");
  assert.equal(plan.dependencies[0]?.sourceRef, "project:custom-analyzer");
});

test("strong sandbox capability stays platform-neutral until provision planning", () => {
  const capability = praxis.capability.sandbox({ isolation: "strong", fallback: false });
  assert.deepEqual(capability.componentRefs, [
    "component.sandbox.bubblewrap",
    "component.sandbox.appleSandbox",
    "component.sandbox.windowsSandbox",
  ]);

  const macPlan = praxis.provision.createProvisionPlan({
    capabilities: [capability],
    platform: "darwin",
  });
  assert.deepEqual(macPlan.components.map((component) => component.componentId), ["component.sandbox.appleSandbox"]);
  assert.equal(macPlan.dependencies.some((dependency) => dependency.dependencyId === "dependency.macos.containerization"), true);
  assert.equal(macPlan.dependencies.some((dependency) => dependency.dependencyId === "dependency.binary.bwrap"), false);

  const linuxPlan = praxis.provision.createProvisionPlan({
    capabilities: [capability],
    platform: "linux",
  });
  assert.deepEqual(linuxPlan.components.map((component) => component.componentId), ["component.sandbox.bubblewrap"]);
  assert.equal(linuxPlan.dependencies.some((dependency) => dependency.dependencyId === "dependency.binary.raxcell"), true);
  assert.equal(linuxPlan.dependencies.some((dependency) => dependency.dependencyId === "dependency.macos.containerization"), false);
});

test("sandbox capability object fallback respects explicit fallback choices", () => {
  const capability = praxis.capability.sandbox({
    isolation: "strong",
    fallback: {
      componentIds: ["component.test.customFallback"],
      allowWorkspaceRollback: false,
    },
  });

  assert.equal(capability.componentRefs.includes("component.sandbox.workspaceRollback"), false);
  assert.equal(capability.componentRefs.includes("component.test.customFallback"), true);

  const registry = praxis.componentPlane.createRuntimeComponentRegistry({
    custom: [{
      componentId: "component.test.customFallback",
      kind: "sandbox",
      dependencies: [{ dependencyId: "dependency.binary.rg", kind: "binary", required: false }],
    }],
  });
  const plan = praxis.provision.createProvisionPlan({
    registry,
    capabilities: [capability],
    platform: "linux",
  });

  assert.equal(plan.components.some((component) => component.componentId === "component.sandbox.workspaceRollback"), false);
  assert.equal(plan.components.some((component) => component.componentId === "component.test.customFallback"), true);
});

test("createProvisionPlan does not block when missing alternative components are not needed on the target platform", () => {
  const registry = praxis.componentPlane.createRuntimeComponentRegistry({
    official: [
      praxis.component.sandbox.bubblewrap(),
    ],
  });

  const plan = praxis.provision.createProvisionPlan({
    registry,
    capabilities: [
      praxis.capability.sandbox({ isolation: "strong", fallback: false }),
    ],
    platform: "linux",
  });

  assert.equal(plan.readiness, "ready");
  assert.deepEqual(plan.components.map((component) => component.componentId), ["component.sandbox.bubblewrap"]);
  assert.deepEqual(plan.missingComponents, []);
});

test("createProvisionPlan does not let direct dependencies weaken required component dependencies", () => {
  const registry = praxis.componentPlane.createRuntimeComponentRegistry({
    official: [{
      componentId: "component.test.requiredSandbox",
      kind: "sandbox",
      title: "Required sandbox component",
      dependencies: [{ dependencyId: "binary:bwrap", kind: "binary", required: true }],
    }],
  });
  const plan = praxis.provision.createProvisionPlan({
    registry,
    capabilities: [{
      capabilityId: "capability.test.requiredSandbox",
      kind: "sandbox",
      required: true,
      fallback: false,
      componentRefs: ["component.test.requiredSandbox"],
      dependencies: [],
    }],
    dependencies: [{
      dependencyId: "binary:bwrap",
      kind: "custom",
      required: false,
      metadata: { declaredBy: "direct" },
    }],
  });

  const dependency = plan.dependencies.find((item) => item.dependencyId === "dependency.binary.bwrap");
  assert.ok(dependency);
  assert.equal(dependency.kind, "binary");
  assert.equal(dependency.required, true);
  assert.equal(dependency.metadata?.declaredBy, "direct");
});

test("createProvisionPlan lets required-by-default direct dependencies strengthen optional components", () => {
  const registry = praxis.componentPlane.createRuntimeComponentRegistry({
    official: [{
      componentId: "component.test.optionalMedia",
      kind: "work",
      title: "Optional work component",
      dependencies: [{ dependencyId: "dependency.binary.ffmpeg", kind: "binary", required: false }],
    }],
  });
  const plan = praxis.provision.createProvisionPlan({
    registry,
    capabilities: [{
      capabilityId: "capability.test.optionalMedia",
      kind: "work",
      required: true,
      fallback: false,
      componentRefs: ["component.test.optionalMedia"],
      dependencies: [],
    }],
    dependencies: [
      praxis.dependency.binary("ffmpeg"),
    ],
  });

  const dependency = plan.dependencies.find((item) => item.dependencyId === "dependency.binary.ffmpeg");
  assert.ok(dependency);
  assert.equal(dependency.required, true);
});

test("createProvisionPlan reports missing components instead of silently marking ready", () => {
  const blocked = praxis.provision.createProvisionPlan({
    capabilities: [{
      capabilityId: "capability.test.missing",
      kind: "custom",
      required: true,
      fallback: false,
      componentRefs: ["component.notRegistered"],
      dependencies: [],
    }],
  });

  assert.equal(blocked.readiness, "blocked");
  assert.deepEqual(blocked.missingComponents, [{
    capabilityId: "capability.test.missing",
    componentId: "component.notRegistered",
    required: true,
  }]);
  assert.equal(blocked.events.includes("runtime.provision.component.missing"), true);

  const degraded = praxis.provision.createProvisionPlan({
    capabilities: [{
      capabilityId: "capability.test.optionalMissing",
      kind: "custom",
      required: false,
      fallback: false,
      componentRefs: ["component.optionalMissing"],
      dependencies: [],
    }],
  });
  assert.equal(degraded.readiness, "degraded");
});
