import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseToolExecutorPort } from "../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore_executionEngine/basic_toolLayer/invocationAdapter.js";
import { invokeChatGPTCodexResponses } from "../../src/agentCore_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import { resolveAuthEnvelope } from "../../src/agentCore_modelAdapter/authProfileLayer/authResolver.js";
import { createCredentialRef } from "../../src/agentCore_modelAdapter/authProfileLayer/credentialRef.js";
import { createProviderCaller } from "../../src/agentCore_modelAdapter/providerAccessLayer/providerCaller.js";
import { createChatGPTCodexResponsesCarrier } from "../../src/agentCore_modelAdapter/providerAccessLayer/providerCarrier.js";
import { fetchProviderTransport } from "../../src/agentCore_modelAdapter/providerAccessLayer/transportCaller.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

const args = process.argv.slice(2);
const argSet = new Set(args);
const codexAuthPath = process.env.AGENTCORE_CODEX_AUTH_FILE
  ?? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "auth.json");
const chatgptCodexClientVersion = process.env.AGENTCORE_CODEX_CLIENT_VERSION ?? "0.118.0";
const model = process.env.AGENTCORE_CODEX_MODEL ?? process.env.OPENAI_SMOKE_MODEL ?? "gpt-5.5";
const reasoningEffort =
  process.env.AGENTCORE_CODEX_REASONING_EFFORT ??
  process.env.OPENAI_AGENTCORE_REASONING_EFFORT ??
  process.env.OPENAI_REASONING_EFFORT ??
  "low";
const maxOutputTokens = Number(process.env.OPENAI_AGENTCORE_MAX_OUTPUT_TOKENS ?? "768");
const useModel = !argSet.has("--no-model");
const dialogueMode = argSet.has("--dialogue");

type GitLiveToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

type GitLiveCase = {
  toolId: string;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedCalls: readonly string[];
};

const context = {
  dryRun: false,
  guard: { allowed: true, accepted: true },
  allowedRepositoryRoots: ["/repo"],
  grantedPermissions: ["git:read", "git:write", "filesystem:read", "filesystem:write", "network:egress"],
} as const;

