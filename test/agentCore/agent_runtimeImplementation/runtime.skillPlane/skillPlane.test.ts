import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  adviseSkillPromotion,
  createFileSkillPlaneStore,
  createInMemorySkillPlaneStore,
  loadSkillHeadsFromSource,
  renderSkillIndexMaterial,
  skill,
  type SkillBody,
  type SkillHead,
} from "../../../../src/runtimeImplementation/runtime.skillPlane/index.js";

const repoSkill: SkillBody = {
  skillId: "repo.inspect",
  title: "Repository Inspection",
  summary: "Inspect a repository before changing runtime code.",
  scope: "project",
  whenToUse: "Before editing a Praxis runtime plane.",
  why: "Keeps implementation aligned with live contracts.",
  keywords: ["repo", "runtime", "inspection"],
  pitfallsPreview: ["Do not rely on old memory when live files disagree."],
  promotedFrom: ["experience.repo-inspection"],
  prerequisites: ["Readable workspace"],
  do: ["Run rg first", "Read nearby tests"],
  avoid: ["Do not rewrite unrelated docs"],
  pitfalls: ["Body-only pitfall must be loaded on demand"],
  verification: ["Run focused node:test command"],
  examples: ["node --import tsx --test test/example.test.ts"],
  promotionSignals: ["Repeated successful use"],
  updatedAt: "2026-06-06T00:00:00.000Z",
};

test("skill.module accepts scoped skill sources and applies skill plane defaults", () => {
  const head: SkillHead = {
    skillId: "repo.inspect",
    title: "Repository Inspection",
    summary: "Inspect before editing.",
  };
  const directory = skill.directory("skills/project", { scope: "project" });
  const packageSource = skill.package("@praxis-ai/skills", { scope: "workspace" });

  const module = skill.module({
    sources: [directory, packageSource, skill.inline([head])],
  });

  assert.equal(module.kind, "praxis.skill.module");
  assert.equal(module.version, "praxis.skill.v1");
  assert.deepEqual(module.sources, [
    { kind: "directory", path: "skills/project", scope: "project" },
    { kind: "package", packageName: "@praxis-ai/skills", scope: "workspace" },
    { kind: "inline", heads: [head] },
  ]);
  assert.deepEqual(module.indexPolicy, {
    maxHeads: 40,
    includeScopes: ["agent", "project", "workspace"],
  });
  assert.deepEqual(module.bodyLoadPolicy, { mode: "on-demand", maxBodiesPerTurn: 3 });
  assert.deepEqual(module.lifecycle, {
    allowWrite: true,
    checkpointWrites: true,
    promotion: "suggest",
  });
});

test("in-memory skill store writes, lists, reads, and filters by scope", async () => {
  const store = createInMemorySkillPlaneStore();
  await store.write(repoSkill);
  await store.write({
    ...repoSkill,
    skillId: "session.triage",
    title: "Session Triage",
    scope: "session",
  });

  assert.deepEqual(
    (await store.listHeads()).map((head) => head.skillId),
    ["repo.inspect", "session.triage"],
  );
  assert.deepEqual(
    (await store.listHeads({ scopes: ["project"] })).map((head) => head.skillId),
    ["repo.inspect"],
  );
  assert.equal((await store.readBody("repo.inspect"))?.title, "Repository Inspection");
});

test("file skill store persists one body per skill id and filters heads by scope", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "praxis-skill-plane-"));
  try {
    const store = createFileSkillPlaneStore(rootDir);
    await store.write(repoSkill);
    await store.write({
      ...repoSkill,
      skillId: "user.release",
      title: "Release Checklist",
      scope: "user",
    });

    const reopened = createFileSkillPlaneStore(rootDir);
    assert.equal((await reopened.readBody("repo.inspect"))?.summary, repoSkill.summary);
    assert.deepEqual(
      (await reopened.listHeads({ scopes: ["project"] })).map((head) => head.skillId),
      ["repo.inspect"],
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("file skill store keeps long skill ids with the same prefix independent", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "praxis-skill-plane-"));
  try {
    const sharedPrefix = "project.skill.".padEnd(96, "a");
    const firstId = `${sharedPrefix}.first`;
    const secondId = `${sharedPrefix}.second`;
    const store = createFileSkillPlaneStore(rootDir);

    await store.write({
      ...repoSkill,
      skillId: firstId,
      title: "First Long Skill",
      summary: "First long skill body.",
    });
    await store.write({
      ...repoSkill,
      skillId: secondId,
      title: "Second Long Skill",
      summary: "Second long skill body.",
    });

    const reopened = createFileSkillPlaneStore(rootDir);
    assert.equal((await reopened.readBody(firstId))?.title, "First Long Skill");
    assert.equal((await reopened.readBody(secondId))?.title, "Second Long Skill");
    assert.deepEqual(
      (await reopened.listHeads({ scopes: ["project"] })).map((head) => head.skillId),
      [firstId, secondId],
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("skill source resolver reads directory and package heads", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "praxis-skill-source-"));
  try {
    const directoryPath = path.join(rootDir, "skills");
    await mkdir(directoryPath, { recursive: true });
    await writeFile(
      path.join(directoryPath, "repo.inspect.json"),
      `${JSON.stringify(repoSkill)}\n`,
      "utf8",
    );
    const directoryHeads = await loadSkillHeadsFromSource(skill.directory("skills", { scope: "workspace" }), {
      workspaceRoot: rootDir,
    });
    assert.deepEqual(directoryHeads.map((head) => head.skillId), ["repo.inspect"]);
    assert.equal(directoryHeads[0]?.scope, "project");

    const packagePath = path.join(rootDir, "skill-package.mjs");
    await writeFile(
      packagePath,
      "export const skillHeads = [{ skillId: 'pkg.inspect', title: 'Package Inspect', summary: 'Package skill.', scope: 'agent' }];\n",
      "utf8",
    );
    const packageHeads = await loadSkillHeadsFromSource(skill.package(pathToFileURL(packagePath).href, { scope: "workspace" }));
    assert.deepEqual(packageHeads.map((head) => head.skillId), ["pkg.inspect"]);
    assert.equal(packageHeads[0]?.scope, "agent");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("renderSkillIndexMaterial creates a skill index PromptPack material without body details", () => {
  const material = renderSkillIndexMaterial([repoSkill]);

  assert.equal(material.id, "runtime:skill-plane:index");
  assert.equal(material.kind, "runtime");
  assert.equal(material.source, "runtime.skillPlane.index");
  assert.equal(material.sourceCategory, "declared-built-in");
  assert.equal(material.trusted, true);
  assert.equal(material.promptSegmentKind, "skillIndex");
  assert.deepEqual(material.metadata, {
    promptSegmentKind: "skillIndex",
    generatedBy: "runtime.skillPlane",
  });
  assert.match(material.text, /repo\.inspect/u);
  assert.doesNotMatch(material.text, /Body-only pitfall/u);
  assert.doesNotMatch(material.text, /node --import tsx/u);
});

test("adviseSkillPromotion proposes candidate MCP+ promotion without tool generation", () => {
  const advice = adviseSkillPromotion(repoSkill, { reason: "Repeated cross-project reuse" });

  assert.equal(advice.target, "candidate-mcp-plus");
  assert.equal(advice.autoGenerateTool, false);
  assert.equal(advice.skillId, "repo.inspect");
});
