#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const tasksRoot = path.resolve(path.dirname(scriptPath), "..");
const archRoot = path.resolve(tasksRoot, "..");
const repoRoot = path.resolve(archRoot, "..");
const ledgerPath = path.join(tasksRoot, "ledger.json");
const runsRoot = path.join(tasksRoot, "runs");
const activeRunsPath = path.join(runsRoot, "active-runs.json");
const srcRoot = path.join(archRoot, "src", "agentCore");
const worktreesRoot = process.env.AGENTCORE_WORKTREES_ROOT
  ? path.resolve(process.env.AGENTCORE_WORKTREES_ROOT)
  : path.resolve(repoRoot, "..", "Praxis_org_agentcore_worktrees");

const DEFAULT_BASE_BRANCH = process.env.AGENTCORE_BASE_BRANCH ?? "dev/rebase";
const DEFAULT_GROUP_SIZE = Number(process.env.AGENTCORE_GROUP_SIZE ?? "4");
const DEFAULT_MAX_ACTIVE = Number(process.env.AGENTCORE_MAX_ACTIVE ?? "4");

const roleModel = {
  worker: { model: "gpt-5.4", reasoning: "high" },
  reviewer: { model: "gpt-5.4", reasoning: "high" },
  merge: { model: "gpt-5.4", reasoning: "medium" },
};

const bigSpecs = [
  {
    id: "AC-SPEC-A",
    title: "runtime 契约与应用入口",
    matcher: (rel) =>
      rel.startsWith("agent_runtimeImplementation/runtime.contractSurface/") ||
      rel.startsWith("agent_runtimeImplementation/runtime.applicationSurface/") ||
      rel.startsWith("agent_runtimeImplementation/runtime.invocationMethod/"),
  },
  {
    id: "AC-SPEC-B",
    title: "runtime 治理与官方模块入口",
    matcher: (rel) =>
      rel.startsWith("agent_runtimeImplementation/runtime.governancePlane/") ||
      rel.startsWith("agent_runtimeImplementation/runtime.officialModuleSurface/") ||
      rel.startsWith("agent_interfaceAdapter/"),
  },
  {
    id: "AC-SPEC-C",
    title: "PromptPack 与执行核心",
    matcher: (rel) =>
      rel.startsWith("agent_executionEngine/promptPack/") ||
      rel.startsWith("agent_executionEngine/coreLogic/") ||
      rel.startsWith("agent_executionEngine/IOTransceiver/") ||
      rel.startsWith("agent_runtimeImplementation/runtime.execEngine/"),
  },
  {
    id: "AC-SPEC-D",
    title: "模型适配链",
    matcher: (rel) =>
      rel.startsWith("agent_modelAdapter/") ||
      rel.startsWith("agent_runtimeImplementation/runtime.modelAdapter/"),
  },
  {
    id: "AC-SPEC-E",
    title: "基础工具原语层",
    matcher: (rel) => rel.startsWith("agent_executionEngine/basic_toolLayer/"),
  },
  {
    id: "AC-SPEC-F",
    title: "运行质量面",
    matcher: (rel) => rel.startsWith("agent_runtimeImplementation/"),
  },
];

function usage() {
  console.log(`Usage:
  node tasks/scripts/agentcore_workflow.mjs init [--force] [--group-size N]
  node tasks/scripts/agentcore_workflow.mjs preflight
  node tasks/scripts/agentcore_workflow.mjs status
  node tasks/scripts/agentcore_workflow.mjs next [--limit N] [--spec AC-SPEC-A]
  node tasks/scripts/agentcore_workflow.mjs prompt <group-id> --role worker|reviewer|merge
  node tasks/scripts/agentcore_workflow.mjs pipeline <group-id> [--execute] [--worktree] [--roles worker,reviewer,merge]
  node tasks/scripts/agentcore_workflow.mjs batch [--limit N] [--spec AC-SPEC-A] [--execute] [--worktree] [--max-active N] [--roles worker,reviewer]
  node tasks/scripts/agentcore_workflow.mjs continue --spec AC-SPEC-A [--execute] [--worktree] [--max-active N] [--sleep-ms N]
  node tasks/scripts/agentcore_workflow.mjs complete <group-id> --status implemented|reviewed|done|needs_rework|failed [--note "..."]
  node tasks/scripts/agentcore_workflow.mjs release <group-id> [--note "..."]
  node tasks/scripts/agentcore_workflow.mjs active
  node tasks/scripts/agentcore_workflow.mjs reap
  node tasks/scripts/agentcore_workflow.mjs kill <run-id|group-id|all> [--execute]

Role model policy:
  worker   -> gpt-5.4 / high
  reviewer -> gpt-5.4 / high
  merge    -> gpt-5.4 / medium
`);
}