const gitLiveCases: readonly GitLiveCase[] = [
  {
    toolId: "git.getRepositoryStatus",
    userPrompt: "看一下当前仓库 Git 状态。",
    input: { target: { repositoryPath: "/repo/project", porcelainVersion: "v1" }, context },
    expectedCalls: ["/repo/project:status --porcelain=v1 --branch"],
  },
  {
    toolId: "git.getWorkingTreeDiff",
    userPrompt: "看一下当前仓库 src/index.ts 的 diff。",
    input: { target: { repositoryPath: "/repo/project", mode: "combined", pathspecs: ["src/index.ts"], contextLines: 1 }, context },
    expectedCalls: ["/repo/project:diff --unified=1 HEAD -- src/index.ts"],
  },
  {
    toolId: "git.getCommitHistory",
    userPrompt: "看一下最近一次提交历史。",
    input: { target: { repositoryPath: "/repo/project", maxCount: 1 }, context },
    expectedCalls: ["/repo/project:log --format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s --max-count 1"],
  },
  {
    toolId: "git.showGitObjectDetails",
    userPrompt: "看一下 HEAD 的原始对象信息。",
    input: { target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "raw" }, context },
    expectedCalls: ["/repo/project:show --no-ext-diff --no-patch --pretty=raw HEAD"],
  },
  {
    toolId: "git.traceLineOwnership",
    userPrompt: "看一下 examples/scripts/agentcore_tool_lab.ts 第 1 行是谁改的。",
    input: { target: { repositoryPath: "/repo/project", filePath: "examples/scripts/agentcore_tool_lab.ts", range: { startLine: 1, endLine: 1 } }, context },
    expectedCalls: ["/repo/project:blame --line-porcelain -L 1,1 -- examples/scripts/agentcore_tool_lab.ts"],
  },
  {
    toolId: "git.removeTrackedFile",
    userPrompt: "从 Git 里删除已跟踪文件 src/obsolete.ts。",
    input: { target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts", force: true }, context },
    expectedCalls: ["/repo/project:rm --force -- src/obsolete.ts"],
  },
  {
    toolId: "git.moveOrRenameFile",
    userPrompt: "把已跟踪文件 src/old.ts 重命名成 src/new.ts。",
    input: { target: { repositoryPath: "/repo/project", sourcePath: "src/old.ts", destinationPath: "src/new.ts", force: true }, context },
    expectedCalls: ["/repo/project:mv --force -- src/old.ts src/new.ts"],
  },
  {
    toolId: "git.manageIgnoreRules",
    userPrompt: "把 dist/ 加入 .gitignore。",
    input: { target: { repositoryPath: "/repo/project", action: "add", ignoreFilePath: ".gitignore", rules: ["dist/"] }, context },
    expectedCalls: ["read:/repo/project/.gitignore", "write:/repo/project/.gitignore:node_modules/\ndist/\n"],
  },
  {
    toolId: "git.addToStaging",
    userPrompt: "把 src/index.ts 加入暂存区。",
    input: { target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"], intentToAdd: true }, context },
    expectedCalls: ["/repo/project:add --intent-to-add -- src/index.ts"],
  },
  {
    toolId: "git.restoreWorkingTree",
    userPrompt: "把 src/index.ts 从 HEAD 恢复到工作区。",
    input: { target: { repositoryPath: "/repo/project", paths: ["src/index.ts"], sourceRef: "HEAD" }, context },
    expectedCalls: ["/repo/project:restore --source HEAD --worktree -- src/index.ts"],
  },
  {
    toolId: "git.resetStagingOrCommit",
    userPrompt: "取消暂存 src/index.ts。",
    input: { target: { repositoryPath: "/repo/project", action: "staging", pathspecs: ["src/index.ts"] }, context },
    expectedCalls: ["/repo/project:reset -- src/index.ts"],
  },
  {
    toolId: "git.stashChanges",
    userPrompt: "把 src/index.ts 的改动临时 stash，message 用 checkpoint。",
    input: { target: { repositoryPath: "/repo/project", message: "checkpoint", includeUntracked: true, pathspecs: ["src/index.ts"] }, context },
    expectedCalls: ["/repo/project:stash push --include-untracked -m checkpoint -- src/index.ts"],
  },
  {
    toolId: "git.applyStashChanges",
    userPrompt: "应用 stash@{0} 并恢复 index。",
    input: { target: { repositoryPath: "/repo/project", stashRef: "stash@{0}", reinstateIndex: true }, context },
    expectedCalls: ["/repo/project:stash apply --index stash@{0}"],
  },
  {
    toolId: "git.popStashChanges",
    userPrompt: "弹出 stash@{0} 并恢复 index。",
    input: { target: { repositoryPath: "/repo/project", stashRef: "stash@{0}", reinstateIndex: true }, context },
    expectedCalls: ["/repo/project:stash pop --index stash@{0}"],
  },
  {
    toolId: "git.cleanUntrackedFiles",
    userPrompt: "清理 tmp/a.log 和 build 这些未跟踪文件，包括目录和 ignored。",
    input: { target: { repositoryPath: "/repo/project", paths: ["tmp/a.log", "build"], includeDirectories: true, ignoredMode: "tracked-ignored" }, context },
    expectedCalls: ["/repo/project:clean -f -d -x -- tmp/a.log build"],
  },
  {
    toolId: "git.createCommit",
    userPrompt: "提交当前 tracked 改动，message 是 Ship it，并加 signoff。",
    input: { target: { repositoryPath: "/repo/project", commitMessage: "Ship it", includeAllTracked: true, signoff: true }, context },
    expectedCalls: ["/repo/project:commit --all --signoff -m Ship it"],
  },
  {
    toolId: "git.amendLastCommit",
    userPrompt: "修订最后一次提交，message 改成 Refined，包含 tracked 改动并重置作者。",
    input: { target: { repositoryPath: "/repo/project", commitMessage: "Refined", includeAllTracked: true, resetAuthor: true }, context },
    expectedCalls: ["/repo/project:commit --amend --all --reset-author -m Refined"],
  },
  {
    toolId: "git.cherryPickCommit",
    userPrompt: "cherry-pick abc123，并加 signoff。",
    input: { target: { repositoryPath: "/repo/project", commitRef: "abc123", signoff: true }, context },
    expectedCalls: ["/repo/project:cherry-pick --signoff abc123"],
  },
  {
    toolId: "git.revertCommit",
    userPrompt: "revert deadbeef 这个提交。",
    input: { target: { repositoryPath: "/repo/project", commitRef: "deadbeef" }, context },
    expectedCalls: ["/repo/project:revert deadbeef"],
  },
  {
    toolId: "git.initializeRepository",
    userPrompt: "在 /repo/new-project 初始化 Git 仓库，默认分支 main。",
    input: { target: { repositoryPath: "/repo/new-project", initialBranch: "main" }, context },
    expectedCalls: ["/repo/new-project:init --initial-branch main"],
  },
  {
    toolId: "git.cloneRepository",
    userPrompt: "把 https://example.com/project.git 克隆到 /repo/project-copy，分支 main，depth 1，只要单分支。",
    input: { target: { repositoryPath: "/repo", remoteUrl: "https://example.com/project.git", destinationPath: "/repo/project-copy", branch: "main", depth: 1, singleBranch: true }, context },
    expectedCalls: ["/repo:clone --branch main --depth 1 --single-branch https://example.com/project.git /repo/project-copy"],
  },
  {
    toolId: "git.archiveRepository",
    userPrompt: "把 /repo/project 的 src 从 HEAD 导出成 /repo/project.tar。",
    input: { target: { repositoryPath: "/repo/project", outputPath: "/repo/project.tar", ref: "HEAD", format: "tar", pathspecs: ["src"] }, context },
    expectedCalls: ["/repo/project:archive --format=tar --output /repo/project.tar HEAD src"],
  },
  {
    toolId: "git.manageWorktree",
    userPrompt: "列出当前仓库的 worktree。",
    input: { target: { repositoryPath: "/repo/project", action: "list" }, context },
    expectedCalls: ["/repo/project:worktree list --porcelain"],
  },
  {
    toolId: "git.manageSubmodule",
    userPrompt: "查看当前仓库 submodule 状态，递归。",
    input: { target: { repositoryPath: "/repo/project", action: "status", recursive: true }, context },
    expectedCalls: ["/repo/project:submodule status --recursive"],
  },
  {
    toolId: "git.locateProblemCommit",
    userPrompt: "定位 main~3 到 HEAD 之间的问题提交候选，验证命令是 npm test。",
    input: { target: { repositoryPath: "/repo/project", knownGoodRef: "main~3", knownBadRef: "HEAD", verificationCommand: "npm test", maxSteps: 16 }, context },
    expectedCalls: ["/repo/project:rev-list --bisect-all main~3..HEAD"],
  },
  {
    toolId: "git.manageRemote",
    userPrompt: "列出当前仓库 remote。",
    input: { target: { repositoryPath: "/repo/project", action: "list" }, context },
    expectedCalls: ["/repo/project:remote -v"],
  },
  {
    toolId: "git.fetchRemoteUpdates",
    userPrompt: "从 origin fetch main，prune，并且不要 tags。",
    input: { target: { repositoryPath: "/repo/project", remoteName: "origin", refspecs: ["main"], prune: true, tagsMode: "no-tags" }, context },
    expectedCalls: ["/repo/project:fetch --prune --no-tags origin main"],
  },
  {
    toolId: "git.pullRemoteChanges",
    userPrompt: "从 origin main 以 ff-only 方式 pull。",
    input: { target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "main", integrationMode: "ff-only" }, context },
    expectedCalls: ["/repo/project:pull --ff-only origin main"],
  },
  {
    toolId: "git.pushLocalChanges",
    userPrompt: "把 feature/a 推到 origin 并设置 upstream。",
    input: { target: { repositoryPath: "/repo/project", remoteName: "origin", branchName: "feature/a", setUpstream: true }, context },
    expectedCalls: ["/repo/project:push --set-upstream origin feature/a"],
  },
  {
    toolId: "git.switchBranch",
    userPrompt: "基于 origin/main 创建并切换到 feature/a，启用 track。",
    input: { target: { repositoryPath: "/repo/project", branchName: "feature/a", create: true, startPoint: "origin/main", track: true }, context },
    expectedCalls: ["/repo/project:switch --track -c feature/a origin/main"],
  },
  {
    toolId: "git.checkoutTarget",
    userPrompt: "从 origin/main 创建并 checkout 到 work/main。",
    input: { target: { repositoryPath: "/repo/project", targetRef: "origin/main", newBranchName: "work/main" }, context },
    expectedCalls: ["/repo/project:checkout -b work/main origin/main"],
  },
  {
    toolId: "git.manageTag",
    userPrompt: "给 HEAD 创建 annotated tag v1.0.0，message 是 release。",
    input: { target: { repositoryPath: "/repo/project", action: "annotate", tagName: "v1.0.0", targetRef: "HEAD", message: "release" }, context },
    expectedCalls: ["/repo/project:tag -a v1.0.0 HEAD -m release"],
  },
  {
    toolId: "git.manageBranch",
    userPrompt: "把分支 feature/a 重命名成 feature/b，强制。",
    input: { target: { repositoryPath: "/repo/project", action: "rename", branchName: "feature/a", newBranchName: "feature/b", force: true }, context },
    expectedCalls: ["/repo/project:branch -M feature/a feature/b"],
  },
  {
    toolId: "git.mergeBranch",
    userPrompt: "把 feature/a 合并进来，no-ff，message 是 Merge feature/a。",
    input: { target: { repositoryPath: "/repo/project", sourceBranch: "feature/a", mode: "no-ff", commitMessage: "Merge feature/a" }, context },
    expectedCalls: ["/repo/project:merge --no-ff -m Merge feature/a feature/a"],
  },
  {
    toolId: "git.rebaseBranch",
    userPrompt: "把 feature/a 从 main rebase 到 origin/main，开启 autosquash。",
    input: { target: { repositoryPath: "/repo/project", upstreamRef: "main", branchName: "feature/a", ontoRef: "origin/main", autosquash: true }, context },
    expectedCalls: ["/repo/project:rebase --autosquash --onto origin/main main feature/a"],
  },
] as const;

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function createGitExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    filesystem: {
      async readText(request) {
        calls.push(`read:${request.path}`);
        return { ok: true, output: { content: "node_modules/\n", truncated: false } };
      },
      async writeText(request) {
        calls.push(`write:${request.path}:${request.content}`);
        return { ok: true, output: { bytesWritten: Buffer.byteLength(request.content, "utf8") } };
      },
    },
    git: {
      async runGit(request) {
        calls.push(`${request.repositoryPath}:${request.args.join(" ")}`);
        return { ok: true, output: fakeGitOutput(request.args) };
      },
    },
  };
}

