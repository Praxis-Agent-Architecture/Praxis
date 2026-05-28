# Project Session Foundation

Praxis runtime foundation treats `Project` as the user-facing unit above `Session`.

Plain-language model:

```text
Project
  -> main workspace
  -> sessions
  -> conversation turns
  -> runtime events
  -> shared artifacts
```

## Decisions

- A project exists only after user action creates or opens it.
- Direct chat is represented as a `chat` project with one default session.
- A formal workspace project is represented as `workspace-project`.
- `chat` can be upgraded in place to `workspace-project`, but only by explicit user action.
- One main workspace has one project stub: `.rax_workspace/project.json`.
- The global `~/.rax/projects/index.json` may exist later as an accelerator, but the project stub remains the local truth.
- A project has an exclusive owner lock through `.rax_workspace/project.lock`.
- If the previous owner process is gone or the lease expires, a new owner can take over automatically.
- SQLite is the default persistence path through `.rax_workspace/sessions/praxis.sqlite`.
- No schema migration runner is introduced for this release.

## Runtime Surfaces

- `praxis.project({...})` creates a pure `ProjectSpec`. It does not read files, create directories, acquire locks, or initialize SQLite.
- `praxis.runtime.project.open(...)` opens or creates the project runtime, resolves `.rax_workspace`, initializes storage, writes `project.json`, and acquires the project lease.
- `praxis.runtime.session.createPraxisSessionManager(projectRuntime)` creates, resumes, lists, renames, closes, archives, switches agent bindings, and forks sessions.
- `praxis.runtime.conversation.createPraxisConversationManager(projectRuntime)` writes turn checkpoints, appends semantic conversation messages, reads windows, and stores summaries.

## Session Semantics

Sessions belong to a project and bind to one active agent at a time.

Switching agent keeps the same conversation timeline and writes an agent binding event. Rewind is not destructive; it is implemented as session fork:

```text
session A at turn.3
  rewind from turn.1
    -> create session B
    -> parentSessionId = session A
    -> forkedFromTurnId = turn.1
    -> original session A remains unchanged
```

Each turn is a checkpoint. Tool calls remain in runtime events/invocations; conversation messages store only user, assistant, system, and runtime-summary material.

## Artifacts

Artifacts are project-shared. A session may reference an artifact, but project views can list all artifacts under `.rax_workspace/artifacts/<yyyy-mm>/<artifactId>/`.

## Application Boundary

The application layer may open the foundation project plane and display the foundation project status, but it should not own project/session/conversation facts itself long term. GUI and TUI layers consume project/session/conversation managers instead of reinventing persistence.
