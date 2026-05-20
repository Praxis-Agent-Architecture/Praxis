import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import test, { after } from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  runMountedGitBaseTool,
  runTool,
  toolLabRuntimePaths,
} from "../../../../../../examples/scripts/agentcore_tool_lab.js";

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
                "filename examples/scripts/agentcore_tool_lab.ts\n" +
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
        if (request.args[0] === "commit" && request.args.includes("--amend")) {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "[main def5678] Refined\n 2 files changed, 3 insertions(+), 1 deletion(-)\n",
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
        if (request.args[0] === "cherry-pick") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "[main cafe123] Pick feature\n 1 file changed, 2 insertions(+)\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "revert") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "[main beef456] Revert \"Pick feature\"\n 1 file changed, 1 deletion(-)\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "init") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Initialized empty Git repository in /repo/new-project/.git/\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "clone") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "Cloning into '/repo/project-copy'...\n",
            },
          };
        }
        if (request.args[0] === "archive") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "worktree") {
          if (request.args[1] === "list") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "worktree /repo/project\nHEAD abcdef123456\nbranch refs/heads/main\n\nworktree /repo/worktrees/feature\nHEAD 111111\nbranch refs/heads/feature/a\n",
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
        if (request.args[0] === "submodule") {
          if (request.args[1] === "status") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: " abcdef1234567890 vendor/toolkit (heads/main)\n",
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
        if (request.args[0] === "rev-list") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "abcdef1234567890 (dist=1)\n1111111111111111 (dist=2)\n",
              stderr: "",
            },
          };
        }
        if (request.args[0] === "remote") {
          if (request.args[1] === "-v") {
            return {
              ok: true,
              output: {
                exitCode: 0,
                stdout: "origin\thttps://example.com/project.git (fetch)\norigin\thttps://example.com/project.git (push)\n",
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
        if (request.args[0] === "fetch") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "",
              stderr: "From https://example.com/project.git\n * [new branch] main -> origin/main\n",
            },
          };
        }
        if (request.args[0] === "pull") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "Already up to date.\n",
              stderr: "From https://example.com/project.git\n",
            },
          };
        }
        if (request.args[0] === "push") {
          return {
            ok: true,
            output: {
              exitCode: 0,
              stdout: "branch 'feature/a' set up to track 'origin/feature/a'.\n",
              stderr: "To https://example.com/project.git\n * [new branch] feature/a -> feature/a\n",
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
            stdout: "## main...origin/main [ahead 1]\n M examples/scripts/agentcore_tool_lab.ts\n",
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
        filePath: "examples/scripts/agentcore_tool_lab.ts",
        range: { startLine: 1, endLine: 1 },
      },
      context,
    },
    "看一下这个文件第 1 行是谁改的",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(blame?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:blame --line-porcelain -L 1,1 -- examples/scripts/agentcore_tool_lab.ts");
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

  const amendCommit = await runMountedGitBaseTool(
    "git.amendLastCommit",
    {
      target: {
        repositoryPath: "/repo/project",
        commitMessage: "Refined",
        includeAllTracked: true,
        resetAuthor: true,
      },
      context,
    },
    "把 tracked 改动修订进最后一次提交，并更新提交信息",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(amendCommit?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:commit --amend --all --reset-author -m Refined");
  if (amendCommit?.ok) {
    const output = amendCommit.output as {
      amendsCommit: boolean;
      rewritesHistory: boolean;
      resultEnvelope: { commitHash?: string; branchName?: string; subject?: string; commitAmended: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; amendsCommit: boolean; rewritesHistory: boolean; mutatesRepository: boolean; mutatesIndex: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.amendsCommit, true);
    assert.equal(output.risk.rewritesHistory, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.amendsCommit, true);
    assert.equal(output.rewritesHistory, true);
    assert.equal(output.resultEnvelope.commitHash, "def5678");
    assert.equal(output.resultEnvelope.branchName, "main");
    assert.equal(output.resultEnvelope.subject, "Refined");
    assert.equal(output.resultEnvelope.commitAmended, true);
  }

  const cherryPick = await runMountedGitBaseTool(
    "git.cherryPickCommit",
    {
      target: {
        repositoryPath: "/repo/project",
        commitRef: "abc123",
        signoff: true,
      },
      context,
    },
    "把 abc123 cherry-pick 到当前分支",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(cherryPick?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:cherry-pick --signoff abc123");
  if (cherryPick?.ok) {
    const output = cherryPick.output as {
      appliesCommit: boolean;
      resultEnvelope: { commitHash?: string; branchName?: string; subject?: string; cherryPickCompleted: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; appliesCommit: boolean; mutatesRepository: boolean; mutatesIndex: boolean; mayCreateConflicts: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.appliesCommit, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.risk.mayCreateConflicts, true);
    assert.equal(output.appliesCommit, true);
    assert.equal(output.resultEnvelope.commitHash, "cafe123");
    assert.equal(output.resultEnvelope.branchName, "main");
    assert.equal(output.resultEnvelope.subject, "Pick feature");
    assert.equal(output.resultEnvelope.cherryPickCompleted, true);
  }

  const revert = await runMountedGitBaseTool(
    "git.revertCommit",
    {
      target: {
        repositoryPath: "/repo/project",
        commitRef: "deadbeef",
      },
      context,
    },
    "反向回滚 deadbeef",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(revert?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:revert deadbeef");
  if (revert?.ok) {
    const output = revert.output as {
      revertsCommit: boolean;
      resultEnvelope: { commitHash?: string; branchName?: string; subject?: string; revertCompleted: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; revertsCommit: boolean; mutatesRepository: boolean; mutatesIndex: boolean; mayCreateConflicts: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "history-mutation");
    assert.equal(output.risk.revertsCommit, true);
    assert.equal(output.risk.mutatesRepository, true);
    assert.equal(output.risk.mutatesIndex, true);
    assert.equal(output.risk.mayCreateConflicts, true);
    assert.equal(output.revertsCommit, true);
    assert.equal(output.resultEnvelope.commitHash, "beef456");
    assert.equal(output.resultEnvelope.branchName, "main");
    assert.equal(output.resultEnvelope.subject, 'Revert "Pick feature"');
    assert.equal(output.resultEnvelope.revertCompleted, true);
  }

  const initRepository = await runMountedGitBaseTool(
    "git.initializeRepository",
    {
      target: {
        repositoryPath: "/repo/new-project",
        initialBranch: "main",
      },
      context,
    },
    "初始化 /repo/new-project 为 Git 仓库",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(initRepository?.ok, true);
  assert.equal(calls.at(-1), "/repo/new-project:init --initial-branch main");
  if (initRepository?.ok) {
    const output = initRepository.output as {
      resultEnvelope: { initialized: boolean; initialBranch?: string };
      runtimeEntry: { port: string };
      risk: { category: string; createsRepositoryMetadata: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.createsRepositoryMetadata, true);
    assert.equal(output.resultEnvelope.initialized, true);
    assert.equal(output.resultEnvelope.initialBranch, "main");
  }

  const cloneRepository = await runMountedGitBaseTool(
    "git.cloneRepository",
    {
      target: {
        repositoryPath: "/repo",
        remoteUrl: "https://example.com/project.git",
        destinationPath: "/repo/project-copy",
        branch: "main",
        depth: 1,
        singleBranch: true,
      },
      context,
    },
    "克隆 project.git 到 /repo/project-copy",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(cloneRepository?.ok, true);
  assert.equal(calls.at(-1), "/repo:clone --branch main --depth 1 --single-branch https://example.com/project.git /repo/project-copy");
  if (cloneRepository?.ok) {
    const output = cloneRepository.output as {
      mayUseNetwork: boolean;
      resultEnvelope: { cloned: boolean; destinationPath: string };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "remote-network");
    assert.equal(output.risk.mayUseNetwork, true);
    assert.equal(output.mayUseNetwork, true);
    assert.equal(output.resultEnvelope.cloned, true);
    assert.equal(output.resultEnvelope.destinationPath, "/repo/project-copy");
  }

  const archiveRepository = await runMountedGitBaseTool(
    "git.archiveRepository",
    {
      target: {
        repositoryPath: "/repo/project",
        outputPath: "/repo/project.tar",
        ref: "HEAD",
        format: "tar",
        pathspecs: ["src"],
      },
      context,
    },
    "把 /repo/project 的 src 导出成 tar",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(archiveRepository?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:archive --format=tar --output /repo/project.tar HEAD src");
  if (archiveRepository?.ok) {
    const output = archiveRepository.output as {
      resultEnvelope: { archiveCreated: boolean; outputPath: string; pathspecCount: number };
      runtimeEntry: { port: string };
      risk: { category: string; writesArchiveFile: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.writesArchiveFile, true);
    assert.equal(output.resultEnvelope.archiveCreated, true);
    assert.equal(output.resultEnvelope.outputPath, "/repo/project.tar");
    assert.equal(output.resultEnvelope.pathspecCount, 1);
  }

  const worktreeList = await runMountedGitBaseTool(
    "git.manageWorktree",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "list",
      },
      context,
    },
    "列出当前仓库 worktree",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(worktreeList?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:worktree list --porcelain");
  if (worktreeList?.ok) {
    const output = worktreeList.output as {
      resultEnvelope: { worktrees: readonly { path: string; branch?: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; managesWorktree: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "read-only-inspection");
    assert.equal(output.risk.managesWorktree, true);
    assert.equal(output.resultEnvelope.worktrees.length, 2);
    assert.equal(output.resultEnvelope.worktrees[1]?.branch, "refs/heads/feature/a");
  }

  const submoduleStatus = await runMountedGitBaseTool(
    "git.manageSubmodule",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "status",
        recursive: true,
      },
      context,
    },
    "查看当前仓库 submodule 状态",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(submoduleStatus?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:submodule status --recursive");
  if (submoduleStatus?.ok) {
    const output = submoduleStatus.output as {
      resultEnvelope: { entries: readonly { path?: string; status?: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean; mutatesGitMetadata: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "read-only-inspection");
    assert.equal(output.risk.mayUseNetwork, false);
    assert.equal(output.risk.mutatesGitMetadata, false);
    assert.equal(output.resultEnvelope.entries[0]?.path, "vendor/toolkit");
    assert.equal(output.resultEnvelope.entries[0]?.status, "initialized");
  }

  const locateProblemCommit = await runMountedGitBaseTool(
    "git.locateProblemCommit",
    {
      target: {
        repositoryPath: "/repo/project",
        knownGoodRef: "main~3",
        knownBadRef: "HEAD",
        verificationCommand: "npm test",
        maxSteps: 16,
      },
      context,
    },
    "定位 main~3 到 HEAD 之间的问题提交候选",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(locateProblemCommit?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:rev-list --bisect-all main~3..HEAD");
  if (locateProblemCommit?.ok) {
    const output = locateProblemCommit.output as {
      resultEnvelope: { bestCandidate?: string; candidateCount: number; verificationCommandExecuted: boolean };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesGitMetadata: boolean };
      verificationCommandExecuted: boolean;
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "read-only-inspection");
    assert.equal(output.risk.mutatesGitMetadata, false);
    assert.equal(output.verificationCommandExecuted, false);
    assert.equal(output.resultEnvelope.verificationCommandExecuted, false);
    assert.equal(output.resultEnvelope.bestCandidate, "abcdef1234567890");
    assert.equal(output.resultEnvelope.candidateCount, 2);
  }

  const remoteList = await runMountedGitBaseTool(
    "git.manageRemote",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "list",
      },
      context,
    },
    "列出当前仓库 remotes",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(remoteList?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:remote -v");
  if (remoteList?.ok) {
    const output = remoteList.output as {
      resultEnvelope: { remotes: readonly { name: string; mode?: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "read-only-inspection");
    assert.equal(output.risk.mayUseNetwork, false);
    assert.equal(output.resultEnvelope.remotes.length, 2);
    assert.equal(output.resultEnvelope.remotes[0]?.name, "origin");
    assert.equal(output.resultEnvelope.remotes[0]?.mode, "fetch");
  }

  const remoteSetUrl = await runMountedGitBaseTool(
    "git.manageRemote",
    {
      target: {
        repositoryPath: "/repo/project",
        action: "set-url",
        remoteName: "origin",
        remoteUrl: "git@example.com:org/project.git",
        urlMode: "push",
      },
      context,
    },
    "把 origin 的 push URL 改成 git@example.com:org/project.git",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(remoteSetUrl?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:remote set-url --push origin git@example.com:org/project.git");
  if (remoteSetUrl?.ok) {
    const output = remoteSetUrl.output as {
      resultEnvelope: { remoteChanged: boolean; remoteName?: string; urlMode: string };
      runtimeEntry: { port: string };
      risk: { category: string; mutatesRemoteConfig: boolean; mayUseNetwork: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "workspace-mutation");
    assert.equal(output.risk.mutatesRemoteConfig, true);
    assert.equal(output.risk.mayUseNetwork, false);
    assert.equal(output.resultEnvelope.remoteChanged, true);
    assert.equal(output.resultEnvelope.remoteName, "origin");
    assert.equal(output.resultEnvelope.urlMode, "push");
  }

  const fetchRemote = await runMountedGitBaseTool(
    "git.fetchRemoteUpdates",
    {
      target: {
        repositoryPath: "/repo/project",
        remoteName: "origin",
        refspecs: ["main"],
        prune: true,
        tagsMode: "no-tags",
      },
      context,
    },
    "抓取 origin main 的远端更新",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(fetchRemote?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:fetch --prune --no-tags origin main");
  if (fetchRemote?.ok) {
    const output = fetchRemote.output as {
      resultEnvelope: { fetched: boolean; updateLines: readonly { destination?: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean; updatesRemoteTrackingRefs: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "remote-network");
    assert.equal(output.risk.mayUseNetwork, true);
    assert.equal(output.risk.updatesRemoteTrackingRefs, true);
    assert.equal(output.resultEnvelope.fetched, true);
    assert.equal(output.resultEnvelope.updateLines[0]?.destination, "origin/main");
  }

  const pullRemote = await runMountedGitBaseTool(
    "git.pullRemoteChanges",
    {
      target: {
        repositoryPath: "/repo/project",
        remoteName: "origin",
        branchName: "main",
        integrationMode: "ff-only",
      },
      context,
    },
    "拉取 origin main 并只允许 fast-forward",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(pullRemote?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:pull --ff-only origin main");
  if (pullRemote?.ok) {
    const output = pullRemote.output as {
      resultEnvelope: { pulled: boolean; integrationMode: string };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean; mutatesWorkingTree: boolean; mayCreateConflicts: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "remote-network");
    assert.equal(output.risk.mayUseNetwork, true);
    assert.equal(output.risk.mutatesWorkingTree, true);
    assert.equal(output.risk.mayCreateConflicts, true);
    assert.equal(output.resultEnvelope.pulled, true);
    assert.equal(output.resultEnvelope.integrationMode, "ff-only");
  }

  const pushRemote = await runMountedGitBaseTool(
    "git.pushLocalChanges",
    {
      target: {
        repositoryPath: "/repo/project",
        remoteName: "origin",
        branchName: "feature/a",
        setUpstream: true,
      },
      context,
    },
    "推送 feature/a 到 origin 并设置 upstream",
    executor,
    { trustedAllowedRepositoryRoots: ["/repo"] },
  );
  assert.equal(pushRemote?.ok, true);
  assert.equal(calls.at(-1), "/repo/project:push --set-upstream origin feature/a");
  if (pushRemote?.ok) {
    const output = pushRemote.output as {
      resultEnvelope: { pushed: boolean; pushLines: readonly { operation?: string }[] };
      runtimeEntry: { port: string };
      risk: { category: string; mayUseNetwork: boolean; mutatesRemote: boolean };
    };
    assert.equal(output.runtimeEntry.port, "BaseToolExecutorPort.git.runGit");
    assert.equal(output.risk.category, "remote-network");
    assert.equal(output.risk.mayUseNetwork, true);
    assert.equal(output.risk.mutatesRemote, true);
    assert.equal(output.resultEnvelope.pushed, true);
    assert.equal(output.resultEnvelope.pushLines.some((line) => line.operation === "new"), true);
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