function fakeGitOutput(gitArgs: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  const subcommand = gitArgs[0];
  if (subcommand === "status") return { exitCode: 0, stdout: "## main...origin/main [ahead 1]\n M src/index.ts\n", stderr: "" };
  if (subcommand === "diff") return { exitCode: 0, stdout: "diff --git a/src/index.ts b/src/index.ts\n@@ -1 +1 @@\n-old\n+new\n", stderr: "" };
  if (subcommand === "log") return { exitCode: 0, stdout: "abcdef123456\x1fabcdef1\x1fAda\x1fada@example.com\x1f2026-04-27T00:00:00+00:00\x1fInitial commit\n", stderr: "" };
  if (subcommand === "show") return { exitCode: 0, stdout: "commit abcdef123456\ntree 111111\nauthor Ada <ada@example.com> 1777248000 +0000\ncommitter Ada <ada@example.com> 1777248000 +0000\n\n    Initial commit\n", stderr: "" };
  if (subcommand === "blame") return { exitCode: 0, stdout: "abcdef123456 1 1 1\nauthor Ada\nauthor-time 1777248000\nsummary Initial commit\nfilename examples/scripts/agentcore_tool_lab.ts\n\tconst mounted = true;\n", stderr: "" };
  if (subcommand === "rm") return { exitCode: 0, stdout: "rm 'src/obsolete.ts'\n", stderr: "" };
  if (subcommand === "stash" && gitArgs[1] === "pop") return { exitCode: 0, stdout: "On branch main\nDropped refs/stash@{0} (abc123)\n", stderr: "" };
  if (subcommand === "stash" && gitArgs[1] === "apply") return { exitCode: 0, stdout: "On branch main\nChanges not staged for commit:\n", stderr: "" };
  if (subcommand === "stash") return { exitCode: 0, stdout: "Saved working directory and index state WIP on main: abc initial\n", stderr: "" };
  if (subcommand === "clean") return { exitCode: 0, stdout: "Removing tmp/a.log\nRemoving build/\n", stderr: "" };
  if (subcommand === "commit" && gitArgs.includes("--amend")) return { exitCode: 0, stdout: "[main def5678] Refined\n 2 files changed, 3 insertions(+), 1 deletion(-)\n", stderr: "" };
  if (subcommand === "commit") return { exitCode: 0, stdout: "[main abc1234] Ship it\n 1 file changed, 1 insertion(+)\n", stderr: "" };
  if (subcommand === "cherry-pick") return { exitCode: 0, stdout: "[main cafe123] Pick feature\n 1 file changed, 2 insertions(+)\n", stderr: "" };
  if (subcommand === "revert") return { exitCode: 0, stdout: "[main beef456] Revert \"Pick feature\"\n 1 file changed, 1 deletion(-)\n", stderr: "" };
  if (subcommand === "init") return { exitCode: 0, stdout: "Initialized empty Git repository in /repo/new-project/.git/\n", stderr: "" };
  if (subcommand === "clone") return { exitCode: 0, stdout: "", stderr: "Cloning into '/repo/project-copy'...\n" };
  if (subcommand === "worktree") return { exitCode: 0, stdout: "worktree /repo/project\nHEAD abcdef123456\nbranch refs/heads/main\n", stderr: "" };
  if (subcommand === "submodule") return { exitCode: 0, stdout: " abcdef1234567890 vendor/toolkit (heads/main)\n", stderr: "" };
  if (subcommand === "rev-list") return { exitCode: 0, stdout: "abcdef1234567890 (dist=1)\n1111111111111111 (dist=2)\n", stderr: "" };
  if (subcommand === "remote" && gitArgs[1] === "-v") return { exitCode: 0, stdout: "origin\thttps://example.com/project.git (fetch)\norigin\thttps://example.com/project.git (push)\n", stderr: "" };
  if (subcommand === "fetch") return { exitCode: 0, stdout: "", stderr: "From https://example.com/project.git\n * [new branch] main -> origin/main\n" };
  if (subcommand === "pull") return { exitCode: 0, stdout: "Already up to date.\n", stderr: "From https://example.com/project.git\n" };
  if (subcommand === "push") return { exitCode: 0, stdout: "branch 'feature/a' set up to track 'origin/feature/a'.\n", stderr: "To https://example.com/project.git\n" };
  if (subcommand === "switch") return { exitCode: 0, stdout: "Switched to a new branch 'feature/a'\n", stderr: "" };
  if (subcommand === "checkout") return { exitCode: 0, stdout: "Switched to a new branch 'work/main'\n", stderr: "" };
  if (subcommand === "tag") return { exitCode: 0, stdout: "", stderr: "" };
  if (subcommand === "branch") return { exitCode: 0, stdout: "", stderr: "" };
  if (subcommand === "merge") return { exitCode: 0, stdout: "Merge made by the 'ort' strategy.\n", stderr: "" };
  if (subcommand === "rebase") return { exitCode: 0, stdout: "Successfully rebased and updated refs/heads/feature/a.\n", stderr: "" };
  return { exitCode: 0, stdout: "", stderr: "" };
}

