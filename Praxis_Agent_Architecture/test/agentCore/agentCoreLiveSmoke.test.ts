import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const architectureRoot = path.resolve(testDir, "../..");
const liveEnabled = process.env.AGENTCORE_LIVE_TEST === "1";
const localEnvPath = path.join(architectureRoot, ".env.agentcore.local");

function loadLocalEnvFile(): void {
  if (!existsSync(localEnvPath)) {
    return;
  }

  const text = readFileSync(localEnvPath, "utf8");
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/gu, "");
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

type SmokeOutput = {
  ok?: boolean;
  mode?: string;
  dryRunSteps?: Array<{ name: string; ok: boolean; detail: string }>;
  liveProbes?: Array<{ provider: string; status: string; detail: string }>;
};

function parseLastJsonObject(output: string): SmokeOutput {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert.notEqual(start, -1, "smoke output must include a JSON object");
  assert.notEqual(end, -1, "smoke output must include a complete JSON object");
  assert.ok(end > start, "smoke JSON object must be complete");
  return JSON.parse(output.slice(start, end + 1)) as SmokeOutput;
}

test(
  "临时 agentCore live smoke can really call an OAI-compatible /v1/responses endpoint",
  { skip: liveEnabled ? false : "set AGENTCORE_LIVE_TEST=1 to run the live provider probe" },
  () => {
    assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required when AGENTCORE_LIVE_TEST=1");
    assert.ok(process.env.OPENAI_BASE_URL, "OPENAI_BASE_URL is required when AGENTCORE_LIVE_TEST=1");

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/agentCore_Agent_Test/agentcore_smoke.ts", "--live"],
      {
        cwd: architectureRoot,
        env: {
          ...process.env,
          OPENAI_SMOKE_MODEL: process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.4",
        },
        encoding: "utf8",
        timeout: 60_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = parseLastJsonObject(result.stdout);

    assert.equal(output.ok, true, "agentCore smoke summary should be ok");
    assert.equal(output.mode, "dry-run-plus-live-probes");
    assert.ok(output.dryRunSteps?.every((step) => step.ok), "all internal agentCore dry-run steps must pass");

    const openaiProbe = output.liveProbes?.find((probe) => probe.provider === "openai");
    assert.ok(openaiProbe, "live smoke must report the openai probe");
    assert.equal(openaiProbe.status, "passed", openaiProbe.detail);
    assert.match(openaiProbe.detail, /responses endpoint accepted model=/);
  },
);
