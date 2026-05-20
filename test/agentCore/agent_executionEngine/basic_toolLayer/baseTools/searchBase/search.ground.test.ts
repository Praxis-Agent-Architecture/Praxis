import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import type { BaseToolExecutorPort } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  planSearchGround,
  searchGroundDescriptor,
  type SearchGroundExecutor,
} from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.js";
import { createHostExecutorSearchGroundProvider } from "../../../../../../src/storagePool/baseToolStorage/searchBase/search.ground/dependencies.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.md",
  testFileUrl: import.meta.url,
});

const evidence = [{ id: "doc-1", url: "https://example.com/agent-core", title: "agentCore", excerpt: "The basic tool layer contains search primitives." }];

test("planSearchGround creates a dry-run factual grounding envelope", async () => {
  let providerCalled = false;
  const result = await planSearchGround({
    target: { claim: "Praxis has search primitives.", evidence, mode: "strict" },
    context: { grantedPermissions: ["search:read", "grounding:audit"] },
    executor: (() => {
      providerCalled = true;
      return { grounded: true, status: "grounded", confidence: "high", citations: [], sources: [] };
    }) satisfies SearchGroundExecutor,
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  assert.equal(searchGroundDescriptor.defaultDryRun, true);
  if (!result.ok) throw new Error("expected dry-run");
  assert.equal(result.output.dispatch, "dry-run");
  assert.equal(result.output.resultEnvelope.status, "requires-review");
  assert.equal(result.output.resultEnvelope.evidenceLedger.length, 1);
});

test("planSearchGround rejects malformed input, missing claim/evidence, and invalid evidence", async () => {
  const malformed = await planSearchGround(null as never);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, "INVALID_REQUEST");

  const missing = await planSearchGround();
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "MISSING_CLAIM");

  const noEvidence = await planSearchGround({ target: { claim: "A claim" } });
  assert.equal(noEvidence.ok, false);
  if (!noEvidence.ok) assert.equal(noEvidence.error.code, "MISSING_EVIDENCE");

  const badUrl = await planSearchGround({ target: { claim: "A claim", evidence: [{ url: "file:///tmp/source.txt" }] } });
  assert.equal(badUrl.ok, false);
  if (!badUrl.ok) assert.equal(badUrl.error.code, "INVALID_EVIDENCE_URL");

  const badContext = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { invocationId: 1 } as never,
  });
  assert.equal(badContext.ok, false);
  if (!badContext.ok) assert.equal(badContext.error.code, "INVALID_CONTEXT");
});

test("planSearchGround requires permission, guard, and provider for real execution", async () => {
  const missingPermission = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { grantedPermissions: ["search:read"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  let providerCalled = false;
  const noGuard = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { dryRun: false, grantedPermissions: ["search:read", "grounding:audit"] },
    executor: (() => {
      providerCalled = true;
      return { grounded: true, status: "grounded", confidence: "high", citations: [], sources: [] };
    }) satisfies SearchGroundExecutor,
  });
  assert.equal(noGuard.ok, false);
  assert.equal(providerCalled, false);
  if (!noGuard.ok) assert.equal(noGuard.error.code, "GOVERNANCE_REJECTED");

  const noProvider = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:read", "grounding:audit"] },
  });
  assert.equal(noProvider.ok, false);
  if (!noProvider.ok) assert.equal(noProvider.error.code, "PROVIDER_UNAVAILABLE");

  const noGrants = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { dryRun: false, guard: { accepted: true } },
    executor: (() => ({ grounded: true, status: "grounded", confidence: "high", citations: [], sources: [] })) satisfies SearchGroundExecutor,
  });
  assert.equal(noGrants.ok, false);
  if (!noGrants.ok) assert.equal(noGrants.error.code, "PERMISSION_DENIED");
});

test("planSearchGround executes through injected provider and maps provider failures safely", async () => {
  const executed = await planSearchGround({
    target: { claim: "A claim", evidence, provider: "openai", citations: "required" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:read", "grounding:audit"] },
    executor: (() => ({
      answer: "Grounded answer.",
      grounded: true,
      status: "grounded",
      confidence: "high",
      citations: [{ url: " https://example.com/agent-core ", providerReference: "url_citation" }],
      sources: [{ url: "https://example.com/agent-core", title: " AgentCore " }],
      providerMetadata: { route: "fake" },
    })) satisfies SearchGroundExecutor,
  });
  assert.equal(executed.ok, true);
  if (!executed.ok) throw new Error("expected execution");
  assert.equal(executed.output.dispatch, "runtime-ground");
  assert.equal(executed.output.resultEnvelope.grounded, true);
  assert.equal(executed.output.resultEnvelope.citations[0]?.url, "https://example.com/agent-core");

  const failed = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:read", "grounding:audit"] },
    executor: (() => {
      throw new Error("secret stack");
    }) satisfies SearchGroundExecutor,
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error.code, "PROVIDER_REJECTED");
});

test("search.ground dependency adapter and registry handler invoke runtime network.ground", async () => {
  let received: Parameters<NonNullable<NonNullable<BaseToolExecutorPort["network"]>["ground"]>>[0] | undefined;
  const provider = createHostExecutorSearchGroundProvider({
    network: {
      async ground(request) {
        received = request;
        return { ok: true, output: { grounded: true, status: "grounded", confidence: "high", citations: [], sources: [] } };
      },
    },
  });
  assert.notEqual(provider, undefined);
  const result = await planSearchGround({
    target: { claim: "A claim", evidence },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:read", "grounding:audit"] },
    executor: provider,
  });
  assert.equal(result.ok, true);
  assert.equal(received?.claim, "A claim");

  const lookup = createBaseToolRegistry().lookupHandler("search.ground");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error("registry failed");
  let runtimeCalled = false;
  const handlerResult = await lookup.handler.invoke({
    toolCallId: "ground-handler-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { target: { claim: "A claim", evidence }, context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["search:read", "grounding:audit"] } },
    executor: {
      network: {
        async ground() {
          runtimeCalled = true;
          return { ok: true, output: { grounded: true, status: "grounded", confidence: "high", citations: [], sources: [] } };
        },
      },
    },
  });
  assert.equal(runtimeCalled, true);
  assert.equal(handlerResult.ok, true);
});
