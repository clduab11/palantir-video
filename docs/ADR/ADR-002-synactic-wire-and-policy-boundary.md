# ADR-002: Synactic wire and policy boundary

## Status

Accepted

## Context

[the-synactic](https://github.com/clduab11/the-synactic) publishes a strict event envelope and a default-deny tool policy. Its MCP catalog includes `get_conflict_events`, `get_signal_convergence`, `get_temporal_anomalies`, and `get_population_exposure`. TISE must consume that wire without becoming a second place to hide a URL or a key.

## Decision

- Inbound envelopes map onto TISE events. Confidence is copied only when the payload already has `confidence_score`, `confidence`, or `veracity`.
- The server fetches only `SYNCTIC_MCP_URL` from the environment. Request bodies cannot choose a host.
- Payloads are scanned for secret-shaped keys and values before they enter the engine.
- Read synthesis and awareness CoT are allowed. A strike-nomination CoT is a write. It needs an unexpired, unused commander grant. Autonomous kinetic tools are denied by policy id `pol-kinetic-autonomous-ban`.
- TISE also exposes a read-only MCP surface at `POST /api/mcp`. That surface refuses nomination exports.

## Consequences

- A missing Synactic score is a visible rejection, not a default of 0.5.
- The published app can run the four vignettes with both secrets unset.
- A grant is single-use. The caller marks `usedAt`. The evaluator does not mutate the grant.
