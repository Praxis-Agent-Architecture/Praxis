import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { evaluateBaseToolRuntimeGovernance } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.js";
import type { BaseToolSupportCatalogEntry } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import { sandbox, toolPolicies } from "../../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.md",
  testFileUrl: import.meta.url,
});

const codeReadEntry: BaseToolSupportCatalogEntry = {
  toolId: "code.read",
  family: "code",
  storageFamily: "codeBase",
  group: "explore",
  title: "Read file",
  riskLevel: "normal",
  permissionHints: [],
  dependencies: [],
  requiredSupports: [],
  readiness: "available",
  storageDocPath: "src/storagePool/baseToolStorage/codeBase/explore",
};

test("BaseTool governance allows bapr policy while preserving host-observed sandbox metadata", () => {
  const decision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.read",
    policyMatrix: toolPolicies.bapr(),
    sandbox: sandbox.hostObserved(),
    catalogEntry: codeReadEntry,
    readiness: {
      toolId: "code.read",
      found: true,
      decision: "requiresApproval",
      readiness: "requiresApproval",
      entry: codeReadEntry,
      blockingSupports: [],
      approvalSupports: [],
      advisorySupports: [],
      events: ["runtime.execEngine.baseTool.readiness.requiresApproval"],
      reason: "workspace read scope needs governance",
    },
  });

  assert.equal(decision.status, "allow");
  assert.equal(decision.approvalRequired, false);
  assert.equal(decision.policyProfile, "bapr");
  assert.equal(decision.sandbox.hostObserved, true);
});

test("BaseTool governance requires approval under restricted policy", () => {
  const decision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.read",
    policyMatrix: toolPolicies.restricted(),
    sandbox: sandbox.hostObserved(),
    catalogEntry: codeReadEntry,
  });

  assert.equal(decision.status, "requiresApproval");
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.risk, "safe");
  assert.equal(decision.matchedRule?.scope, "action");
});

test("BaseTool governance blocks unavailable runtime readiness", () => {
  const decision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.read",
    policyMatrix: toolPolicies.bapr(),
    sandbox: sandbox.hostObserved(),
    catalogEntry: codeReadEntry,
    readiness: {
      toolId: "code.read",
      found: true,
      decision: "blocked",
      readiness: "unavailable",
      entry: codeReadEntry,
      blockingSupports: [],
      approvalSupports: [],
      advisorySupports: [],
      events: ["runtime.execEngine.baseTool.readiness.blocked"],
      reason: "filesystem provider unavailable",
    },
  });

  assert.equal(decision.status, "deny");
  assert.equal(decision.approvalRequired, false);
});
