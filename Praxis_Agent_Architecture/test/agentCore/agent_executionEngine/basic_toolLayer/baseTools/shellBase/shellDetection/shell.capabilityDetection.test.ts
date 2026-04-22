import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  planShellCapabilityDetection,
  shellCapabilityDetectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.md",
  testFileUrl: import.meta.url,
});

test("planShellCapabilityDetection returns inferred shell capability findings", () => {
  const result = planShellCapabilityDetection({
    target: {
      shellExecutable: " /bin/bash ",
      requestedCapabilities: ["pipeline", "job-control"],
      reportedVersion: "5.2",
    },
    context: {
      invocationId: " detect-shell ",
      allowedShellExecutables: ["/bin/bash"],
      grantedPermissions: ["shell:detect"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.capabilityDetection");
  assert.equal(result.output.target.shellExecutable, "/bin/bash");
  assert.equal(result.output.target.shellKind, "bash");
  assert.deepEqual(result.output.requestedCapabilities, ["pipeline", "job-control"]);
  assert.equal(result.output.findings.every((finding) => finding.status === "supported"), true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(shellCapabilityDetectionDescriptor.unsafeSideEffects, false);
});

test("planShellCapabilityDetection rejects empty input and out-of-scope shells", () => {
  const missing = planShellCapabilityDetection();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing shell executable should fail");
  }
  assert.equal(missing.error.code, "MISSING_SHELL_EXECUTABLE");
  assert.equal(missing.error.boundary, "input");

  const outOfScope = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/zsh" },
    context: { allowedShellExecutables: ["/bin/bash"] },
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("out-of-scope shell should fail");
  }
  assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
});

test("planShellCapabilityDetection rejects blank explicit shell kind", () => {
  const result = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash", shellKind: "   " },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("blank shell kind should fail instead of being inferred");
  }
  assert.equal(result.error.code, "INVALID_SHELL_KIND");
  assert.equal(result.error.boundary, "input");
});

test("planShellCapabilityDetection blocks real probing and enforces permissions when supplied", () => {
  const missingPermission = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { grantedPermissions: ["shell:probe"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("missing shell:detect should fail");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realProbe = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false },
  });

  assert.equal(realProbe.ok, false);
  if (realProbe.ok) {
    assert.fail("real shell probing should be blocked");
  }
  assert.equal(realProbe.error.code, "REAL_PROBE_BLOCKED");
});