function extractSseText(text: string): string {
  const deltas: string[] = [];
  const completed: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    if (typeof record.delta === "string") deltas.push(record.delta);
    if (record.type === "response.completed" && record.response !== undefined) {
      const responseText = extractResponseText(record.response);
      if (responseText.trim().length > 0) completed.push(responseText);
    }
  }
  return deltas.join("").trim() || completed.join("\n").trim();
}

function extractResponseText(response: unknown): string {
  if (typeof response === "string") return extractSseText(response) || response;
  if (typeof response !== "object" || response === null) return String(response);
  const record = response as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) return record.output_text.trim();
  const outputValue = record.output;
  if (Array.isArray(outputValue)) {
    const parts: string[] = [];
    for (const item of outputValue) {
      if (typeof item !== "object" || item === null) continue;
      const contentValue = (item as Record<string, unknown>).content;
      if (!Array.isArray(contentValue)) continue;
      for (const content of contentValue) {
        if (typeof content !== "object" || content === null) continue;
        const text = (content as Record<string, unknown>).text ?? (content as Record<string, unknown>).output_text;
        if (typeof text === "string" && text.trim().length > 0) parts.push(text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  return JSON.stringify(response, null, 2);
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as unknown;
    throw new Error(`model did not return JSON: ${text.slice(0, 400)}`);
  }
}

function normalizeGitToolCall(value: unknown): GitLiveToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const toolCalls = record.tool_calls ?? record.toolCalls;
  const first = Array.isArray(toolCalls) ? toolCalls[0] : record;
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const toolRecord = first as Record<string, unknown>;
  const tool = toolRecord.tool ?? toolRecord.name;
  const toolArguments = toolRecord.arguments;
  if (typeof tool !== "string" || !tool.startsWith("git.")) return undefined;
  if (typeof toolArguments !== "object" || toolArguments === null || Array.isArray(toolArguments)) return undefined;
  return { tool, arguments: toolArguments as Readonly<Record<string, unknown>> };
}

async function callResponsesApi(prompt: string, instructions: string): Promise<string> {
  const credentialRef = createCredentialRef({
    id: "agentcore-git-live-matrix-chatgpt-codex",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "codex-auth-file", filePath: codexAuthPath },
  });
  if (!credentialRef.ok) throw new Error(JSON.stringify(credentialRef.error));

  const auth = resolveAuthEnvelope({
    credentialRef: credentialRef.credentialRef,
    readFile: (filePath) => readFileSync(filePath, "utf8"),
  });
  if (!auth.ok) throw new Error(JSON.stringify(auth.error));

  const carrier = createChatGPTCodexResponsesCarrier({
    carrierId: "chatgpt-codex.responses.agentcore-git-live-matrix",
    model,
    reasoning: { effort: reasoningEffort },
    credentialRef: credentialRef.credentialRef,
    clientName: "praxis-agentcore-git-live-matrix",
    clientVersion: chatgptCodexClientVersion,
  });
  if (!carrier.ok) throw new Error(JSON.stringify(carrier.error));

  const caller = createProviderCaller({ transport: fetchProviderTransport, authMaterial: auth.resolved.privateMaterial, timeoutMs: 60_000 });
  const result = await invokeChatGPTCodexResponses({
    operation: "create",
    baseUrl: carrier.carrier.baseURL,
    auth: auth.resolved.envelope,
    runtime: {
      runtimeId: "agentcore-git-live-matrix-runtime",
      invocationId: `agentcore-git-live-matrix-${Date.now()}`,
      callerId: "agentcore-git-live-matrix",
    },
    governance: { accepted: true },
    dryRun: false,
    caller,
    headers: { "content-type": "application/json" },
    clientName: "praxis-agentcore-git-live-matrix",
    clientVersion: chatgptCodexClientVersion,
    expectResponseObject: false,
    body: { model, instructions, input: prompt, reasoning: { effort: reasoningEffort }, max_output_tokens: maxOutputTokens },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return extractResponseText(result.response.raw);
}

async function invokeGitToolThroughRuntimeChain(
  toolCall: GitLiveToolCall,
  executor: BaseToolExecutorPort,
): Promise<{ ok: boolean; toolId: string; output?: unknown; error?: { code: string; publicSafe?: true } }> {
  const toolCallId = `${toolCall.tool}:git-live-matrix`;
  const runtimeId = "agentcore-git-live-matrix-runtime";
  const sessionId = "agentcore-git-live-matrix-session";
  const adapted = adaptRuntimeToolInvocation({
    context: { runtimeId, sessionId, invocationId: toolCallId },
    toolId: toolCall.tool,
    operation: toolCall.tool,
    arguments: toolCall.arguments,
    resourceLimits: { timeoutMs: 10_000, maxOutputBytes: 16_000 },
  });
  if (!adapted.ok) return { ok: false, toolId: toolCall.tool, error: adapted.error };
  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "agentcore-git-live-matrix", sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolCall.tool, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error };
  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error };
  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input: toolCall.arguments, executor });
}

