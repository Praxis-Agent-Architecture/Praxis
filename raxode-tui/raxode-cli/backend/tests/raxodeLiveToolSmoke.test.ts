import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

const liveEnabled = process.env.RAXODE_LIVE_TEST === "1";

type RaxodeSmokeView = {
  status: string;
  finalOutput?: string;
  counters?: {
    modelCalls?: number;
    toolCalls?: number;
  };
};

async function runRaxodeLiveSmoke(prompt: string): Promise<RaxodeSmokeView> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "--import",
      "tsx",
      "raxode-cli/backend/application/runRaxodeBackend.ts",
      "--live",
      "--policy=bapr",
      prompt,
    ],
    {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        AGENTCORE_CODEX_MODEL: process.env.AGENTCORE_CODEX_MODEL ?? "gpt-5.5",
        AGENTCORE_CODEX_REASONING_EFFORT: process.env.AGENTCORE_CODEX_REASONING_EFFORT ?? "low",
      },
    },
  );
  const jsonStart = stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, stdout);
  const payload = JSON.parse(stdout.slice(jsonStart)) as {
    result?: {
      ok?: boolean;
      view?: {
        finalOutput?: string;
        counters?: RaxodeSmokeView["counters"];
      };
      events?: Array<{
        kind?: string;
        message?: string;
        metadata?: RaxodeSmokeView["counters"];
      }>;
    };
  };
  const events = payload.result?.events ?? [];
  const finalEvent = [...events].reverse().find((event) => event.kind === "final");
  return {
    status: payload.result?.ok === true ? "completed" : "failed",
    finalOutput: payload.result?.view?.finalOutput ?? finalEvent?.message,
    counters: payload.result?.view?.counters ?? finalEvent?.metadata,
  };
}

const cases = [
  {
    name: "shell.run",
    prompt: "请实际调用 shell.run 执行 pwd，然后只回答命令输出。",
    expected: process.cwd(),
  },
  {
    name: "file.search",
    prompt: "请实际调用 file.search 在当前仓库搜索字符串 \"PraxisApplicationRuntime\"，只回答匹配到的一个文件路径。",
    expected: "raxode-cli/",
  },
  {
    name: "file.read",
    prompt: "请实际调用 file.read 读取 package.json，只回答里面的 name 字段值。",
    expected: "@praxis-ai/raxode",
  },
  {
    name: "web.fetch",
    prompt: "请实际调用 web.fetch 抓取 https://example.com ，只回答页面标题。",
    expected: "Example",
  },
  {
    name: "tool.describe",
    prompt: "请实际调用 tool.describe 查看 file.read 的工具说明，只回答这个工具名。",
    expected: "file.read",
  },
] as const;

for (const testCase of cases) {
  test(`raxode live tool smoke: ${testCase.name}`, { skip: liveEnabled ? false : "set RAXODE_LIVE_TEST=1 to run live provider/tool smoke" }, async () => {
    const view = await runRaxodeLiveSmoke(testCase.prompt);
    assert.equal(view.status, "completed");
    assert.equal(view.counters?.toolCalls, 1);
    assert.ok((view.counters?.modelCalls ?? 0) >= 1);
    assert.match(view.finalOutput ?? "", new RegExp(testCase.expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"));
  });
}
