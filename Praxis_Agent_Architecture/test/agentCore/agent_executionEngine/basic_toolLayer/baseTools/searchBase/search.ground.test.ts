import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planSearchGround,
  searchGroundDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.ground.md",
  testFileUrl: import.meta.url,
});

test("planSearchGround creates a dry-run factual grounding plan", () => {
  const result = planSearchGround({
    context: {
      runtimeId: "runtime-1",
      invocationId: "ground-1",
      requestedScopes: ["tool:search:ground"],
      allowedScopes: ["tool:search:ground"],
    },
    claim: "Praxis agentCore has a basic tool layer.",
    evidence: [
      {
        id: "doc-1",
        url: "https://example.com/agent-core",
        title: "agentCore notes",
        excerpt: "The basic tool layer contains search and omni primitives.",
      },
    ],
    mode: "strict",
  });

  assert.equal(result.ok, true);
  assert.equal(searchGroundDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.toolId, "search.ground");
  assert.equal(result.plan.mode, "strict");
  assert.equal(result.plan.evidenceLedger.length, 1);
  assert.equal(result.plan.evidenceLedger[0]?.id, "doc-1");
  assert.equal(result.plan.outputEnvelope.status, "requires-review");
  assert.equal(result.plan.outputEnvelope.grounded, false);
  assert.equal(result.plan.wouldCompareEvidence, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.deepEqual(result.plan.acceptedScopes, ["tool:search:ground"]);
});

test("planSearchGround rejects missing claim, missing evidence, and real grounding", () => {
  const missing = planSearchGround();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noClaim = planSearchGround({
    context: { runtimeId: "runtime-1" },
    evidence: [{ excerpt: "source excerpt" }],
  });
  assert.equal(noClaim.ok, false);
  if (!noClaim.ok) {
    assert.equal(noClaim.error.code, "MISSING_CLAIM");
  }

  const noEvidence = planSearchGround({
    context: { runtimeId: "runtime-1" },
    claim: "A test claim",
  });
  assert.equal(noEvidence.ok, false);
  if (!noEvidence.ok) {
    assert.equal(noEvidence.error.code, "MISSING_EVIDENCE");
  }

  const real = planSearchGround({
    context: { runtimeId: "runtime-1", dryRun: false },
    claim: "A test claim",
    evidence: [{ excerpt: "source excerpt" }],
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_GROUNDING_NOT_ALLOWED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planSearchGround validates evidence URLs and minimum evidence count", () => {
  const badUrl = planSearchGround({
    context: { runtimeId: "runtime-1" },
    claim: "A test claim",
    evidence: [{ url: "file:///tmp/source.txt" }],
  });
  assert.equal(badUrl.ok, false);
  if (!badUrl.ok) {
    assert.equal(badUrl.error.code, "INVALID_EVIDENCE_URL");
    assert.equal(badUrl.error.boundary, "scope");
  }

  const count = planSearchGround({
    context: { runtimeId: "runtime-1" },
    claim: "A test claim",
    evidence: [{ excerpt: "source excerpt" }],
    minimumEvidenceCount: 2,
  });
  assert.equal(count.ok, false);
  if (!count.ok) {
    assert.equal(count.error.code, "INVALID_MINIMUM_EVIDENCE_COUNT");
    assert.equal(count.error.boundary, "resource");
  }
});
