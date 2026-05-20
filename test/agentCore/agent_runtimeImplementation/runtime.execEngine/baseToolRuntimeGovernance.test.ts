import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import { evaluateBaseToolRuntimeGovernance } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.js";
import type { BaseToolSupportCatalogEntry } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolSupportCatalog.js";
import { sandbox, toolPolicies } from "../../../../src/agentCore/agent_runtimeImplementation/runtimeAgentManifest.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtime.execEngine/baseToolRuntimeGovernance.md",
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

const shellDangerousEntry: BaseToolSupportCatalogEntry = {
  toolId: "shell.commandExecution",
  family: "shell",
  storageFamily: "shellBase",
  group: "shellExecution",
  title: "Run shell command",
  riskLevel: "dangerous",
  permissionHints: ["shell:execute"],
  dependencies: [],
  requiredSupports: [],
  readiness: "available",
  storageDocPath: "src/storagePool/baseToolStorage/shellBase/shellExecution",
};

const codeOverwriteEntry: BaseToolSupportCatalogEntry = {
  toolId: "code.overwrite",
  family: "code",
  storageFamily: "codeBase",
  group: "edit",
  title: "Overwrite file",
  riskLevel: "risky",
  permissionHints: ["filesystem:write"],
  dependencies: [],
  requiredSupports: [],
  readiness: "available",
  storageDocPath: "src/storagePool/baseToolStorage/codeBase/edit",
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

test("BaseTool governance keeps five-mode decisions as the sandbox governance source", () => {
  const bapr = evaluateBaseToolRuntimeGovernance({
    toolId: "shell.commandExecution",
    policyMatrix: toolPolicies.bapr(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: shellDangerousEntry,
  });
  const yolo = evaluateBaseToolRuntimeGovernance({
    toolId: "shell.commandExecution",
    policyMatrix: toolPolicies.yolo(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: shellDangerousEntry,
  });
  const standard = evaluateBaseToolRuntimeGovernance({
    toolId: "shell.commandExecution",
    policyMatrix: toolPolicies.standard(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: shellDangerousEntry,
  });
  const restricted = evaluateBaseToolRuntimeGovernance({
    toolId: "shell.commandExecution",
    policyMatrix: toolPolicies.restricted(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: shellDangerousEntry,
  });

  assert.equal(bapr.status, "allow");
  assert.equal(yolo.status, "requiresApproval");
  assert.equal(standard.status, "requiresApproval");
  assert.equal(restricted.status, "requiresApproval");
  assert.equal(standard.sandbox.providerFamily, "linux-bubblewrap");
  assert.equal(standard.sandbox.hostObserved, false);
  assert.equal(standard.approvalReason, "BaseTool shell.commandExecution requires approval under standard policy");
});

test("BaseTool governance relaxes new file creation without relaxing overwrite/delete policy", () => {
  const createDecision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.overwrite",
    policyMatrix: toolPolicies.standard(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: codeOverwriteEntry,
    metadata: { filesystemAction: "create" },
  });
  const overwriteDecision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.overwrite",
    policyMatrix: toolPolicies.standard(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: codeOverwriteEntry,
    metadata: { filesystemAction: "overwrite" },
  });
  const restrictedCreateDecision = evaluateBaseToolRuntimeGovernance({
    toolId: "code.overwrite",
    policyMatrix: toolPolicies.restricted(),
    sandbox: sandbox.linuxBubblewrapReadonly(),
    catalogEntry: codeOverwriteEntry,
    metadata: { filesystemAction: "create" },
  });

  assert.equal(createDecision.status, "allow");
  assert.equal(overwriteDecision.status, "requiresApproval");
  assert.equal(restrictedCreateDecision.status, "requiresApproval");
});
