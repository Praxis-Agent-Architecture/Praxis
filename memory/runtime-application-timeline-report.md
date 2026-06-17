# Runtime Application Timeline Report

- `runtime.timelinePlane` keeps owning timeline report/index/query/replay semantics.
- `application.inspectTimeline` is the upper application command surface for the latest in-memory runtime snapshot.
- The command returns `praxis.application.timelineReport`, wrapping `praxis.runtime.createRuntimeTimelineReport`, `createRuntimeTimelineIndex`, `queryRuntimeTimeline`, and `createRuntimeTimelineReplayPlan`.
- Upper applications should use the command surface for live session inspection instead of importing runtime internals or creating a product-local timeline store.
- The runtime timeline smoke remains the durable SQLite/foundation rewind read-back proof; the application timeline smoke proves live application event transports plus command-level report inspection.