function arg(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function has(name) {
  return process.argv.includes(name);
}

function now() {
  return new Date().toISOString();
}

function walk(dir, suffix) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, suffix));
    if (entry.isFile() && full.endsWith(suffix)) out.push(full);
  }
  return out.sort();
}

function shell(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    input: options.input,
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
  });
}

function mustShell(command, args, options = {}) {
  const result = shell(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  return result;
}

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toRepoPath(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

function classify(rel) {
  return bigSpecs.find((spec) => spec.matcher(rel)) ?? bigSpecs[bigSpecs.length - 1];
}

function smallSpecId(bigId, rel) {
  const parts = rel.split("/");
  if (parts[0] === "agent_runtimeImplementation") return `${bigId}:${parts[1] ?? "root"}`;
  if (parts[0] === "agent_executionEngine") return `${bigId}:${parts[1] ?? "root"}`;
  if (parts[0] === "agent_modelAdapter") return `${bigId}:${parts[1] ?? "root"}`;
  if (parts[0] === "agent_interfaceAdapter") return `${bigId}:${parts[1] ?? "root"}`;
  return `${bigId}:root`;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildLedger() {
  const groupSize = Number(arg("--group-size", String(DEFAULT_GROUP_SIZE)));
  const sources = walk(srcRoot, ".ts");
  const smallSpecs = new Map();
  const fileTasks = [];

  for (const sourceAbs of sources) {
    const rel = path.relative(srcRoot, sourceAbs).split(path.sep).join("/");
    const big = classify(rel);
    const smallId = smallSpecId(big.id, rel);
    if (!smallSpecs.has(smallId)) {
      smallSpecs.set(smallId, {
        id: smallId,
        parentId: big.id,
        title: smallId.split(":")[1],
        status: "pending",
        groupTaskIds: [],
        fileTaskIds: [],
      });
    }

    const id = `AC-F-${String(fileTasks.length + 1).padStart(4, "0")}`;
    const docRel = rel.replace(/\.ts$/, ".md");
    const testRel = rel.replace(/\.ts$/, ".test.ts");
    const fileTask = {
      id,
      parentId: smallId,
      bigSpecId: big.id,
      status: "pending",
      sourcePath: `Praxis_Agent_Architecture/src/agentCore/${rel}`,
      docPath: `Praxis_Agent_Architecture/docs/agentCore/${docRel}`,
      testPath: `Praxis_Agent_Architecture/test/agentCore/${testRel}`,
    };
    smallSpecs.get(smallId).fileTaskIds.push(id);
    fileTasks.push(fileTask);
  }

  const groupTasks = [];
  for (const small of smallSpecs.values()) {
    const files = small.fileTaskIds.map((id) => fileTasks.find((fileTask) => fileTask.id === id));
    for (const filesInGroup of chunk(files, groupSize)) {
      const id = `AC-G-${String(groupTasks.length + 1).padStart(4, "0")}`;
      const group = {
        id,
        parentId: small.id,
        bigSpecId: small.parentId,
        status: "pending",
        fileTaskIds: filesInGroup.map((fileTask) => fileTask.id),
        files: filesInGroup.map((fileTask) => ({
          sourcePath: fileTask.sourcePath,
          docPath: fileTask.docPath,
          testPath: fileTask.testPath,
        })),
        branch: `codex/agentcore/${id.toLowerCase()}`,
        worktreePath: path.join(
          process.env.AGENTCORE_WORKTREES_ROOT
            ? path.resolve(process.env.AGENTCORE_WORKTREES_ROOT)
            : path.resolve(repoRoot, "..", "Praxis_org_agentcore_worktrees"),
          id,
        ),
        lease: null,
        attempts: [],
        notes: [],
      };
      small.groupTaskIds.push(id);
      groupTasks.push(group);
    }
  }

  const smallSpecList = [...smallSpecs.values()];
  return {
    version: 3,
    generatedAt: now(),
    updatedAt: now(),
    repoRoot,
    baseBranch: DEFAULT_BASE_BRANCH,
    groupSize,
    roleModel,
    worktreesRoot,
    bigSpecs: bigSpecs.map((spec) => ({
      id: spec.id,
      title: spec.title,
      status: "pending",
      smallSpecIds: smallSpecList.filter((small) => small.parentId === spec.id).map((small) => small.id),
    })),
    smallSpecs: smallSpecList,
    fileTasks,
    groupTasks,
    history: [{ at: now(), event: "init", message: `generated ${groupTasks.length} group tasks from ${fileTasks.length} file tasks` }],
  };
}

function normalizeLedger(ledger) {
  if (!ledger.groupTasks) {
    // Old ledgers are deliberately regenerated instead of silently converted,
    // because micro-spec grouping is semantically important.
    throw new Error("ledger has no groupTasks. Run init --force to regenerate micro-spec groups.");
  }
  ledger.roleModel = ledger.roleModel ?? roleModel;
  ledger.worktreesRoot = ledger.worktreesRoot ?? worktreesRoot;
  ledger.history = ledger.history ?? [];
  for (const group of ledger.groupTasks) {
    group.branch = group.branch ?? `codex/agentcore/${group.id.toLowerCase()}`;
    group.worktreePath = group.worktreePath ?? path.join(worktreesRoot, group.id);
    group.lease = group.lease ?? null;
    group.attempts = group.attempts ?? [];
    group.notes = group.notes ?? [];
  }
  return ledger;
}

function loadLedger() {
  if (!existsSync(ledgerPath)) throw new Error("ledger not found. Run init first.");
  return normalizeLedger(loadJson(ledgerPath));
}

function saveLedger(ledger) {
  ledger.updatedAt = now();
  writeJson(ledgerPath, ledger);
}

function loadActiveRuns() {
  return loadJson(path.join(runsRoot, "active-runs.json"), []);
}

function saveActiveRuns(runs) {
  writeJson(path.join(runsRoot, "active-runs.json"), runs);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function itemById(ledger, id) {
  const group = ledger.groupTasks.find((task) => task.id === id);
  if (!group) throw new Error(`group task not found: ${id}`);
  return group;
}

function fileTasksForGroup(ledger, group) {
  return group.fileTaskIds.map((id) => ledger.fileTasks.find((task) => task.id === id)).filter(Boolean);
}

function statusOfChildren(children) {
  if (children.length === 0) return "pending";
  if (children.every((item) => item.status === "done")) return "done";
  if (children.some((item) => item.status === "failed")) return "failed";
  if (children.some((item) => item.status !== "pending")) return "in_progress";
  return "pending";
}

function refreshParentStatus(ledger) {
  for (const group of ledger.groupTasks) {
    for (const fileTask of fileTasksForGroup(ledger, group)) {
      fileTask.status = group.status;
    }
  }
  for (const small of ledger.smallSpecs) {
    const children = small.groupTaskIds.map((id) => ledger.groupTasks.find((task) => task.id === id)).filter(Boolean);
    small.status = statusOfChildren(children);
  }
  for (const big of ledger.bigSpecs) {
    const children = big.smallSpecIds.map((id) => ledger.smallSpecs.find((task) => task.id === id)).filter(Boolean);
    big.status = statusOfChildren(children);
  }
}

function pendingGroups(ledger) {
  const spec = arg("--spec");
  return ledger.groupTasks.filter((task) => task.status === "pending" && (!spec || task.bigSpecId === spec));
}

function commandInit() {
  if (existsSync(ledgerPath) && !has("--force")) throw new Error("ledger already exists. Use --force.");
  mkdirSync(tasksRoot, { recursive: true });
  mkdirSync(runsRoot, { recursive: true });
  mkdirSync(worktreesRoot, { recursive: true });
  const ledger = buildLedger();
  saveLedger(ledger);
  console.log(`generated ${ledger.groupTasks.length} group tasks from ${ledger.fileTasks.length} file tasks`);
  console.log(toRepoPath(ledgerPath));
}

function commandPreflight() {
  const checks = [];
  const codex = shell("codex", ["--version"]);
  checks.push({ name: "codex", ok: codex.status === 0, detail: (codex.stdout || codex.stderr || "").trim() });
  const branch = shell("git", ["branch", "--show-current"]);
  checks.push({ name: "branch", ok: branch.stdout.trim() === DEFAULT_BASE_BRANCH, detail: branch.stdout.trim() });
  checks.push({ name: "ledger", ok: existsSync(ledgerPath), detail: existsSync(ledgerPath) ? "exists" : "missing" });
  const typecheck = shell("npm", ["run", "typecheck"], { cwd: archRoot });
  checks.push({ name: "typecheck", ok: typecheck.status === 0, detail: typecheck.status === 0 ? "pass" : typecheck.stderr });
  const dirty = shell("git", ["status", "--short", "--", "Praxis_Agent_Architecture"]);
  checks.push({
    name: "foundation committed for worktree",
    ok: dirty.stdout.trim().length === 0,
    detail: dirty.stdout.trim() ? "dirty/untracked Praxis_Agent_Architecture files exist" : "clean",
  });
  console.log(JSON.stringify(checks, null, 2));
}

function commandStatus() {
  const ledger = loadLedger();
  refreshParentStatus(ledger);
  const groupCounts = {};
  const fileCounts = {};
  for (const task of ledger.groupTasks) groupCounts[task.status] = (groupCounts[task.status] ?? 0) + 1;
  for (const task of ledger.fileTasks) fileCounts[task.status] = (fileCounts[task.status] ?? 0) + 1;
  console.log(JSON.stringify({ groups: ledger.groupTasks.length, files: ledger.fileTasks.length, groupCounts, fileCounts, activeRuns: loadActiveRuns(), bigSpecs: ledger.bigSpecs }, null, 2));
}

function commandNext() {
  const ledger = loadLedger();
  console.log(JSON.stringify(pendingGroups(ledger).slice(0, Number(arg("--limit", "10"))), null, 2));
}

function setGroupStatus(ledger, group, status, note = "") {
  group.status = status;
  if (["done", "failed", "needs_rework", "pending"].includes(status)) {
    group.lease = null;
  }
  group.notes.push({ at: now(), status, note });
  ledger.history.push({ at: now(), event: "status", groupId: group.id, status, note });
  refreshParentStatus(ledger);
  saveLedger(ledger);
}

function commandRelease(id) {
  const ledger = loadLedger();
  const group = itemById(ledger, id);
  group.lease = null;
  setGroupStatus(ledger, group, "pending", arg("--note", "released"));
  console.log(JSON.stringify(group, null, 2));
}

function commandComplete(id) {
  const status = arg("--status");
  if (!status) throw new Error("missing --status");
  const allowed = new Set(["implemented", "reviewed", "done", "needs_rework", "failed"]);
  if (!allowed.has(status)) throw new Error(`invalid status: ${status}`);
  const ledger = loadLedger();
  const group = itemById(ledger, id);
  setGroupStatus(ledger, group, status, arg("--note", ""));
  console.log(JSON.stringify(group, null, 2));
}

function groupTable(group) {
  return group.files
    .map((file, index) => [
      `### File ${index + 1}`,
      `- source: \`${file.sourcePath}\``,
      `- doc: \`${file.docPath}\``,
      `- test: \`${file.testPath}\``,
    ].join("\n"))
    .join("\n\n");
}

function template(role) {
  const file = path.join(tasksRoot, "prompts", `${role}.md`);
  if (!existsSync(file)) throw new Error(`missing template: ${file}`);
  return readFileSync(file, "utf8");
}

function renderPrompt(group, role) {
  return template(role)
    .replaceAll("{{TASK_JSON}}", JSON.stringify(group, null, 2))
    .replaceAll("{{GROUP_FILE_TABLE}}", groupTable(group))
    .replaceAll("{{TASK_ID}}", group.id)
    .replaceAll("{{SOURCE_PATH}}", group.files[0]?.sourcePath ?? "")
    .replaceAll("{{DOC_PATH}}", group.files[0]?.docPath ?? "")
    .replaceAll("{{TEST_PATH}}", group.files[0]?.testPath ?? "");
}

function runDir(group, role = undefined) {
  const dir = role ? path.join(runsRoot, group.id, role) : path.join(runsRoot, group.id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function commandPrompt(id) {
  const role = arg("--role", "worker");
  const ledger = loadLedger();
  const group = itemById(ledger, id);
  const prompt = renderPrompt(group, role);
  const promptPath = path.join(runDir(group, role), "prompt.md");
  writeFileSync(promptPath, prompt, "utf8");
  console.log(toRepoPath(promptPath));
  console.log("\n--- prompt preview ---\n");
  console.log(prompt.slice(0, 2600));
}

function ensureWorktree(group, execute) {
  mkdirSync(worktreesRoot, { recursive: true });
  if (existsSync(group.worktreePath)) return;
  const branchExists = shell("git", ["show-ref", "--verify", "--quiet", `refs/heads/${group.branch}`]).status === 0;
  const args = branchExists
    ? ["worktree", "add", group.worktreePath, group.branch]
    : ["worktree", "add", "-b", group.branch, group.worktreePath, DEFAULT_BASE_BRANCH];
  if (!execute) {
    console.log(`dry-run: git ${args.join(" ")}`);
    return;
  }
  mustShell("git", args, { cwd: repoRoot, stdio: "inherit" });
}

function roleWorkspace(group, role, useWorktree) {
  if (role === "merge") return repoRoot;
  return useWorktree ? group.worktreePath : repoRoot;
}

function codexCommand(role, workspace, outputPath) {
  const config = roleModel[role] ?? roleModel.worker;
  const base = [
    "codex",
    "exec",
    "-C",
    workspace,
    "-m",
    config.model,
    "-c",
    `model_reasoning_effort="${config.reasoning}"`,
    "-o",
    outputPath,
    "-",
  ];

  if (role === "merge") {
    return [
      base[0],
      base[1],
      base[2],
      base[3],
      "--dangerously-bypass-approvals-and-sandbox",
      ...base.slice(4),
    ];
  }

  return [
    base[0],
    base[1],
    base[2],
    base[3],
    "--full-auto",
    ...base.slice(4),
  ];
}

function writePrompt(group, role) {
  const dir = runDir(group, role);
  const promptPath = path.join(dir, "prompt.md");
  const outputPath = path.join(dir, "last-message.md");
  const logPath = path.join(dir, "codex.log");
  writeFileSync(promptPath, renderPrompt(group, role), "utf8");
  return { promptPath, outputPath, logPath };
}

function runRoleSync(group, role, { execute, worktree }) {
  const files = writePrompt(group, role);
  const workspace = roleWorkspace(group, role, worktree);
  const command = codexCommand(role, workspace, files.outputPath);
  const display = `${command.map((part) => (part.includes(" ") ? JSON.stringify(part) : part)).join(" ")} < ${toRepoPath(files.promptPath)}`;
  if (!execute) {
    console.log(`dry-run ${role}:`);
    console.log(display);
    return 0;
  }
  appendFileSync(files.logPath, `[${now()}] start ${role}\n${display}\n`);
  const result = shell(command[0], command.slice(1), {
    cwd: workspace,
    input: readFileSync(files.promptPath, "utf8"),
    stdio: "pipe",
  });
  appendFileSync(files.logPath, result.stdout ?? "");
  appendFileSync(files.logPath, result.stderr ?? "");
  appendFileSync(files.logPath, `\n[${now()}] exit ${result.status}\n`);
  if (result.status !== 0) console.error(readFileSync(files.logPath, "utf8").slice(-4000));
  return result.status ?? 1;
}

function commandPipeline(id) {
  const ledger = loadLedger();
  const group = itemById(ledger, id);
  const execute = has("--execute");
  const worktree = has("--worktree");
  const roles = (arg("--roles", "worker,reviewer,merge") ?? "worker,reviewer,merge").split(",").map((item) => item.trim()).filter(Boolean);
  const transitions = {
    worker: ["implementing", "implemented"],
    reviewer: ["reviewing", "reviewed"],
    merge: ["merging", "done"],
  };
  if (worktree) ensureWorktree(group, execute);
  for (const role of roles) {
    const [startStatus, successStatus] = transitions[role] ?? [role, role];
    if (execute) setGroupStatus(ledger, group, startStatus, `${role} started`);
    const code = runRoleSync(group, role, { execute, worktree });
    if (code !== 0) {
      if (execute) setGroupStatus(ledger, group, role === "reviewer" ? "needs_rework" : "failed", `${role} failed`);
      process.exitCode = code;
      return;
    }
    if (execute && role === "merge") {
      const dirty = shell("git", ["status", "--short"], { cwd: repoRoot }).stdout.trim();
      if (dirty.length > 0) {
        setGroupStatus(
          ledger,
          group,
          "failed",
          `merge returned success but main worktree is still dirty; merge must commit or report failure: ${dirty.split("\n").slice(0, 6).join(" | ")}`,
        );
        process.exitCode = 1;
        return;
      }
    } else if (execute) {
      setGroupStatus(ledger, group, successStatus, `${role} done`);
    }
  }
}

function reapActiveRuns({ silent = false } = {}) {
  const active = loadJson(path.join(runsRoot, "active-runs.json"), []);
  const alive = active.filter((run) => {
    try {
      process.kill(run.pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  const reaped = active.filter((run) => !alive.includes(run));
  writeJson(path.join(runsRoot, "active-runs.json"), alive);
  if (!silent) console.log(JSON.stringify({ alive, reaped }, null, 2));
  return { alive, reaped };
}

function commandBatch() {
  const ledger = loadLedger();
  const { alive } = reapActiveRuns({ silent: true });
  const maxActive = Number(arg("--max-active", String(DEFAULT_MAX_ACTIVE)));
  const available = Math.max(0, maxActive - alive.length);
  const limit = Math.min(Number(arg("--limit", String(available || 1))), available || 1);
  const groups = pendingGroups(ledger).slice(0, limit);
  const execute = has("--execute");
  const worktree = has("--worktree");
  const roles = arg("--roles", "worker,reviewer");
  const planned = [];
  const active = [...alive];

  for (const group of groups) {
    const runId = `${group.id}-${Date.now()}`;
    const args = [scriptPath, "pipeline", group.id, "--roles", roles];
    if (execute) args.push("--execute");
    if (worktree) args.push("--worktree");
    planned.push({ runId, groupId: group.id, args: [process.execPath, ...args] });
    if (execute) {
      group.status = "leased";
      group.lease = { agent: `batch:${runId}`, at: now() };
      group.attempts.push({ at: now(), event: "batch-start", runId });
      const child = spawn(process.execPath, args, {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.unref();
      active.push({ runId, groupId: group.id, pid: child.pid, startedAt: now() });
    }
  }

  if (execute) {
    refreshParentStatus(ledger);
    saveLedger(ledger);
    writeJson(path.join(runsRoot, "active-runs.json"), active);
  }
  console.log(JSON.stringify({ execute, maxActive, currentlyActive: active.length, planned }, null, 2));
}

function runnablePendingGroups(ledger, spec) {
  return ledger.groupTasks.filter((task) => task.status === "pending" && (!spec || task.bigSpecId === spec));
}

function blockedGroups(ledger, spec) {
  return ledger.groupTasks.filter(
    (task) => ["failed", "needs_rework"].includes(task.status) && (!spec || task.bigSpecId === spec),
  );
}

function reviewedGroups(ledger, spec) {
  return ledger.groupTasks.filter((task) => task.status === "reviewed" && (!spec || task.bigSpecId === spec));
}

function mainDirtyStatus({ ignoreLedger = false } = {}) {
  const dirty = shell("git", ["status", "--short"], { cwd: repoRoot }).stdout.trim();
  if (!ignoreLedger || dirty.length === 0) return dirty;
  return dirty
    .split("\n")
    .filter((line) => !line.endsWith("Praxis_Agent_Architecture/tasks/ledger.json"))
    .join("\n")
    .trim();
}

function runMergeRole(group, { execute, worktree }) {
  if (execute) {
    const dirtyBefore = mainDirtyStatus({ ignoreLedger: true });
    if (dirtyBefore.length > 0) {
      console.error(`merge skipped for ${group.id}: main worktree is dirty before merge`);
      console.error(dirtyBefore);
      process.exitCode = 1;
      return false;
    }
  }

  const ledger = loadLedger();
  const freshGroup = itemById(ledger, group.id);
  if (execute) setGroupStatus(ledger, freshGroup, "merging", "merge started");
  const code = runRoleSync(freshGroup, "merge", { execute, worktree });
  if (code !== 0) {
    if (execute) {
      const failedLedger = loadLedger();
      setGroupStatus(failedLedger, itemById(failedLedger, group.id), "failed", "merge failed");
    }
    process.exitCode = code;
    return false;
  }

  if (execute) {
    const dirtyAfter = mainDirtyStatus({ ignoreLedger: true });
    if (dirtyAfter.length > 0) {
      const failedLedger = loadLedger();
      setGroupStatus(
        failedLedger,
        itemById(failedLedger, group.id),
        "failed",
        `merge returned success but main worktree is still dirty; merge must commit or report failure: ${dirtyAfter.split("\n").slice(0, 6).join(" | ")}`,
      );
      process.exitCode = 1;
      return false;
    }
  }

  return true;
}

function startGroupPipeline(group, { execute, worktree, active, roles = "worker,reviewer,merge" }) {
  const runId = `${group.id}-${Date.now()}`;
  const args = [scriptPath, "pipeline", group.id, "--roles", roles];
  if (execute) args.push("--execute");
  if (worktree) args.push("--worktree");

  if (!execute) {
    return { runId, groupId: group.id, args: [process.execPath, ...args], dryRun: true };
  }

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();
  active.push({ runId, groupId: group.id, pid: child.pid, startedAt: now() });
  return { runId, groupId: group.id, pid: child.pid, args: [process.execPath, ...args], dryRun: false };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function commandContinue() {
  const spec = arg("--spec");
  if (!spec) throw new Error("continue requires --spec AC-SPEC-* to avoid accidentally running all groups");
  const execute = has("--execute");
  const worktree = has("--worktree");
  const maxActive = Number(arg("--max-active", String(DEFAULT_MAX_ACTIVE)));
  const sleepMs = Number(arg("--sleep-ms", "60000"));
  const maxLoops = Number(arg("--max-loops", "0"));
  let loop = 0;

  while (true) {
    const ledger = loadLedger();
    const { alive, reaped } = reapActiveRuns({ silent: true });
    const blocked = blockedGroups(ledger, spec);
    const mergeable = reviewedGroups(ledger, spec);
    const pending = runnablePendingGroups(ledger, spec);
    const dirty = mainDirtyStatus();
    const mergeBlockingDirty = mainDirtyStatus({ ignoreLedger: true });

    const snapshot = {
      at: now(),
      spec,
      loop,
      execute,
      maxActive,
      alive: alive.length,
      reaped: reaped.length,
      pending: pending.length,
      mergeable: mergeable.length,
      mainDirty: dirty.length > 0,
      mergeBlockingDirty: mergeBlockingDirty.length > 0,
      blocked: blocked.map((task) => ({ id: task.id, status: task.status })),
    };
    console.log(JSON.stringify(snapshot));

    if (blocked.length > 0) {
      console.error(`continue stopped: ${blocked.length} blocked groups`);
      process.exitCode = 1;
      return;
    }

    if (mergeable.length > 0) {
      if (mergeBlockingDirty.length > 0) {
        console.error("continue stopped: main worktree is dirty before serialized merge");
        console.error(mergeBlockingDirty);
        process.exitCode = 1;
        return;
      }
      const group = mergeable[0];
      console.log(JSON.stringify({ at: now(), event: "continue.merge", groupId: group.id }));
      if (!runMergeRole(group, { execute, worktree })) return;
      loop += 1;
      continue;
    }

    if (pending.length === 0 && alive.length === 0) {
      console.log(JSON.stringify({ at: now(), event: "continue.done", spec }));
      return;
    }

    const active = [...alive];
    const capacity = Math.max(0, maxActive - active.length);
    const toStart = pending.slice(0, capacity);
    const planned = [];

    if (toStart.length > 0) {
      for (const group of toStart) {
        if (execute) {
          group.status = "leased";
          group.lease = { agent: `continue:${group.id}`, at: now() };
          group.attempts.push({ at: now(), event: "continue-start" });
        }
        planned.push(startGroupPipeline(group, { execute, worktree, active, roles: "worker,reviewer" }));
      }
      if (execute) {
        refreshParentStatus(ledger);
        saveLedger(ledger);
        writeJson(path.join(runsRoot, "active-runs.json"), active);
      }
      console.log(JSON.stringify({ at: now(), event: "continue.started", planned }, null, 2));
    }

    if (!execute) {
      console.log("dry-run continue stops after one planning loop. Add --execute to run.");
      return;
    }

    loop += 1;
    if (maxLoops > 0 && loop >= maxLoops) {
      console.log(JSON.stringify({ at: now(), event: "continue.max_loops", spec, loop }));
      return;
    }

    await sleep(sleepMs);
  }
}

function commandActive() {
  reapActiveRuns({ silent: true });
  console.log(JSON.stringify(loadJson(path.join(runsRoot, "active-runs.json"), []), null, 2));
}

function commandKill(target) {
  const active = loadJson(path.join(runsRoot, "active-runs.json"), []);
  const selected = target === "all" ? active : active.filter((run) => run.runId === target || run.groupId === target);
  if (!has("--execute")) {
    console.log(JSON.stringify({ dryRun: true, selected }, null, 2));
    return;
  }
  for (const run of selected) {
    try {
      process.kill(run.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  writeJson(path.join(runsRoot, "active-runs.json"), active.filter((run) => !selected.includes(run)));
  console.log(JSON.stringify({ killed: selected }, null, 2));
}

const [command, id] = process.argv.slice(2);

try {
  if (!command || command === "help") usage();
  else if (command === "init") commandInit();
  else if (command === "preflight") commandPreflight();
  else if (command === "status") commandStatus();
  else if (command === "next") commandNext();
  else if (command === "prompt") commandPrompt(id);
  else if (command === "pipeline") commandPipeline(id);
  else if (command === "batch") commandBatch();
  else if (command === "continue") await commandContinue();
  else if (command === "complete") commandComplete(id);
  else if (command === "release") commandRelease(id);
  else if (command === "active") commandActive();
  else if (command === "reap") reapActiveRuns();
  else if (command === "kill") commandKill(id);
  else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
