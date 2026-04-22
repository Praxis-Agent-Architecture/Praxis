import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  omniVideoFormatConversionDescriptor,
  planOmniVideoFormatConversion,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoFormatConversion.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoFormatConversion.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/omniBase/videoTransformer/omni.videoFormatConversion.md",
  testFileUrl: import.meta.url,
});

test("planOmniVideoFormatConversion creates a guarded dry-run conversion envelope", () => {
  const result = planOmniVideoFormatConversion({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.webm",
      targetFormat: "webm",
      codecHint: "vp9",
      preserveMetadata: false,
    },
    context: {
      invocationId: "convert-1",
      allowedVideoRoots: ["/workspace/video"],
      grantedPermissions: ["filesystem:read", "filesystem:write", "omni:video:transform"],
      requestedScopes: ["tool:omni:video:transform"],
      allowedScopes: ["tool:omni:video:transform"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(omniVideoFormatConversionDescriptor.defaultDryRun, true);
  assert.equal(result.output.kind, "agentCore.basicTool.omni.videoFormatConversion");
  assert.equal(result.output.target.targetFormat, "webm");
  assert.equal(result.output.conversionEnvelope.inputRead, false);
  assert.equal(result.output.conversionEnvelope.outputWritten, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "convert-1");
});

test("planOmniVideoFormatConversion rejects missing format, unsupported format, and real execution", () => {
  const missingFormat = planOmniVideoFormatConversion({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.webm",
    },
  });
  assert.equal(missingFormat.ok, false);
  if (!missingFormat.ok) {
    assert.equal(missingFormat.error.code, "MISSING_TARGET_FORMAT");
    assert.equal(missingFormat.error.boundary, "input");
  }

  const unsupported = planOmniVideoFormatConversion({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.avi",
      targetFormat: "avi" as "mp4",
    },
  });
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.code, "INVALID_TARGET_FORMAT");
  }

  const realExecution = planOmniVideoFormatConversion({
    target: {
      inputPath: "/workspace/video/source.mov",
      outputPath: "/workspace/video/source.mp4",
      targetFormat: "mp4",
    },
    context: { dryRun: false },
  });
  assert.equal(realExecution.ok, false);
  if (!realExecution.ok) {
    assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(realExecution.error.boundary, "contract");
  }
});
