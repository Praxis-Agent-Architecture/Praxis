# Runtime Application Model-Call Report

2026-06-09: `application.inspectModelCalls` is the application-facing read command for model-call inspection. It returns `praxis.application.modelCallReport` as command `output`, wrapping `praxis.runtime.createRuntimeModelCallReport`, index, and query.

Boundary:

- The report is read-only; it must not call providers, choose routes, or replace `runtime.modelAdapter`.
- Runtime facts come from application `model` events plus the latest `RuntimeSessionSnapshot` for the session.
- Do not add a separate `runtime.modelCall.report` acceptance surface. Track it under `runtime.modelAdapter` and `runtime.promptPackCache`.
- `smoke:application-promptpack-cache` is the direct command-level proof because it dispatches `application.inspectModelCalls` and validates cacheDebug, usage, query, and public-safe report output.
