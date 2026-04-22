import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  nativeSearchDescriptor,
  planNativeSearch,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/searchBase/search.nativeSearch.md",
  testFileUrl: import.meta.url,
});

test("planNativeSearch creates a scoped dry-run local search plan", () => {
  const result = planNativeSearch({
    target: {
      query: "agentCore",
      rootPath: "/repo/src",
      includeHidden: true,
      maxResults: 12,
      fileGlobs: ["*.ts", "  *.md  "],
    },
    context: {
      invocationId: "native-1",
      allowedRoots: ["/repo"],
      grantedPermissions: ["filesystem:read", "search:native"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(nativeSearchDescriptor.defaultDryRun, true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.output.permissionsRequired, ["filesystem:read", "search:native"]);
  assert.deepEqual(result.output.commandPreview.slice(0, 2), ["rg", "--line-number"]);
  assert.equal(result.output.target.rootPath, "/repo/src");
  assert.deepEqual(result.output.target.fileGlobs, ["*.ts", "*.md"]);
  assert.deepEqual(result.output.resultEnvelope.matches, []);
  assert.deepEqual(result.events, ["basicTool.search.nativeSearch.dryRun"]);
});

test("planNativeSearch rejects missing inputs, denied scope, and real execution", () => {
  const missing = planNativeSearch();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_QUERY");
  assert.equal(missing.error.boundary, "input");

  const scoped = planNativeSearch({
    target: { query: "x", rootPath: "/outside" },
    context: { allowedRoots: ["/repo"] },
  });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.error.code, "SCOPE_REJECTED");
  assert.equal(scoped.error.boundary, "scope");

  const real = planNativeSearch({
    target: { query: "x", rootPath: "/repo" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});

test("planNativeSearch rejects missing explicit permissions when governance supplies a grant list", () => {
  const result = planNativeSearch({
    target: { query: "agent", rootPath: "/repo" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PERMISSION_DENIED");
  assert.equal(result.error.boundary, "permission");
  assert.match(result.error.message, /search:native/);
});
