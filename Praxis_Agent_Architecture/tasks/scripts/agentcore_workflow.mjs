#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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

const CODEX_MODEL = process.env.AGENTCORE_CODEX_MODEL ?? "gpt-5.4";
const CODEX_REASONING = process.env.AGENTCORE_CODEX_REASONING ?? "high";
const DEFAULT_MAX_ACTIVE = Number(process.env.AGENTCORE_MAX_ACTIVE ?? "4");
const DEFAULT_BASE_BRANCH = process.env.AGENTCORE_BASE_BRANCH ?? "dev/rebase";

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
  node tasks/scripts/agentcore_workflow.mjs init [--force]
  node tasks/scripts/agentcore_workflow.mjs preflight
  node tasks/scripts/agentcore_workflow.mjs status
  node tasks/scripts/agentcore_workflow.mjs next [--limit N] [--spec AC-SPEC-A]
  node tasks/scripts/agentcore_workflow.mjs lease <task-id> --agent <name>
  node tasks/scripts/agentcore_workflow.mjs release <task-id> [--note "..."]
  node tasks/scripts/agentcore_workflow.mjs prompt <task-id> --role worker|reviewer|merge
  node tasks/scripts/agentcore_workflow.mjs run <task-id> --role worker|reviewer|merge [--execute] [--worktree]
  node tasks/scripts/agentcore_workflow.mjs pipeline <task-id> [--execute] [--worktree] [--roles worker,reviewer,merge]
  node tasks/scripts/agentcore_workflow.mjs batch [--limit N] [--spec AC-SPEC-A] [--execute] [--worktree]
  node tasks/scripts/agentcore_workflow.mjs worktree <task-id> --create|--remove [--execute]
  node tasks/scripts/agentcore_workflow.mjs active
  node tasks/scripts/agentcore_workflow.mjs reap
  node tasks/scripts/agentcore_workflow.mjs kill <run-id|task-id|all> [--execute]
  node tasks/scripts/agentcore_workflow.mjs complete <task-id> --status implemented|reviewed|done|needs_rework|failed [--note "..."]

Model defaults:
  model=${CODEX_MODEL}
  model_reasoning_effort=${CODEX_REASONING}
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

function toRepoPath(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
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
    const stderr = result.stderr ? `\n${result.stderr}` : "";
    const stdout = result.stdout ? `\n${result.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${stdout}${stderr}`);
  }
  return result;
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

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadLedger() {
  if (!existsSync(ledgerPath)) throw new Error(`ledger not found: ${toRepoPath(ledgerPath)}. Run init first.`);
  return normalizeLedger(loadJson(ledgerPath));
}

function saveLedger(ledger) {
  ledger.updatedAt = now();
  writeJson(ledgerPath, ledger);
}

function normalizeLedger(ledger) {
  ledger.version = ledger.version ?? 2;
  ledger.repoRoot = ledger.repoRoot ?? repoRoot;
  ledger.baseBranch = ledger.baseBranch ?? DEFAULT_BASE_BRANCH;
  ledger.model = ledger.model ?? CODEX_MODEL;
  ledger.reasoning = ledger.reasoning ?? CODEX_REASONING;
  ledger.maxActiveDefault = ledger.maxActiveDefault ?? DEFAULT_MAX_ACTIVE;
  ledger.worktreesRoot = ledger.worktreesRoot ?? worktreesRoot;
  ledger.history = ledger.history ?? [];
  for (const task of ledger.fileTasks ?? []) {
    task.branch = task.branch ?? `codex/agentcore/${task.id.toLowerCase()}`;
    task.worktreePath = task.worktreePath ?? path.join(worktreesRoot, task.id);
    task.lease = task.lease ?? null;
    task.attempts = task.attempts ?? [];
    task.notes = task.notes ?? [];
  }
  return ledger;
}

function loadActiveRuns() {
  return loadJson(activeRunsPath, []);
}

