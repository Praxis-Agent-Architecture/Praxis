# Linux Bubblewrap v2 Checklist

## Goal

Turn `linuxBubblewrap()` from a basic provider smoke path into the first real Praxis OS sandbox implementation on Linux.

The core rule is fixed:

```text
sandbox isolates the host environment.
toolPolicy decides governance.
```

Bubblewrap must not become a second permission system. It should enforce the execution boundary, while the five tool policy modes (`bapr`, `yolo`, `permissive`, `standard`, `restricted`) decide whether an action is allowed, approval-gated, or blocked.

## Policy Decisions

- [x] Keep five-mode policy as the source of governance truth.
  - `bapr`: broad allow, no sandbox path interception unless needed for runtime correctness.
  - `yolo`: broad allow, notify on risky boundary escapes.
  - `permissive`: mostly allow, approval or guard for destructive writes and sensitive actions.
  - `standard`: conservative default, approval for risky/destructive actions.
  - `restricted`: approval-first posture.
- [x] Do not encode destructive-action approval directly inside `SandboxSpec`; sandbox can emit signals, but `toolPolicy` adjudicates.
- [x] Make sandbox readiness available to governance decisions, so policy can explain "blocked by sandbox", "requires approval", or "allowed inside sandbox".

## SandboxSpec Authoring

- [x] Keep `sandbox.hostObserved()` as the default development profile.
  - It does not isolate.
  - It records, gates, budgets, and emits approval surfaces.
- [x] Keep `sandbox.workspaceOnly()` as a runtime policy profile, not a true OS sandbox.
- [x] Upgrade `sandbox.linuxBubblewrap()` to v2 metadata:
  - provider version: `v2`
  - fallback: explicit only
  - home: `.rax_workspace/sandbox/home`
  - tmp: `.rax_workspace/sandbox/tmp`
  - artifacts: `.rax_workspace/sandbox/artifacts`
  - governance owner: `toolPolicy`
- [x] Add or finish built-in profile variants:
  - `sandbox.linuxBubblewrapReadonly()`
  - `sandbox.linuxBubblewrapWorkspaceWrite()`
  - `sandbox.linuxBubblewrapNetworked()`
- [x] Keep rootless container, Windows Sandbox, macOS containerization, and remote worker as contract/readiness providers only for now.

## Filesystem Boundary

- [x] Default `linuxBubblewrap()` should not expose the real home directory.
- [x] Set sandbox `$HOME` to `.rax_workspace/sandbox/home`.
- [x] Bind `/tmp` to `.rax_workspace/sandbox/tmp`; never bind the real host `/tmp` by default.
- [x] Keep `.rax_workspace/sandbox` writable for runtime scratch data.
- [x] Keep artifacts under `.rax_workspace/sandbox/artifacts` by default.
- [x] Allow developers to define write-placement primitives later, but default writes should go to sandbox artifacts unless toolPolicy permits workspace writes.
- [x] Enforce path escape protection in both layers:
  - runtime path guard catches normal invalid paths.
  - bubblewrap catches missed host path exposure.
- [x] For `bapr` and `yolo`, do not hard-block normal workspace path use just because it is broad; still prevent accidental host leakage unless the profile explicitly binds it.
- [x] For `standard` and `restricted`, make overwrite/modify/destructive writes approval-gated by policy.
- [x] Allow new file creation more freely than overwrite/delete under non-strict policies.

## System Mounts

- [x] Review required read-only system mounts for common developer commands:
  - `/usr`
  - `/bin`
  - `/lib`
  - `/lib64`
  - `/etc`
  - optional `/opt`
  - optional `/nix`
- [x] Do not expose sensitive user directories by default.
- [x] Make `/etc` read-only if needed for tool compatibility, but mark it in inspection output.
- [x] Keep built-in BaseTool/TAP/MCP semantics outside the sandbox provider; sandbox only supplies the process boundary.

## Device Boundary

- [x] Default device exposure should be minimal:
  - `/dev/null`
  - `/dev/zero`
  - `/dev/random`
  - `/dev/urandom`
- [x] Do not default to full `--dev /dev` for `standard`, `restricted`, or `permissive`.
- [x] Permit broader `/dev` only for `bapr` and `yolo`, and record the expanded exposure in events/inspection.

## Process Boundary

- [x] Use process isolation wherever available:
  - `--unshare-pid`
  - `--unshare-ipc`
  - `--unshare-uts`
  - `--die-with-parent`
- [x] Use `--proc /proc` with PID namespace support.
- [x] Keep `--unshare-cgroup` as best-effort or future work if it is not universally available.
- [x] Ensure spawned shell/process/git/code commands run through the prepared bubblewrap command when profile is `linux-bubblewrap`.
- [x] If `linuxBubblewrap()` is declared and not ready, fail the run by default.
- [x] Allow fallback only when the manifest/runtime option explicitly allows fallback.

## Network Boundary

