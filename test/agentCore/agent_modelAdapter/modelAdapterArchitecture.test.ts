import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const thisTestFile = fileURLToPath(import.meta.url);

const requiredModelAdapterDirs = [
  "src/modelAdapter/schema",
  "src/modelAdapter/route",
  "src/modelAdapter/protocols",
  "src/modelAdapter/providers",
  "src/modelAdapter/registry",
  "src/modelAdapter/toolBridge",
] as const;

const forbiddenLegacyNames = [
  "actualInvocationLayer",
  "authProfileLayer",
  "providerAccessLayer",
  "abstractionLayer",
  "bridgingLayer",
  "bindActualInvocationLayer",
  "bindAbstractionLayer",
  "bindBridgingLayer",
] as const;

const cleanupScopes = [
  "src/modelAdapter/schema",
  "src/modelAdapter/route",
  "src/modelAdapter/protocols",
  "src/modelAdapter/providers",
  "src/modelAdapter/registry",
  "src/modelAdapter/toolBridge",
  "test/agentCore/agent_modelAdapter",
  "docs/agentCore/agent_modelAdapter",
  "docs/agentCore/agent_runtimeImplementation/runtime.modelAdapter",
] as const;

test("modelAdapter rewrite exposes the new schema route protocol provider registry transport auth foundation", () => {
  for (const dir of requiredModelAdapterDirs) {
    assert.equal(existsSync(path.join(repoRoot, dir)), true, `missing required modelAdapter directory: ${dir}`);
  }

  for (const file of [
    "src/modelAdapter/route/auth.ts",
    "src/modelAdapter/route/transport.ts",
    "src/modelAdapter/route/client.ts",
    "src/modelAdapter/route/errorClassification.ts",
    "src/modelAdapter/registry/providerRegistry.ts",
    "src/modelAdapter/providers/openaiCompatible.ts",
  ]) {
    assert.equal(existsSync(path.join(repoRoot, file)), true, `missing required modelAdapter file: ${file}`);
  }
});

test("modelAdapter package exports point upper layers at the new public surface", () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    exports?: Record<string, string>;
  };

  assert.equal(packageJson.exports?.["./modelAdapter"], "./src/modelAdapter/index.ts");
  assert.equal(packageJson.exports?.["./model-adapter"], "./src/modelAdapter/index.ts");

  const publicIndex = readFileSync(path.join(repoRoot, "src/modelAdapter/index.ts"), "utf8");
  for (const exportedSurface of ["schema", "route", "protocols", "registry", "providers", "toolBridge"]) {
    assert.match(publicIndex, new RegExp(`\\.\\/${exportedSurface}\\/index\\.js`), `modelAdapter public index must export ${exportedSurface}`);
  }
});

test("modelAdapter rewrite public scopes do not retain legacy layer names", () => {
  const files = cleanupScopes
    .flatMap((scope) => listFiles(path.join(repoRoot, scope)))
    .filter((file) => file !== thisTestFile);
  assert.ok(files.length > 0, "cleanup scope must include files");

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const legacyName of forbiddenLegacyNames) {
      assert.equal(
        text.includes(legacyName),
        false,
        `${path.relative(repoRoot, file)} still mentions legacy modelAdapter layer ${legacyName}`,
      );
    }
  }
});

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...listFiles(fullPath));
    if (stat.isFile()) files.push(fullPath);
  }
  return files;
}
