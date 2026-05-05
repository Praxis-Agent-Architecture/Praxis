import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../../../../..");

test("omniBase live matrix can exercise every omni tool through the registry and runtime port without a model", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/agentCore_Agent_Test/agentcore_omni_live_matrix.ts", "--no-model"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"ok": true/u);
  assert.match(result.stdout, /"total": 14/u);
  assert.match(result.stdout, /BaseToolExecutorPort\.omni\.transformMedia|transform:omni\.viewImage\.prepareImageInput/u);
});
