# Runtime Application Governance And Tool-Call Reports

2026-06-09: `application.inspectGovernance` and `application.inspectToolCalls` are application-facing read commands for approval/governance and tool-call inspection.

Boundary:

- Both commands require the latest `RuntimeSessionSnapshot` for the active session.
- `application.inspectGovernance` returns `praxis.application.governanceReport`, wrapping `praxis.runtime.createRuntimeGovernanceReport`, index, and query.
- `application.inspectToolCalls` returns `praxis.application.toolCallReport`, wrapping `praxis.runtime.createRuntimeToolCallReport`, index, and query.
- They are read-only; they must not decide approvals, execute tools, change policy, or replace BaseTool/runtime governance semantics.
- `smoke:application-approval` is the direct command-level proof because it dispatches both commands after `application.approvalDecision` and validates approval, policy, dependency, sandbox, rollback, query, and public-safe facts.
