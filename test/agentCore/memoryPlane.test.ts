import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createMemoryPlane,
  memoryPlane,
  praxis,
} from "../../src/agentCore/index.js";
import {
  memoryPlane as packageMemoryPlane,
} from "@praxis-ai/praxis/memory";

test("memoryPlane initializes project/global markdown layout with fixed daily note", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-layout-"));
  try {
    const projectMemoryRoot = path.join(tmp, "project", "memory");
    const globalMemoryRoot = path.join(tmp, "global", "memory");
    const plane = createMemoryPlane({
      projectMemoryRoot,
      globalMemoryRoot,
      profile: "readonly",
      now: () => "2026-05-26T12:00:00.000Z",
    });

    const status = await plane.initialize();
    assert.equal(status.ok, true);
    assert.equal(status.indexAvailable, false);
    assert.equal(status.profile, "readonly");
    assert.equal(status.roots.length, 2);
    assert.equal(await readFile(path.join(projectMemoryRoot, "MEMORY.md"), "utf8").then((value) => value.includes("# Project Memory")), true);
    assert.equal(await readFile(path.join(projectMemoryRoot, "daily", "2026-05-26.md"), "utf8").then((value) => value.includes("# Daily Memory 2026-05-26")), true);
    assert.equal(await readFile(path.join(globalMemoryRoot, "MEMORY.md"), "utf8").then((value) => value.includes("# Global Memory")), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane reindexes markdown truth source into lightweight SQLite metadata", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-index-"));
  try {
    const projectMemoryRoot = path.join(tmp, "workspace", "memory");
    const plane = createMemoryPlane({
      projectMemoryRoot,
      profile: "full",
      now: () => "2026-05-26T00:00:00.000Z",
    });
    await plane.initialize();
    await writeFile(
      path.join(projectMemoryRoot, "daily", "2026-05-26.md"),
      [
        "# Daily Memory 2026-05-26",
        "",
        "- artifact:artifact.demo captured screenshot summary",
        "- artifact:artifact.demo second reference should remain indexed",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await plane.reindex({ force: true });
    assert.equal(result.ok, true);
    assert.equal(result.indexedFiles.some((item) => item.sourceType === "longTerm"), true);
    assert.equal(result.indexedFiles.some((item) => item.sourceType === "dailyNote"), true);
    assert.equal(result.artifactRefs[0]?.artifactId, "artifact.demo");

    const status = await plane.indexStatus();
    assert.equal(status.ok, true);
    assert.equal(status.indexAvailable, true);
    assert.equal(status.artifactRefs.filter((item) => item.artifactId === "artifact.demo").length, 2);
    assert.equal(status.artifactRefs[0]?.summary.includes("captured screenshot"), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane indexStatus reports missing index as unavailable without creating it", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-status-"));
  try {
    const projectMemoryRoot = path.join(tmp, "workspace", "memory");
    const plane = createMemoryPlane({
      projectMemoryRoot,
      profile: "readonly",
      now: () => "2026-05-26T00:00:00.000Z",
    });
    await plane.initialize();

    const status = await plane.indexStatus();
    assert.equal(status.ok, true);
    assert.equal(status.indexAvailable, false);
    assert.equal(status.indexedFiles.length, 0);
    await assert.rejects(readFile(path.join(projectMemoryRoot, "index.sqlite")));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane reindex recovers a corrupt SQLite index", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-corrupt-"));
  try {
    const projectMemoryRoot = path.join(tmp, "workspace", "memory");
    const plane = createMemoryPlane({
      projectMemoryRoot,
      profile: "full",
      now: () => "2026-05-26T00:00:00.000Z",
    });
    await plane.initialize();
    await writeFile(path.join(projectMemoryRoot, "index.sqlite"), "not a sqlite database", "utf8");

    const result = await plane.reindex({ force: true });
    assert.equal(result.ok, true);
    assert.equal(result.indexedFiles.some((item) => item.path.endsWith("MEMORY.md")), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane search returns basetool file.search guidance instead of a model tool", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-search-"));
  try {
    const guide = await memoryPlane.search({
      projectMemoryRoot: path.join(tmp, "project-memory"),
      profile: "readonly",
      query: "tool matrix",
      sourceTypes: ["dailyNote"],
    });

    assert.equal(guide.kind, "basetool.file.search.guide");
    assert.equal(guide.toolId, "file.search");
    assert.equal(guide.suggestedInputs[0]?.query, "tool matrix");
    assert.equal(guide.suggestedInputs[0]?.glob, "daily/*.md");
    assert.match(guide.instructions, /file\.read/);

    const broadGuide = await memoryPlane.search({
      projectMemoryRoot: path.join(tmp, "project-memory"),
      profile: "readonly",
      query: "mixed source",
      sourceTypes: ["longTerm", "dailyNote"],
    });
    assert.equal(broadGuide.suggestedInputs[0]?.glob, "**/*.md");

    const offGuide = await memoryPlane.search({
      projectMemoryRoot: path.join(tmp, "project-memory"),
      profile: "off",
      query: "must not search",
    });
    assert.equal(offGuide.roots.length, 0);
    assert.equal(offGuide.suggestedInputs.length, 0);
    assert.match(offGuide.instructions, /Memory profile is off/);

    const offPromptGuide = await memoryPlane.buildPromptGuide({
      projectMemoryRoot: path.join(tmp, "project-memory"),
      profile: "off",
      query: "must not search",
    });
    assert.equal(offPromptGuide.enabled, false);
    assert.equal(offPromptGuide.roots.length, 0);
    assert.equal(offPromptGuide.searchGuide, undefined);
    assert.match(offPromptGuide.guide, /Memory profile is off/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane exposes profile-aware prompt guide and risk metadata through praxis.memory", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "praxis-memory-public-"));
  try {
    assert.equal(praxis.memory.describeRisk("reindex").risk, "safe");
    assert.equal(praxis.memory.describeRisk("editMemory").risk, "risky");
    assert.deepEqual(praxis.memory.describeRisk("editMemory").approvalRecommendedFor, ["standard", "restricted"]);

    const guide = await praxis.memory.buildPromptGuide({
      projectMemoryRoot: path.join(tmp, "project-memory"),
      profile: "appendOnly",
      query: "Praxis memory",
      budgetChars: 800,
    });
    assert.equal(guide.enabled, true);
    assert.equal(guide.profile, "appendOnly");
    assert.equal(guide.searchGuide?.toolId, "file.search");
    assert.match(guide.guide, /passive durable project\/global context/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("memoryPlane package subpath exposes the application-facing API", async () => {
  assert.equal(packageMemoryPlane.describeRisk("search").risk, "safe");
  const guide = await packageMemoryPlane.search({
    projectMemoryRoot: "/tmp/praxis-memory-public-subpath",
    profile: "readonly",
    query: "public subpath",
  });
  assert.equal(guide.toolId, "file.search");
  assert.equal(guide.suggestedInputs[0]?.query, "public subpath");
});
