import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../agentCoreContractTestHelper.js";
import {
  planSkillRipgrep,
  skillRipgrepDescriptor,
} from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.ripgrep.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.ripgrep.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/skillBase/skill.ripgrep.md",
  testFileUrl: import.meta.url,
});

test("skill.ripgrep builds a dry-run rg command preview for a skill registry", () => {
  const result = planSkillRipgrep({
    target: {
      query: "frontmatter",
      registryRoot: "/workspace/skills",
      skillId: "doc-builder",
      includeHidden: true,
      maxResults: 10,
      fileGlobs: ["*.md"],
    },
    context: {
      invocationId: "invoke-ripgrep",
      grantedPermissions: ["skill:read", "filesystem:read"],
      allowedSkillIds: ["doc-builder"],
      allowedRoots: ["/workspace"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toolId, skillRipgrepDescriptor.toolId);
  assert.equal(result.output.executionBlocked, true);
  assert.deepEqual(result.output.commandPreview, [
    "rg",
    "--line-number",
    "--max-count",
    "10",
    "--hidden",
    "--glob",
    "*.md",
    "frontmatter",
    "/workspace/skills/doc-builder",
  ]);
  assert.deepEqual(result.output.resultEnvelope.matches, []);
});

test("skill.ripgrep rejects searches outside allowed registry roots", () => {
  const result = planSkillRipgrep({
    target: {
      query: "frontmatter",
      registryRoot: "/tmp/skills",
    },
    context: {
      allowedRoots: ["/workspace"],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SCOPE_REJECTED");
  assert.equal(result.error.boundary, "scope");
});

test("skill.ripgrep validates maxResults before returning a plan", () => {
  const result = planSkillRipgrep({
    target: {
      query: "frontmatter",
      registryRoot: "/workspace/skills",
      maxResults: 0,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_MAX_RESULTS");
  assert.equal(result.error.boundary, "resource");
});
