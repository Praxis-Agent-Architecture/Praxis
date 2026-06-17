# Runtime Application Sandbox Mount Matrix

2026-06-09: `application.inspectSandboxMountMatrix` is the application-facing read command for sandbox mount readiness. It returns `praxis.application.sandboxMountMatrix`, wrapping `runtime.sandboxPlane.mountMatrix`.

Boundary:

- The command is read-only. It prepares provider readiness and creates a command preview, but it must not execute shell commands or create rollback snapshots.
- Sandbox semantics stay in `runtime.sandboxPlane`; application layer only compiles the agent manifest, reads `manifest.sandbox`, and wraps the runtime mount matrix.
- If an application injects a sandbox provider, the matrix records `sandboxProviderInjected = true` and `providerReady = true` as readiness evidence; Praxis remains policy/approval/audit owner, while Raxcell remains environment/execution provider.
- `raxcell.policyOwner` must stay `praxis`, and `raxcell.providerRole` must stay `environment-and-execution`.
- `commandPlanPreview.executesCommand` must stay `false`; execution proof belongs in `npm run smoke:sandbox-shell` and application shell/rollback smokes.
- `test/applicationLayer/applicationSandbox.test.ts` is the direct command-level proof because it dispatches `application.inspectSandboxMountMatrix` and validates the application wrapper, runtime surface id, provider family, provider readiness, Raxcell boundary, policy middleware, and non-executing command preview.
- `npm run smoke:application-sandbox` is the upper-application smoke for this inspection surface. It complements `npm run smoke:sandbox-shell`, which proves actual runtime shell execution through workspace rollback and an injected Raxcell-like provider.