function toolCallFromCase(testCase: GitLiveCase): GitLiveToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

function expectedCallsSeen(expectedCalls: readonly string[], calls: readonly string[]): boolean {
  return expectedCalls.every((expectedCall) => calls.includes(expectedCall));
}

function truncateText(value: unknown, maxChars = 700): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxChars ? `${text.slice(0, maxChars)}...<truncated>` : text;
}

async function main(): Promise<void> {
  const onlyTool = argValue("--tool");
  const limit = Number(argValue("--limit") ?? gitLiveCases.length);
  const selected = gitLiveCases
    .filter((testCase) => onlyTool === undefined || testCase.toolId === onlyTool)
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : gitLiveCases.length);
  const results = [];

  if (dialogueMode) {
    console.log("agentCore gitBase dialogue suite");
    console.log(`mode=${useModel ? "live-model-plus-registry-handler" : "registry-handler-only"}`);
    console.log("");
  }

  for (const testCase of selected) {
    const calls: string[] = [];
    let modelText = "";
    let toolCall = toolCallFromCase(testCase);
    let modelOk = true;
    let modelError: string | undefined;

    if (useModel) {
      const prompt = [
        "请模拟一次真实 agentCore 对话里的 Git 工具选择。",
        `用户请求：${testCase.userPrompt}`,
        "这是普通用户话术。你要像 agent 一样选择最合适的 gitBase fixed-action 工具。",
        "这是已获用户确认并由 lab harness 注入 affirmative guard 的受控测试；即使是 destructive/risky Git 动作，也要返回对应 fixed-action gitBase tool_call，让 storage core 和 runtime governance 继续执行安全边界。",
        "禁止选择 shell.commandExecution、shell.scriptExecution、bash、git.execute、gitBase.* 或伪造 git.*。",
        `tool 字段必须精确等于 registry toolId：${testCase.toolId}。不要改成 gitBase.${testCase.toolId.slice("git.".length)} 或其他别名。`,
        `期望的任务类别是 ${testCase.toolId}，但你仍然需要输出标准 tool_calls JSON。`,
        "为了把测试集中在对话链路，请使用下面这份 arguments，不要改字段名，不要省略 context：",
        JSON.stringify(testCase.input, null, 2),
        "只返回：{\"tool_calls\":[{\"tool\":\"...\",\"arguments\":{...}}]}",
      ].join("\n");
      try {
        modelText = await callResponsesApi(prompt, "你是 Praxis agentCore gitBase live matrix。你只输出 JSON tool_calls，不输出解释。");
        const parsedToolCall = normalizeGitToolCall(parseJsonObject(modelText));
        if (parsedToolCall === undefined) {
          modelOk = false;
          modelError = "MODEL_DID_NOT_RETURN_GIT_TOOL_CALL";
        } else if (parsedToolCall.tool !== testCase.toolId) {
          modelOk = false;
          modelError = `MODEL_TOOL_MISMATCH:${parsedToolCall.tool}`;
          toolCall = parsedToolCall;
        } else {
          toolCall = parsedToolCall;
        }
      } catch (error) {
        modelOk = false;
        modelError = error instanceof Error ? error.message : String(error);
      }
    }

    const toolResult = await invokeGitToolThroughRuntimeChain(toolCall, createGitExecutor(calls));
    const expectedCallOk = expectedCallsSeen(testCase.expectedCalls, calls);
    const runtimeEntryOk = toolResult.ok && typeof toolResult.output === "object" && toolResult.output !== null
      ? JSON.stringify(toolResult.output).includes("BaseToolExecutorPort.")
      : false;
    const ok = modelOk && toolResult.ok === true && expectedCallOk && runtimeEntryOk;
    const record = {
      ok,
      toolId: testCase.toolId,
      modelOk,
      modelError,
      expectedCallOk,
      runtimeEntryOk,
      expectedCalls: testCase.expectedCalls,
      calls,
      resultOk: toolResult.ok,
      error: toolResult.error,
      outputPreview: truncateText(toolResult.output),
      modelPreview: modelText.slice(0, 500),
    };
    results.push(record);
    if (dialogueMode) {
      console.log(`[${results.length}/${selected.length}] user> ${testCase.userPrompt}`);
      console.log(`model tool_call> ${modelOk ? toolCall.tool : `FAILED ${modelError}`}`);
      console.log(`runtime> ok=${toolResult.ok} calls=${calls.join(", ") || "(none)"}`);
      console.log(`agentCore> ${record.outputPreview}`);
      if (!modelOk) console.log(`model> ${record.modelPreview || "(empty)"}`);
      console.log(`result> ${ok ? "PASS" : "FAIL"}`);
      console.log("");
    } else {
      console.log(JSON.stringify(record));
    }
  }

  const failed = results.filter((result) => !result.ok);
  const summary = {
    ok: failed.length === 0,
    mode: useModel ? "live-model-plus-registry-handler" : "registry-handler-only",
    model,
    reasoningEffort,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failedTools: failed.map((result) => result.toolId),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agentCore gitBase live matrix fatal> ${message}`);
  process.exitCode = 1;
});
