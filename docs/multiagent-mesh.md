# Praxis Multiagent Mesh

Praxis multiagent v1 models agents as project-local session nodes connected by a runtime-owned message mesh. It is not a subagent tree by default. Applications can project a tree or leader/worker view on top of the mesh, but the runtime truth stays session-to-session messaging inside one project.

## Tool Group

The model-facing `agent` group exposes eight subtools:

- `agent.spawn` creates a new agent session and immediately sends its first task message.
- `agent.message` sends a queued or steer message to a target `sessionId`.
- `agent.inbox` reads the current session inbox and marks returned messages as read.
- `agent.list` lists project-local agent sessions.
- `agent.inspect` returns public-safe session status, summary, and pending message count.
- `agent.wait` waits for a reply correlated with a sent `messageId`.
- `agent.stop` requests graceful stop.
- `agent.kill` force terminates the session while keeping audit and inbox facts.

## Spawn Contract

`agent.spawn` may reuse an existing AgentDefinition or derive from the requester. Derived agents inherit sandbox, tool, policy, promptPack, memory, model, and workspace constraints. The model can only provide `name`, `description`, `appendPrompt`, `workingDirectory`, `lifecycle`, and `task`. `appendPrompt` changes identity/behavior guidance; `task` is the first human-input-style message.

The runtime generates stable ids. `name` is display-only. `workingDirectory` must remain inside the project workspace root.

## Message Contract

Messages target `sessionId`. `replyToMessageId` correlates replies, and the runtime marks the original message complete. Peer messages are context only; they do not gain user/system authority. `steer` is an interrupting intent in ordering terms, but it still waits until the target finishes the current tool/run boundary.

`agent.wait` has no model-visible timeout. Runtime heartbeat/stuck detection belongs to the runtime/application policy layer.

## Boundary

ACP is intentionally not part of this core. External harness adapters can later bridge into the same runtime contract, but Praxis v1 multiagent remains a project-local mesh.
