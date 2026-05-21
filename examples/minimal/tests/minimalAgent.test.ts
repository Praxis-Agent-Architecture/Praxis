import assert from "node:assert/strict";
import test from "node:test";

import { praxis } from "@praxis-ai/praxis";

import MinimalRepoInspectorAgent from "../praxis.agent.js";

test("minimal repo inspector compiles into a valid manifest", () => {
  const result = praxis.compileAgent(MinimalRepoInspectorAgent);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const validation = praxis.validateAgentManifest(result.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  assert.equal(validation.manifest.identity.id, "agent.example.minimal.repoInspector");
  assert.equal(validation.manifest.model.model, "gpt-5.5");
  assert.equal(validation.manifest.session.persistence, "memory");
  assert.equal(validation.manifest.storage.kind, "memory");
  assert.equal(validation.manifest.promptPack.promptPackId, "prompt.example.minimal.repoInspector");
  assert.equal(validation.manifest.harness.tools.length, 2);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.read"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.search"), true);
});