function saveActiveRuns(runs) {
  writeJson(activeRunsPath, runs);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildLedger() {
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
        fileTaskIds: [],
      });
    }

    const index = fileTasks.length + 1;
    const id = `AC-F-${String(index).padStart(4, "0")}`;
    const docRel = rel.replace(/\.ts$/, ".md");
    const testRel = rel.replace(/\.ts$/, ".test.ts");
    const task = {
      id,
      parentId: smallId,
      bigSpecId: big.id,
      status: "pending",
      sourcePath: `Praxis_Agent_Architecture/src/agentCore/${rel}`,
      docPath: `Praxis_Agent_Architecture/docs/agentCore/${docRel}`,
      testPath: `Praxis_Agent_Architecture/test/agentCore/${testRel}`,
      branch: `codex/agentcore/${id.toLowerCase()}`,
      worktreePath: path.join(worktreesRoot, id),
      lease: null,
      attempts: [],
      notes: [],
    };
    smallSpecs.get(smallId).fileTaskIds.push(id);
    fileTasks.push(task);
  }

  const smallSpecList = [...smallSpecs.values()];
  return {
    version: 2,
    generatedAt: now(),
    updatedAt: now(),
    repoRoot,
    baseBranch: DEFAULT_BASE_BRANCH,
    model: CODEX_MODEL,
    reasoning: CODEX_REASONING,
    maxActiveDefault: DEFAULT_MAX_ACTIVE,
    worktreesRoot,
    bigSpecs: bigSpecs.map((spec) => ({
      id: spec.id,
      title: spec.title,
      status: "pending",
      smallSpecIds: smallSpecList.filter((small) => small.parentId === spec.id).map((small) => small.id),
    })),
    smallSpecs: smallSpecList,
    fileTasks,
    history: [{ at: now(), event: "init", message: `generated ${fileTasks.length} file tasks` }],
  };
}

function statusOfChildren(children) {
  if (children.length === 0) return "pending";
  if (children.every((task) => task.status === "done")) return "done";
  if (children.some((task) => task.status === "failed")) return "failed";
  if (children.some((task) => task.status !== "pending")) return "in_progress";
  return "pending";
}

function refreshParentStatus(ledger) {
  for (const small of ledger.smallSpecs) {
    const children = small.fileTaskIds.map((id) => ledger.fileTasks.find((task) => task.id === id)).filter(Boolean);
    small.status = statusOfChildren(children);
  }
  for (const big of ledger.bigSpecs) {
    const children = big.smallSpecIds.map((id) => ledger.smallSpecs.find((small) => small.id === id)).filter(Boolean);
    big.status = statusOfChildren(children);
  }
}

function findTask(ledger, id) {
  const task = ledger.fileTasks.find((item) => item.id === id);
  if (!task) throw new Error(`task not found: ${id}`);
  return task;
}

function pendingTasks(ledger) {
  const spec = arg("--spec");
  return ledger.fileTasks.filter((task) => task.status === "pending" && (!spec || task.bigSpecId === spec));
}

function template(role) {
  const file = path.join(tasksRoot, "prompts", `${role}.md`);
  if (!existsSync(file)) throw new Error(`missing prompt template: ${toRepoPath(file)}`);
  return readFileSync(file, "utf8");
}

function renderPrompt(task, role) {
  const taskJson = JSON.stringify(task, null, 2);
  return template(role)
    .replaceAll("{{TASK_JSON}}", taskJson)
    .replaceAll("{{SOURCE_PATH}}", task.sourcePath)
    .replaceAll("{{DOC_PATH}}", task.docPath)
    .replaceAll("{{TEST_PATH}}", task.testPath);
}

