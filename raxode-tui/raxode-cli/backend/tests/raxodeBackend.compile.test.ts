import assert from "node:assert/strict";
import test from "node:test";

import { praxis } from "@praxis-ai/praxis";
import {
  createRaxodeBackend as createRaxodeBackendFromPraxisExport,
  inspectRaxodeBackendReadinessWithLocalProbe as inspectRaxodeReadinessFromPraxisExport,
  raxodeApplication,
} from "@praxis-ai/praxis/raxode";
import type { RaxodeBackendReadiness as RaxodeBackendReadinessFromPraxisExport } from "@praxis-ai/praxis/raxode/contracts";

import RaxodeCodingAgent from "../agents/codingAgent/agent.js";
import RaxodeTuiAgent from "../agents/tuiAgent/agent.js";

test("raxode coding agent compiles as an agentCore application agent", () => {
  const compiled = praxis.compileAgent(new RaxodeCodingAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  assert.equal(compiled.manifest.identity.id, "agent.raxode.coding");
  assert.equal(compiled.manifest.model.model, "gpt-5.5");
  assert.equal(compiled.manifest.model.reasoning?.effort, "low");
  assert.equal(compiled.manifest.model.metadata?.contextWindowTokens, 400_000);
  assert.equal(compiled.manifest.model.metadata?.maxInputTokens, 272_000);
  assert.equal(compiled.manifest.model.metadata?.usableInputTokens, 258_400);
  assert.equal(compiled.manifest.modelFleet.endpoints.primary?.metadata?.contextWindowTokens, 400_000);
  assert.equal(compiled.manifest.toolPolicy.profile, "permissive");
  assert.equal(compiled.manifest.harness.metadata?.toolProfile, "agentCore");
  assert.equal(compiled.manifest.harness.tools.length, 27);
  assert.deepEqual(compiled.manifest.dependencies.map((dependency) => dependency.dependencyId), [
    "dependency.binary.node",
    "dependency.npm.tsx",
    "dependency.binary.raxcell",
    "dependency.secret.provider.core.main",
  ]);
  assert.ok(compiled.manifest.capabilities.some((capability) => capability.capabilityId === "capability.raxode.sandbox"));
});

test("raxode tui agent compiles as a tool-free structured auxiliary agent", () => {
  const compiled = praxis.compileAgent(new RaxodeTuiAgent());
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  assert.equal(compiled.manifest.identity.id, "agent.raxode.tui");
  assert.equal(compiled.manifest.model.model, "gpt-5.4-mini");
  assert.equal(compiled.manifest.model.reasoning?.effort, "low");
  assert.equal(compiled.manifest.toolPolicy.defaultDecision, "deny");
  assert.equal(compiled.manifest.harness.tools.length, 0);
  assert.equal(compiled.manifest.session.persistence, "memory");
});

test("raxode coding agent carries configured Anthropic messages route into the manifest", () => {
  const compiled = praxis.compileAgent(new RaxodeCodingAgent({
    provider: "anthropic",
    endpointShape: "messages",
    baseURL: "https://api.anthropic.com",
    providerRoute: "anthropic_messages",
    model: "claude-test",
    reasoningEffort: "low",
    maxOutputTokens: 777,
  }));
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  assert.equal(compiled.manifest.model.provider, "anthropic");
  assert.equal(compiled.manifest.model.endpointShape, "messages");
  assert.equal(compiled.manifest.model.baseURL, "https://api.anthropic.com");
  assert.equal(compiled.manifest.model.metadata?.providerRoute, "anthropic_messages");
  assert.equal(compiled.manifest.model.metadata?.maxOutputTokens, 777);
  assert.equal(compiled.manifest.modelFleet.endpoints.primary?.endpoint, "/v1/messages");
  assert.equal(compiled.manifest.modelFleet.endpoints.primary?.provider, "anthropic");
  assert.equal(compiled.manifest.modelFleet.endpoints.primary?.metadata?.maxOutputTokens, 777);
});

test("raxode tui agent carries configured OpenAI chat completions route into the manifest", () => {
  const compiled = praxis.compileAgent(new RaxodeTuiAgent({
    provider: "openai",
    endpointShape: "chat_completions",
    baseURL: "https://api.openai.com/v1",
    providerRoute: "openai_chat_completions",
    model: "gpt-4o",
    reasoningEffort: "low",
  }));
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  assert.equal(compiled.manifest.model.provider, "openai");
  assert.equal(compiled.manifest.model.endpointShape, "chat_completions");
  assert.equal(compiled.manifest.model.baseURL, "https://api.openai.com/v1");
  assert.equal(compiled.manifest.model.metadata?.providerRoute, "openai_chat_completions");
  assert.equal(compiled.manifest.modelFleet.endpoints.primary?.endpoint, "/v1/chat/completions");
});

test("Praxis package exports the Raxode backend and shared contracts", () => {
  const readiness: RaxodeBackendReadinessFromPraxisExport = inspectRaxodeReadinessFromPraxisExport({
    now: () => "2026-05-10T00:00:00.000Z",
    localProbe: {
      nodeVersion: "v22.22.3",
      resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
    },
  });

  assert.equal(typeof createRaxodeBackendFromPraxisExport, "function");
  assert.equal(readiness.kind, "raxode.backendReadiness");
  assert.equal(readiness.probe?.sandbox.status, "not-required");
  assert.ok(readiness.dependencies.some((dependency) =>
    dependency.dependencyId === "dependency.npm.tsx" && dependency.probe?.status === "ready"));
  assert.equal(raxodeApplication.kind, "raxode.applicationDescriptor");
  assert.equal(raxodeApplication.configuration.defaultPolicyProfile, "permissive");
  assert.equal(raxodeApplication.configuration.defaultToolProfile, "agentCore");
  assert.equal(raxodeApplication.readiness.eventId, "raxode.backend.readiness");
  assert.deepEqual(raxodeApplication.readiness.moduleIds, readiness.moduleInventory.modules.map((module) => module.moduleId));
  assert.ok(raxodeApplication.runtimePorts.includes("approvalResolver"));
  assert.ok(raxodeApplication.runtimePorts.includes("liveProviderResolver"));
});
