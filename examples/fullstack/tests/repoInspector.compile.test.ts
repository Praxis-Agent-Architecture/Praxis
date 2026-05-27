import assert from "node:assert/strict";
import test from "node:test";

import { praxis } from "@praxis-ai/praxis";

import RepoInspectorAgent from "../agents/repoInspector/praxis.agent.js";
import { DeepPermissiveRepoInspectorAgent } from "../agents/repoInspector/agent.js";

test("fullstack repo inspector compiles through project agent entry", () => {
  const compiled = praxis.compileAgent(RepoInspectorAgent);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  const validation = praxis.validateAgentManifest(compiled.manifest);
  assert.equal(validation.ok, true);
  if (!validation.ok) return;

  assert.equal(validation.manifest.identity.id, "agent.example.repoInspector.quick.standard");
  assert.equal(validation.manifest.model.model, "gpt-5.5");
  assert.equal(validation.manifest.session.persistence, "sqlite");
  assert.equal(validation.manifest.storage.kind, "rax-workspace");
  assert.equal(validation.manifest.promptPack.promptPackId, "prompt.example.repoInspector");
  assert.equal(validation.manifest.promptPack.materials.includes("repoInspector.toolRules"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.read"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "file.search"), true);
  assert.equal(validation.manifest.harness.tools.some((tool) => tool.toolId === "skill.load"), true);
});

test("fullstack deep permissive variant expands the harness", () => {
  const compiled = praxis.compileAgent(new DeepPermissiveRepoInspectorAgent({ persistence: "memory" }));
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;

  assert.equal(compiled.manifest.identity.id, "agent.example.repoInspector.deep.permissive");
  assert.equal(compiled.manifest.session.persistence, "memory");
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "shell.run"), true);
  assert.equal(compiled.manifest.harness.tools.some((tool) => tool.toolId === "skill.load"), true);
  assert.ok(compiled.manifest.harness.tools.length > 5);
});
