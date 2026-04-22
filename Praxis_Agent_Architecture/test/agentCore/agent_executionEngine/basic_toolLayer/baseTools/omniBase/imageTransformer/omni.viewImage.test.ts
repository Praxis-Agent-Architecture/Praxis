import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  omniViewImageDescriptor,
  planOmniViewImage,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/imageTransformer/omni.viewImage.md",
  testFileUrl: import.meta.url,
});

test("planOmniViewImage creates a guarded dry-run image view envelope", () => {
  const result = planOmniViewImage({
    target: {
      imagePath: "/workspace/assets/preview.png",
      mediaType: "image/png",
      detail: "original",
      maxBytes: 1_000_000,
    },
    context: {
      invocationId: "view-1",
      allowedImageRoots: ["/workspace/assets"],
      grantedPermissions: ["filesystem:read", "omni:image:view"],
      requestedScopes: ["tool:omni:image:view"],
      allowedScopes: ["tool:omni:image:view"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(omniViewImageDescriptor.defaultDryRun, true);
  assert.equal(result.output.kind, "agentCore.basicTool.omni.viewImage");
  assert.equal(result.output.target.imagePath, "/workspace/assets/preview.png");
  assert.equal(result.output.viewEnvelope.opened, false);
  assert.equal(result.output.viewEnvelope.detail, "original");
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "view-1");
});

test("planOmniViewImage rejects missing input, scope gaps, and real execution", () => {
  const missing = planOmniViewImage();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_IMAGE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const deniedScope = planOmniViewImage({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: {
      allowedImageRoots: ["/workspace/other"],
    },
  });
  assert.equal(deniedScope.ok, false);
  if (!deniedScope.ok) {
    assert.equal(deniedScope.error.code, "IMAGE_PATH_OUT_OF_SCOPE");
    assert.equal(deniedScope.error.boundary, "scope");
  }

  const realExecution = planOmniViewImage({
    target: { imagePath: "/workspace/assets/preview.png" },
    context: { dryRun: false },
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
