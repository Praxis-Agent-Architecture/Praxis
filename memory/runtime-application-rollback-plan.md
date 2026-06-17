# Runtime Application Rollback Plan

2026-06-09: `application.inspectRollbackPlan` is the application-facing read command for governed rollback planning. It returns `praxis.application.rollbackPlan`, wrapping `praxis.runtime.planRuntimeRollback` from `runtime.managementPlane.rollbackController`.

Boundary:

- The command is read-only and dry-run. It must not mutate conversation history, fork sessions, create filesystem rollback snapshots, or execute workspace rollback.
- It maps application conversation checkpoints to rollback controller revisions: current revision is the current application turn count, and target revision is the selected checkpoint turn index.
- Missing or rejected checkpoints are surfaced as public-safe `RuntimeRollbackResult` failures inside the command output; the command itself can still succeed so UI/CLI callers can show why a rollback would be rejected.
- `application.rewind` remains the mutating conversation restore command. Workspace file rollback remains owned by `runtime.sandboxPlane`.
- `test/applicationLayer/applicationRollbackPlan.test.ts` is the direct command-level proof.
- `npm run smoke:application-rollback-plan` is the upper-application smoke for the dry-run management surface.