function runDir(task, role = undefined) {
  const dir = role ? path.join(runsRoot, task.id, role) : path.join(runsRoot, task.id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function commandInit() {
  if (existsSync(ledgerPath) && !has("--force")) throw new Error("ledger already exists. Use --force to regenerate.");
  mkdirSync(tasksRoot, { recursive: true });
  mkdirSync(runsRoot, { recursive: true });
  mkdirSync(worktreesRoot, { recursive: true });
  const ledger = buildLedger();
  saveLedger(ledger);
  console.log(`generated ${ledger.fileTasks.length} file tasks`);
  console.log(toRepoPath(ledgerPath));
}

function commandPreflight() {
  const checks = [];
  const codex = shell("codex", ["--version"]);
  checks.push({ name: "codex", ok: codex.status === 0, detail: (codex.stdout || codex.stderr || "").trim() });
  const branch = shell("git", ["branch", "--show-current"]);
  checks.push({ name: "branch", ok: branch.stdout.trim() === DEFAULT_BASE_BRANCH, detail: branch.stdout.trim() });
  const ledgerOk = existsSync(ledgerPath);
  checks.push({ name: "ledger", ok: ledgerOk, detail: ledgerOk ? toRepoPath(ledgerPath) : "missing" });
  const typecheck = shell("npm", ["run", "typecheck"], { cwd: archRoot });
  checks.push({ name: "typecheck", ok: typecheck.status === 0, detail: typecheck.status === 0 ? "pass" : typecheck.stderr });
  const dirty = shell("git", ["status", "--short", "--", "Praxis_Agent_Architecture"]);
  checks.push({
    name: "foundation committed for worktree",
    ok: dirty.stdout.trim().length === 0,
    detail: dirty.stdout.trim() ? "dirty/untracked Praxis_Agent_Architecture files exist; worktree agents may not see them until committed" : "clean",
  });
  console.log(JSON.stringify(checks, null, 2));
}

function commandStatus() {
  const ledger = loadLedger();
  refreshParentStatus(ledger);
  const counts = {};
  for (const task of ledger.fileTasks) counts[task.status] = (counts[task.status] ?? 0) + 1;
  console.log(JSON.stringify({ total: ledger.fileTasks.length, counts, activeRuns: loadActiveRuns(), bigSpecs: ledger.bigSpecs }, null, 2));
}

function commandNext() {
  const ledger = loadLedger();
  const limit = Number(arg("--limit", "10"));
  console.log(JSON.stringify(pendingTasks(ledger).slice(0, limit), null, 2));
}

function commandLease(id) {
  const agent = arg("--agent");
  if (!agent) throw new Error("missing --agent <name>");
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  if (!["pending", "needs_rework"].includes(task.status)) throw new Error(`task ${id} is not leasable: ${task.status}`);
  task.status = "leased";
  task.lease = { agent, at: now() };
  task.attempts.push({ agent, at: now(), event: "lease" });
  ledger.history.push({ at: now(), event: "lease", taskId: id, agent });
  refreshParentStatus(ledger);
  saveLedger(ledger);
  console.log(JSON.stringify(task, null, 2));
}

function commandRelease(id) {
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const note = arg("--note", "");
  if (!["leased", "implementing", "implemented", "reviewing", "reviewed", "merging"].includes(task.status)) {
    throw new Error(`task ${id} is not currently leased or active: ${task.status}`);
  }
  task.status = "pending";
  task.lease = null;
  task.notes.push({ at: now(), status: "released", note });
  ledger.history.push({ at: now(), event: "release", taskId: id, note });
  refreshParentStatus(ledger);
  saveLedger(ledger);
  console.log(JSON.stringify(task, null, 2));
}

function commandPrompt(id) {
  const role = arg("--role", "worker");
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const prompt = renderPrompt(task, role);
  const dir = runDir(task, role);
  const promptPath = path.join(dir, "prompt.md");
  writeFileSync(promptPath, prompt, "utf8");
  console.log(toRepoPath(promptPath));
  console.log("\n--- prompt preview ---\n");
  console.log(prompt.slice(0, 2200));
}

function commandComplete(id) {
  const status = arg("--status");
  if (!status) throw new Error("missing --status");
  const allowed = new Set(["implemented", "reviewed", "done", "needs_rework", "failed"]);
  if (!allowed.has(status)) throw new Error(`invalid status: ${status}`);
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const note = arg("--note", "");
  task.status = status;
  task.notes.push({ at: now(), status, note });
  ledger.history.push({ at: now(), event: "complete", taskId: id, status, note });
  refreshParentStatus(ledger);
  saveLedger(ledger);
  console.log(JSON.stringify(task, null, 2));
}

function codexCommand(workspace, outputPath) {
  return [
    "codex",
    "exec",
    "-C",
    workspace,
    "--full-auto",
    "-m",
    CODEX_MODEL,
    "-c",
    `model_reasoning_effort="${CODEX_REASONING}"`,
    "-o",
    outputPath,
    "-",
  ];
}

function taskWorkspace(task, useWorktree) {
  return useWorktree ? task.worktreePath : repoRoot;
}

function ensureWorktree(task, execute) {
  mkdirSync(worktreesRoot, { recursive: true });
  if (existsSync(task.worktreePath)) return;
  const args = ["worktree", "add", "-b", task.branch, task.worktreePath, DEFAULT_BASE_BRANCH];
  if (!execute) {
    console.log(`dry-run: git ${args.join(" ")}`);
    return;
  }
  mustShell("git", args, { cwd: repoRoot, stdio: "inherit" });
}

function removeWorktree(task, execute) {
  const args = ["worktree", "remove", task.worktreePath];
  if (!existsSync(task.worktreePath)) return;
  if (!execute) {
    console.log(`dry-run: git ${args.join(" ")}`);
    return;
  }
  mustShell("git", args, { cwd: repoRoot, stdio: "inherit" });
}

function commandWorktree(id) {
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const execute = has("--execute");
  if (has("--create")) ensureWorktree(task, execute);
  else if (has("--remove")) removeWorktree(task, execute);
  else throw new Error("worktree requires --create or --remove");
  console.log(JSON.stringify({ taskId: id, branch: task.branch, worktreePath: task.worktreePath, executed: execute }, null, 2));
}

function writePrompt(task, role) {
  const dir = runDir(task, role);
  const promptPath = path.join(dir, "prompt.md");
  const outputPath = path.join(dir, "last-message.md");
  const logPath = path.join(dir, "codex.log");
  writeFileSync(promptPath, renderPrompt(task, role), "utf8");
  return { dir, promptPath, outputPath, logPath };
}

function updateTaskStatus(ledger, task, status, note = "") {
  task.status = status;
  task.notes.push({ at: now(), status, note });
  ledger.history.push({ at: now(), event: "status", taskId: task.id, status, note });
  refreshParentStatus(ledger);
  saveLedger(ledger);
}

function runRoleSync(task, role, options) {
  const execute = options.execute;
  const workspace = taskWorkspace(task, options.worktree);
  const files = writePrompt(task, role);
  const command = codexCommand(workspace, files.outputPath);
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
  if (result.status !== 0) {
    console.error(readFileSync(files.logPath, "utf8").slice(-4000));
  }
  return result.status ?? 1;
}

function commandRun(id) {
  const role = arg("--role", "worker");
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const useWorktree = has("--worktree");
  if (useWorktree) ensureWorktree(task, has("--execute"));
  const code = runRoleSync(task, role, { execute: has("--execute"), worktree: useWorktree });
  process.exitCode = code;
}

function commandPipeline(id) {
  const ledger = loadLedger();
  const task = findTask(ledger, id);
  const execute = has("--execute");
  const useWorktree = has("--worktree");
  const roles = (arg("--roles", "worker,reviewer,merge") ?? "worker,reviewer,merge").split(",").map((item) => item.trim()).filter(Boolean);
  const transitions = {
    worker: ["implementing", "implemented"],
    reviewer: ["reviewing", "reviewed"],
    merge: ["merging", "done"],
  };

  if (useWorktree) ensureWorktree(task, execute);
  if (!task.lease && execute) {
    task.lease = { agent: `pipeline:${process.pid}`, at: now() };
  }

  for (const role of roles) {
    const [startStatus, successStatus] = transitions[role] ?? [role, role];
    if (execute) updateTaskStatus(ledger, task, startStatus, `pipeline ${role} started`);
    const code = runRoleSync(task, role, { execute, worktree: useWorktree });
    if (code !== 0) {
      if (execute) updateTaskStatus(ledger, task, role === "reviewer" ? "needs_rework" : "failed", `${role} failed`);
      process.exitCode = code;
      return;
    }
    if (execute) updateTaskStatus(ledger, task, successStatus, `pipeline ${role} completed`);
  }
}

function commandBatch() {
  const ledger = loadLedger();
  reapActiveRuns({ silent: true });
  const active = loadActiveRuns().filter((run) => isPidAlive(run.pid));
  const maxActive = Number(arg("--max-active", String(DEFAULT_MAX_ACTIVE)));
  const available = Math.max(0, maxActive - active.length);
  const limit = Math.min(Number(arg("--limit", String(available || 1))), available || 1);
  const tasks = pendingTasks(ledger).slice(0, limit);
  const execute = has("--execute");
  const useWorktree = has("--worktree");
  const planned = [];
  mkdirSync(runsRoot, { recursive: true });

  for (const task of tasks) {
    const runId = `${task.id}-${Date.now()}`;
    const logPath = path.join(runDir(task), "pipeline.log");
    const args = [scriptPath, "pipeline", task.id, "--roles", "worker,reviewer,merge"];
    if (execute) args.push("--execute");
    if (useWorktree) args.push("--worktree");
    planned.push({ runId, taskId: task.id, logPath, args: [process.execPath, ...args] });

    if (execute) {
      task.status = "leased";
      task.lease = { agent: `batch:${runId}`, at: now() };
      task.attempts.push({ agent: `batch:${runId}`, at: now(), event: "batch-start" });
      ledger.history.push({ at: now(), event: "batch-start", taskId: task.id, runId });
      const child = spawn(process.execPath, args, {
        cwd: repoRoot,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.unref();
      active.push({ runId, taskId: task.id, pid: child.pid, startedAt: now(), logPath });
    }
  }

  if (execute) {
    refreshParentStatus(ledger);
    saveLedger(ledger);
    saveActiveRuns(active);
  }
  console.log(JSON.stringify({ execute, maxActive, currentlyActive: active.length, planned }, null, 2));
}

function reapActiveRuns({ silent = false } = {}) {
  const active = loadActiveRuns();
  const alive = active.filter((run) => isPidAlive(run.pid));
  const reaped = active.filter((run) => !isPidAlive(run.pid));
  saveActiveRuns(alive);
  if (!silent) console.log(JSON.stringify({ alive, reaped }, null, 2));
  return { alive, reaped };
}

function commandActive() {
  reapActiveRuns({ silent: true });
  console.log(JSON.stringify(loadActiveRuns(), null, 2));
}

function commandKill(target) {
  const active = loadActiveRuns();
  const execute = has("--execute");
  const selected = target === "all" ? active : active.filter((run) => run.runId === target || run.taskId === target);
  if (!execute) {
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
  saveActiveRuns(active.filter((run) => !selected.includes(run)));
  console.log(JSON.stringify({ killed: selected }, null, 2));
}

const [command, id] = process.argv.slice(2);

try {
  if (!command || command === "help") usage();
  else if (command === "init") commandInit();
  else if (command === "preflight") commandPreflight();
  else if (command === "status") commandStatus();
  else if (command === "next") commandNext();
  else if (command === "lease") commandLease(id);
  else if (command === "release") commandRelease(id);
  else if (command === "prompt") commandPrompt(id);
  else if (command === "complete") commandComplete(id);
  else if (command === "worktree") commandWorktree(id);
  else if (command === "run") commandRun(id);
  else if (command === "pipeline") commandPipeline(id);
  else if (command === "batch") commandBatch();
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
