import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import test, { after } from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  runMountedGitBaseTool,
  runTool,
  toolLabRuntimePaths,
} from "../../../../../../scripts/agentCore_Agent_Test/agentcore_tool_lab.js";

after(() => {
  rmSync(toolLabRuntimePaths.logRoot, { recursive: true, force: true });
});

test("tool lab mounts gitBase tools through registry handler and BaseToolExecutorPort.git.runGit", async () => {
  const calls: string[] = [];
  const context = { allowedRepositoryRoots: ["/repo"] };
  const executor: BaseToolExecutorPort = {
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
        if (request.args[0] === "diff") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "diff --git a/src/index.ts b/src/index.ts\n@@ -1 +1 @@\n-old\n+new\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "log") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "abcdef123456\x1fabcdef1\x1fAda\x1fada@example.com\x1f2026-04-27T00:00:00+00:00\x1fInitial commit\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "show") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "commit abcdef123456\n" +
                "tree 111111\n" +
                "author Ada <ada@example.com> 1777248000 +0000\n" +
                "committer Ada <ada@example.com> 1777248000 +0000\n\n" +
                "    Initial commit\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "blame") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "abcdef123456 1 1 1\n" +
                "author Ada\n" +
                "author-mail <ada@example.com>\n" +
                "author-time 1777248000\n" +
                "summary Initial commit\n" +
                "filename scripts/agentCore_Agent_Test/agentcore_tool_lab.ts\n" +
                "\tconst mounted = true;\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "add") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "rm") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "rm 'src/obsolete.ts'\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "mv") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "restore") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "reset") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "stash") {
          if (request.args[1] === "apply") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "On branch main\nChanges not staged for commit:\n",
                stderr: "",
              },
            };
          }
          if (request.args[1] === "pop") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "On branch main\nDropped refs/stash@{0} (abc123)\n",
                stderr: "",
              },
            };
          }
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Saved working directory and index state WIP on main: abc initial\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "clean") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Removing tmp/a.log\nRemoving build/\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "commit") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "[main abc1234] Ship it\n 1 file changed, 1 insertion(+)\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "switch") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Switched to a new branch 'feature/a'\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "checkout") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Switched to a new branch 'work/main'\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "tag") {
          if (request.args[1] === "--list") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "v1.0.0\nv1.1.0\n",
                stderr: "",
              },
            };
          }
          if (request.args[1] === "-d") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "Deleted tag 'v1.0.0' (was abc123)\n",
                stderr: "",
              },
            };
          }
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "branch") {
          if (request.args[1] === "--list") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "* main\n  feature/a\n",
                stderr: "",
              },
            };
          }
          if (request.args[1] === "-d" || request.args[1] === "-D") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "Deleted branch feature/a (was abc123).\n",
                stderr: "",
              },
            };
          }
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "merge") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Merge made by the 'ort' strategy.\n src/index.ts | 1 +\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "rebase") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Successfully rebased and updated refs/heads/feature/a.\n",
              stderr: "",
            },
          };
        }
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: "## main...origin/main [ahead 1]\n M scripts/agentCore_Agent_Test/agentcore_tool_lab.ts\n",
            stderr: "",
          },
        };
      },
    },
  };

  const result = await runMountedGitBaseTool(
    "git.getRepositoryStatus",
    { target: { repositoryPath: "/repo/project", porcelainVersion: "v1" }, context },
    "看一下当前仓库 git 状态",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );

  assert.ok(result);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["/repo/project:status --porcelain=v1 --branch"]);
  const output = result.output as {
    providerCalled: boolean;
    runtimeEntry: { port: string };
    gitArgs: readonly string[];
    resultEnvelope: { branch?: string; ahead?: number; entries: readonly unknown[] };
  };
  assert.equal(output.providerCalled, true);
  assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
  assert.deepEqual(output.gitArgs, ["status", "--porcelain=v1", "--branch"]);
  assert.equal(output.resultEnvelope.branch, "main");
  assert.equal(output.resultEnvelope.ahead, 1);
  assert.equal(output.resultEnvelope.entries.length, 1);

  assert.equal(existsSync(toolLabRuntimePaths.jsonlLogPath), true);
  const log = readFileSync(toolLabRuntimePaths.jsonlLogPath, "utf8");
  assert.match(log, /createBaseToolRegistry\.lookupHandler/u);
  assert.match(log, /BaseToolExecutorPort\.git\.runGit/u);

  const diff = await runMountedGitBaseTool(
    "git.getWorkingTreeDiff",
    { target: { repositoryPath: "/repo/project", mode: "combined", pathspecs: ["src/index.ts"], contextLines: 1 }, context },
    "看一下当前仓库 diff",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(diff?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:diff --unified=1 HEAD -- src/index.ts");
  if (diff?.ok) {
    const output = diff.output as { resultEnvelope: { hunkCount: number }; runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.resultEnvelope.hunkCount, 1);
  }

  const history = await runMountedGitBaseTool(
    "git.getCommitHistory",
    { target: { repositoryPath: "/repo/project", maxCount: 1 }, context },
    "看一下最近提交",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(history?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:log --format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s --max-count 1");
  if (history?.ok) {
    const output = history.output as { resultEnvelope: { entries: readonly { subject: string }[] }; runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.resultEnvelope.entries[0]?.subject, "Initial commit");
  }

  const object = await runMountedGitBaseTool(
    "git.showGitObjectDetails",
    { target: { repositoryPath: "/repo/project", objectRef: "HEAD", format: "raw" }, context },
    "看一下 HEAD 的原始对象信息",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(object?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:show --no-ext-diff --no-patch --pretty=raw HEAD");
  if (object?.ok) {
    const output = object.output as { resultEnvelope: { commit?: { subject?: string } }; runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.resultEnvelope.commit?.subject, "Initial commit");
  }

  const blame = await runMountedGitBaseTool(
    "git.traceLineOwnership",
    {
      target: {
        repositoryPath: "/repo/project",
        filePath: "scripts/agentCore_Agent_Test/agentcore_tool_lab.ts",
        range: { startLine: 1, endLine: 1 },
      },
      context,
    },
    "看一下这个文件第 1 行是谁改的",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(blame?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:blame --line-porcelain -L 1,1 -- scripts/agentCore_Agent_Test/agentcore_tool_lab.ts");
  if (blame?.ok) {
    const output = blame.output as { resultEnvelope: { entries: readonly { author?: string }[] }; runtimeEntry: { port: string } };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.resultEnvelope.entries[0]?.author, "Ada");
  }

  const remove = await runMountedGitBaseTool(
    "git.removeTrackedFile",
    { target: { repositoryPath: "/repo/project", filePath: "src/obsolete.ts", force: true }, context },
    "移除已跟踪文件 src/obsolete.ts",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(remove?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:rm --force -- src/obsolete.ts");
  if (remove?.ok) {
    const output = remove.output as {
      removesTrackedFile: boolean;
      resultEnvelope: { removedPaths: readonly string[]; filePath: string };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesIndex: boolean; mutatesWorkingTree: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "destructive");
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.removesTrackedFile, true);
    assert.equal(output.resultEnvelope.filePath, "src/obsolete.ts");
    assert.deepEqual(output.resultEnvelope.removedPaths, ["src/obsolete.ts"]);
  }

  const move = await runMountedGitBaseTool(
    "git.moveOrRenameFile",
    { target: { repositoryPath: "/repo/project", sourcePath: "src/old.ts", destinationPath: "src/new.ts", force: true }, context },
    "把 src/old.ts 重命名为 src/new.ts",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(move?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:mv --force -- src/old.ts src/new.ts");
  if (move?.ok) {
    const output = move.output as {
      movesTrackedFile: boolean;
      resultEnvelope: { movedPairs: readonly { sourcePath: string; destinationPath: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesIndex: boolean; mutatesWorkingTree: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.movesTrackedFile, true);
    assert.deepEqual(output.resultEnvelope.movedPairs, [{ sourcePath: "src/old.ts", destinationPath: "src/new.ts" }]);
  }

  const ignore = await runMountedGitBaseTool(
    "git.manageIgnoreRules",
    { target: { repositoryPath: "/repo/project", action: "add", ignoreFilePath: ".gitignore", rules: ["dist/"] }, context },
    "把 dist/ 加入 .gitignore",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(ignore?.ok, true);
  assert.deepEqual(calls.slice(-2), ["read:/repo/project/.gitignore", "write:/repo/project/.gitignore:node_modules/\ndist/\n"]);
  if (ignore?.ok) {
    const output = ignore.output as {
      resultEnvelope: { addedRules: readonly string[]; afterRuleCount: number };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesWorkingTree: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.filesystem.readText/writeText");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.deepEqual(output.resultEnvelope.addedRules, ["dist/"]);
    assert.equal(output.resultEnvelope.afterRuleCount, 2);
  }

  const add = await runMountedGitBaseTool(
    "git.addToStaging",
    { target: { repositoryPath: "/repo/project", pathspecs: ["src/index.ts"], intentToAdd: true }, context },
    "把 src/index.ts 加入暂存区",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(add?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:add --intent-to-add -- src/index.ts");
  if (add?.ok) {
    const output = add.output as {
      resultEnvelope: { pathspecs: readonly string[] };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesIndex, true);
    assert.deepEqual(output.resultEnvelope.pathspecs, ["src/index.ts"]);
  }

  const restore = await runMountedGitBaseTool(
    "git.restoreWorkingTree",
    { target: { repositoryPath: "/repo/project", paths: ["src/index.ts"], sourceRef: "HEAD" }, context },
    "恢复 src/index.ts 的工作树改动",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(restore?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:restore --source HEAD --worktree -- src/index.ts");
  if (restore?.ok) {
    const output = restore.output as {
      resultEnvelope: { paths: readonly string[]; sourceRef?: string };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesWorkingTree: boolean; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.risk.mutatesIndex, false);
    assert.deepEqual(output.resultEnvelope.paths, ["src/index.ts"]);
    assert.equal(output.resultEnvelope.sourceRef, "HEAD");
  }

  const reset = await runMountedGitBaseTool(
    "git.resetStagingOrCommit",
    { target: { repositoryPath: "/repo/project", action: "staging", pathspecs: ["src/index.ts"] }, context },
    "取消暂存 src/index.ts",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(reset?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:reset -- src/index.ts");
  if (reset?.ok) {
    const output = reset.output as {
      resultEnvelope: { action: string; pathspecs: readonly string[] };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.resultEnvelope.action, "staging");
    assert.deepEqual(output.resultEnvelope.pathspecs, ["src/index.ts"]);
  }

  const stash = await runMountedGitBaseTool(
    "git.stashChanges",
    {
      target: {
        repositoryPath: "/repo/project",
        message: "checkpoint",
        includeUntracked: true,
        pathspecs: ["src/index.ts"],
      },
      context,
    },
    "保存 src/index.ts 的改动到 stash",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(stash?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:stash push --include-untracked -m checkpoint -- src/index.ts");
  if (stash?.ok) {
    const output = stash.output as {
      resultEnvelope: { createdStashHint?: string; pathspecs: readonly string[] };
      runtimeEntry: { port: string };
      risk: { category: string; createsStashEntry: boolean; mutatesWorkingTree: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.createsStashEntry, true);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.deepEqual(output.resultEnvelope.pathspecs, ["src/index.ts"]);
    assert.equal(output.resultEnvelope.createdStashHint, "Saved working directory and index state WIP on main: abc initial");
  }

  const applyStash = await runMountedGitBaseTool(
    "git.applyStashChanges",
    {
      target: {
        repositoryPath: "/repo/project",
        stashRef: "stash@{0}",
        reinstateIndex: true,
      },
      context,
    },
    "应用 stash@{0} 但保留 stash 记录",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(applyStash?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:stash apply --index stash@{0}");
  if (applyStash?.ok) {
    const output = applyStash.output as {
      resultEnvelope: { appliedHint?: string; stashRef: string; reinstateIndex: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; dropsStashOnSuccess: boolean; mutatesWorkingTree: boolean; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.dropsStashOnSuccess, false);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.resultEnvelope.stashRef, "stash@{0}");
    assert.equal(output.resultEnvelope.reinstateIndex, true);
    assert.equal(output.resultEnvelope.appliedHint, "On branch main");
  }

  const popStash = await runMountedGitBaseTool(
    "git.popStashChanges",
    {
      target: {
        repositoryPath: "/repo/project",
        stashRef: "stash@{0}",
        reinstateIndex: true,
      },
      context,
    },
    "弹出 stash@{0} 并删除 stash 记录",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(popStash?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:stash pop --index stash@{0}");
  if (popStash?.ok) {
    const output = popStash.output as {
      dropsStashOnSuccess: boolean;
      resultEnvelope: { poppedHint?: string; stashRef: string; reinstateIndex: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; dropsStashOnSuccess: boolean; mutatesWorkingTree: boolean; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.dropsStashOnSuccess, true);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.dropsStashOnSuccess, true);
    assert.equal(output.resultEnvelope.stashRef, "stash@{0}");
    assert.equal(output.resultEnvelope.reinstateIndex, true);
    assert.equal(output.resultEnvelope.poppedHint, "On branch main");
  }

  const clean = await runMountedGitBaseTool(
    "git.cleanUntrackedFiles",
    {
      target: {
        repositoryPath: "/repo/project",
        paths: ["tmp/a.log", "build"],
        includeDirectories: true,
        ignoredMode: "tracked-ignored",
      },
      context,
    },
    "清理 tmp/a.log 和 build 这些未跟踪文件",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(clean?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:clean -f -d -x -- tmp/a.log build");
  if (clean?.ok) {
    const output = clean.output as {
      deletesUntrackedFiles: boolean;
      resultEnvelope: { removedPaths: readonly string[]; paths: readonly string[]; ignoredMode: string };
      runtimeEntry: { port: string };
      risk: { category: string; deletesUntrackedFiles: boolean; mayDeleteIgnoredFiles: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "destructive");
    assert.equal(output.risk.deletesUntrackedFiles, true);
    assert.equal(output.risk.mayDeleteIgnoredFiles, true);
    assert.equal(output.deletesUntrackedFiles, true);
    assert.deepEqual(output.resultEnvelope.paths, ["tmp/a.log", "build"]);
    assert.equal(output.resultEnvelope.ignoredMode, "tracked-ignored");
    assert.deepEqual(output.resultEnvelope.removedPaths, ["tmp/a.log", "build/"]);
  }

  const createCommit = await runMountedGitBaseTool(
    "git.createCommit",
    {
      target: {
        repositoryPath: "/repo/project",
        commitMessage: "Ship it",
        includeAllTracked: true,
        signoff: true,
      },
      context,
    },
    "提交当前 tracked 改动",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(createCommit?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:commit --all --signoff -m Ship it");
  if (createCommit?.ok) {
    const output = createCommit.output as {
      createsCommit: boolean;
      resultEnvelope: { commitHash?: string; branchName?: string; subject?: string; commitCreated: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; createsCommit: boolean; mutatesRepository: boolean; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.createsCommit, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.createsCommit, true);
    assert.equal(output.resultEnvelope.commitHash, "abc1234");
    assert.equal(output.resultEnvelope.branchName, "main");
    assert.equal(output.resultEnvelope.subject, "Ship it");
    assert.equal(output.resultEnvelope.commitCreated, true);
  }

  const branch = await runMountedGitBaseTool(
    "git.switchBranch",
    {
      target: {
        repositoryPath: "/repo/project",
        branchName: "feature/a",
        create: true,
        startPoint: "origin/main",
        track: true,
      },
      context,
    },
    "从 origin/main 创建并切换到 feature/a",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(branch?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:switch --track -c feature/a origin/main");
  if (branch?.ok) {
    const output = branch.output as {
      switchesBranch: boolean;
      resultEnvelope: { branchName: string; createdBranch: boolean; switchedBranchHint?: string };
      runtimeEntry: { port: string };
      risk: { category: string; switchesBranch: boolean; createsBranch: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.switchesBranch, true);
    assert.equal(output.risk.createsBranch, true);
    assert.equal(output.switchesBranch, true);
    assert.equal(output.resultEnvelope.branchName, "feature/a");
    assert.equal(output.resultEnvelope.createdBranch, true);
    assert.equal(output.resultEnvelope.switchedBranchHint, "Switched to a new branch 'feature/a'");
  }

  const checkout = await runMountedGitBaseTool(
    "git.checkoutTarget",
    {
      target: {
        repositoryPath: "/repo/project",
        targetRef: "origin/main",
        newBranchName: "work/main",
      },
      context,
    },
    "从 origin/main 检出新分支 work/main",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(checkout?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:checkout -b work/main origin/main");
  if (checkout?.ok) {
    const output = checkout.output as {
      checksOutTarget: boolean;
      resultEnvelope: { targetRef: string; createdBranch: boolean; checkoutHint?: string };
      runtimeEntry: { port: string };
      risk: { category: string; checksOutTarget: boolean; createsBranch: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.checksOutTarget, true);
    assert.equal(output.risk.createsBranch, true);
    assert.equal(output.checksOutTarget, true);
    assert.equal(output.resultEnvelope.targetRef, "origin/main");
    assert.equal(output.resultEnvelope.createdBranch, true);
    assert.equal(output.resultEnvelope.checkoutHint, "Switched to a new branch 'work/main'");
  }

  const tag = await runMountedGitBaseTool(
    "git.manageTag",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "annotate",
        tagName: "v1.0.0",
        targetRef: "HEAD",
        message: "release",
      },
      context,
    },
    "给 HEAD 创建 annotated tag v1.0.0",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(tag?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:tag -a v1.0.0 HEAD -m release");
  if (tag?.ok) {
    const output = tag.output as {
      managesTag: boolean;
      resultEnvelope: { action: string; tagName?: string; tagCreated: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; createsTag: boolean; mutatesRepository: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.createsTag, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.managesTag, true);
    assert.equal(output.resultEnvelope.action, "annotate");
    assert.equal(output.resultEnvelope.tagName, "v1.0.0");
    assert.equal(output.resultEnvelope.tagCreated, true);
  }

  const manageBranch = await runMountedGitBaseTool(
    "git.manageBranch",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "rename",
        branchName: "feature/a",
        newBranchName: "feature/b",
        force: true,
      },
      context,
    },
    "把 feature/a 重命名为 feature/b",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(manageBranch?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:branch -M feature/a feature/b");
  if (manageBranch?.ok) {
    const output = manageBranch.output as {
      managesBranch: boolean;
      resultEnvelope: { action: string; branchName?: string; newBranchName?: string; branchRenamed: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; renamesBranch: boolean; mutatesRepository: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.renamesBranch, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.managesBranch, true);
    assert.equal(output.resultEnvelope.action, "rename");
    assert.equal(output.resultEnvelope.branchName, "feature/a");
    assert.equal(output.resultEnvelope.newBranchName, "feature/b");
    assert.equal(output.resultEnvelope.branchRenamed, true);
  }

  const merge = await runMountedGitBaseTool(
    "git.mergeBranch",
    {
      target: {
        repositoryPath: "/repo/project",
        sourceBranch: "feature/a",
        mode: "no-ff",
        commitMessage: "Merge feature/a",
      },
      context,
    },
    "把 feature/a 合并进当前分支",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(merge?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:merge --no-ff -m Merge feature/a feature/a");
  if (merge?.ok) {
    const output = merge.output as {
      mergesBranch: boolean;
      resultEnvelope: { sourceBranch: string; mergeCommitCreated: boolean; mergeHint?: string };
      runtimeEntry: { port: string };
      risk: { category: string; mayCreateCommit: boolean; mayCreateConflicts: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.mayCreateCommit, true);
    assert.equal(output.risk.mayCreateConflicts, true);
    assert.equal(output.mergesBranch, true);
    assert.equal(output.resultEnvelope.sourceBranch, "feature/a");
    assert.equal(output.resultEnvelope.mergeCommitCreated, true);
    assert.equal(output.resultEnvelope.mergeHint, "Merge made by the 'ort' strategy.");
  }

  const rebase = await runMountedGitBaseTool(
    "git.rebaseBranch",
    {
      target: {
        repositoryPath: "/repo/project",
        upstreamRef: "main",
        branchName: "feature/a",
        ontoRef: "origin/main",
        autosquash: true,
      },
      context,
    },
    "把 feature/a 变基到 origin/main 上",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(rebase?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:rebase --autosquash --onto origin/main main feature/a");
  if (rebase?.ok) {
    const output = rebase.output as {
      rebasesBranch: boolean;
      resultEnvelope: { upstreamRef: string; branchName?: string; ontoRef?: string; rebaseCompleted: boolean; rebaseHint?: string };
      runtimeEntry: { port: string };
      risk: { category: string; rewritesHistory: boolean; mayCreateConflicts: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.rewritesHistory, true);
    assert.equal(output.risk.mayCreateConflicts, true);
    assert.equal(output.rebasesBranch, true);
    assert.equal(output.resultEnvelope.upstreamRef, "main");
    assert.equal(output.resultEnvelope.branchName, "feature/a");
    assert.equal(output.resultEnvelope.ontoRef, "origin/main");
    assert.equal(output.resultEnvelope.rebaseCompleted, true);
    assert.equal(output.resultEnvelope.rebaseHint, "Successfully rebased and updated refs/heads/feature/a.");
  }
});

test("tool lab does not auto-whitelist model-provided git repository paths", async () => {
  let providerCalled = false;
  const executor: BaseToolExecutorPort = {
    git: {
      async runGit() {
        providerCalled = true;
        return { ok: true, output: { exitCode: 0, stdout: "", stderr: "" } };
      },
    },
  };

  const result = await runMountedGitBaseTool(
    "git.getRepositoryStatus",
    {
      target: { repositoryPath: "/untrusted/repo", porcelainVersion: "v1" },
      context: { allowedRepositoryRoots: ["/untrusted/repo"] },
    },
    "看一下这个外部仓库状态",
    executor,
  );

  assert.equal(result?.ok, false);
  assert.match(result?.error ?? "", /SCOPE_REJECTED/u);
  assert.equal(providerCalled, false);
});

test("tool lab rejects unknown git tools instead of falling back to arbitrary git execution", async () => {
  const result = await runTool("git.someUnknownTool", { subcommand: "status", args: ["--short"] });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /arbitrary git\.execute fallback is disabled/u);
});
