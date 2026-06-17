# Runtime Application Multiagent Report

2026-06-09: `application.inspectMultiagent` is the application-facing read command for multiagent inspection. It returns `praxis.application.multiagentReport` as command `output`, wrapping `praxis.runtime.createRuntimeMultiagentReport`, `createRuntimeMultiagentIndex`, and `queryRuntimeMultiagent`.

Boundary:

- The command is read-only; it must not spawn, wait, stop, kill, or schedule agents.
- Runtime/application facts come from existing application events, `agent.*` BaseTool progress, provider round-trip metadata, and child background runtime completion metadata.
- `runtime.multiagentPlane` keeps owning report/index/query normalization; the application layer only records enough evidence and exposes the facade.
- This does not complete durable event/checkpoint orchestration or the full multiagent strategy.
- `smoke:application-multiagent` is the direct command-level proof because it dispatches `application.inspectMultiagent` after `application.submitTurn`, then validates the application wrapper, runtime report, index, query, public-safe status, child session, child runtime, provider tool exposure, event path, background runtime, and reply correlation.
