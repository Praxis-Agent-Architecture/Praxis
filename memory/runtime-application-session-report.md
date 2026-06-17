# Runtime Application Session Report

- `runtime.sessionPlane` keeps owning session/fork/checkpoint report semantics.
- `application.inspectSessionReport` is the upper application command surface for mounted foundation project session inspection.
- The command returns `praxis.application.sessionReport`, wrapping `praxis.runtime.createRuntimeSessionReport` over the current foundation session and project snapshots.
- Upper applications should use the command surface for live session/foundation inspection instead of importing runtime internals or creating a product-local session store.
- The application foundation lifecycle smoke proves ordinary session status/title, project session counts, released lease facts, and binding consistency through this command.
- The application foundation rewind smoke proves fork relation, checkpoint, copied conversation, and copied-message facts through this command.