- [x] Network behavior follows five-mode governance.
- [x] Default `linuxBubblewrap()` should deny network unless policy/approval allows it.
- [x] Implement network deny with `--unshare-net` when policy says network is denied.
- [x] For `bapr`, `yolo`, and `permissive`, network may be allowed by default if the selected toolPolicy permits it.
- [x] For `standard` and `restricted`, network should be approval-gated or denied by default.
- [x] Report network mode in smoke output and inspection.

## Resource Policy

- [x] Keep resource controls as runtime policy signals first; do not pretend cgroups are complete if they are not.
- [x] Default resource stance:
  - timeout: unlimited unless caller/tool sets one
  - maxOutputBytes: unlimited unless caller/tool sets one
  - maxProcesses: `8192`
  - maxFileBytes: unlimited unless caller/tool sets one
  - cpuTimeMs: unlimited unless caller/tool sets one
  - memory: warn at 85 percent available memory, alert at 90 percent, throttle at 100 percent where runtime can act
- [x] Preserve current timeout and output limiting hooks for tests and bounded tool calls.
- [x] Plan a later cgroup-backed implementation for memory/process/cpu enforcement.

## Dependency Management

- [x] Keep `binary:bwrap` as the required dependency for Linux Bubblewrap.
- [x] Probe whether `bwrap` is installed.
- [x] If missing, return public-safe readiness plus self-repair hints.
- [x] Connect the result to dependency runtime contracts:
  - detect
  - plan install
  - request approval
  - allow upper layer to execute install
  - retry readiness
- [x] Do not auto-run `sudo` inside framework core.
- [x] Provide a unified install/approval envelope that CLI/TUI/Raxode/Raxos can implement.

## Smoke Tests

- [x] Expand smoke from "can start" to full boundary checks:
  - cwd is `/workspace`
  - `$HOME` is sandbox home
  - real `/home/proview` sensitive files are not visible
  - workspace can be read
  - `.rax_workspace/sandbox` can be written
  - `/tmp` is sandbox tmp
  - path escape does not expose host paths
  - network deny works when denied
  - process namespace works with `/proc`
- [x] If `bwrap` is missing, tests should pass with `missingDependency` readiness, not raw failure.
- [x] If `bwrap` exists but smoke fails, return `smokeFailed` with public-safe diagnostics.

## BaseTool Integration

- [x] Keep BaseTool call chain unchanged:

```text
runtime request
-> adaptRuntimeToolInvocation
-> bridgeExecEngineInvocation
-> createBaseToolRegistry().lookupHandler
-> handler.invoke({ executor })
-> BaseToolExecutorPort.*
```

- [x] Ensure shell/process ports run through bwrap when `linuxBubblewrap` is prepared.
- [x] Ensure git ports run through bwrap when they spawn git.
- [x] Ensure code/read/search/edit ports stay under runtime allowed roots and sandbox workspace mapping.
- [x] Keep MCP/computer/media contract-only or adapter-specific; do not force them into bwrap without a real host strategy.
- [x] Make npm/pnpm install approval-gated by policy, not sandbox-hardcoded.

## Inspection And Errors

- [x] `rax inspect` should explain:
  - selected sandbox profile
  - whether it is real isolation or policy-only
  - provider family
  - dependency readiness
  - smoke status
  - filesystem mounts
  - network mode
  - device exposure
  - fallback behavior
  - self-repair hints
- [x] Errors should include both:
  - public-safe failure
  - developer repair hint
- [x] Avoid raw provider/system errors leaking into public output.

## Tests

- [x] Manifest tests:
  - all linuxBubblewrap variants compile into `AgentManifest`
  - defaults match v2 semantics
  - top-level manifest and harness views stay consistent
- [x] Sandbox runtime tests:
  - probe missing bwrap
  - probe available bwrap
  - smoke passed
  - smoke failed
  - contract-only providers still report contract-only
- [x] Executor tests:
  - shell runs inside `/workspace`
  - process runs inside `/workspace`
  - sandbox metadata records `applied: true`
  - unavailable sandbox returns `SANDBOX_UNAVAILABLE`
  - no silent fallback unless explicitly allowed
- [x] Governance tests:
  - bapr/yolo/permissive/standard/restricted map to expected sandbox policy explanation
  - destructive writes remain policy-governed
  - network behavior is explained by toolPolicy plus sandbox readiness
- [x] CLI/inspection tests:
  - `rax inspect` reports sandbox readiness
  - missing dependency produces self-repair plan
  - fullstack example can select `linuxBubblewrap`

## Completion Criteria

- [x] `npm run typecheck` passes.
- [x] Sandbox runtime targeted tests pass.
- [x] BaseTool executor sandbox targeted tests pass.
- [x] PraxisRuntimeKernel tests pass.
- [x] `npm run test:agentCore` passes or any skipped live tests are explicitly explained.
- [x] `git diff --check` passes.
- [x] The checklist above is updated with completed items as implementation lands.
