# TISE — Tactical Intelligence Synthesis Engine

Commander SITREP engine for a training vignette, not a live targeting system. TISE does not summarize a stream. It grades every report, treats conflict as a collection gap, and refuses to invent confidence.

It sits downstream of [the-synactic](https://github.com/clduab11/the-synactic): Synactic envelopes come in with provenance, and TISE does not fabricate a score the envelope did not carry.

## What you can show

The center pane is a chart you can pan and zoom. The 100 m cell grid is still there under Chart | Cells.

**MGRS / Washington, DC datum caveat.** Vignette MGRS strings in square `18S UJ` invert near downtown Washington, DC (for example `18S UJ 23481 06512` → about 38.890 N, 77.035 W). The training chart does not plot those coordinates. It keeps only the relative meters and draws them on an ocean training datum at `36.20 N, 60.50 W`. Do not paste a vignette grid into a live C2 client.

Open the console and step four fictional vignettes:

| Key | Vignette | Contracted posture |
| --- | --- | --- |
| 1 | District Seven | MANEUVER |
| 2 | Corridor Mirage | WITHDRAW |
| 3 | Iron Anvil | STRIKE, behind a human grant |
| 4 | Blackout DDIL | HOLD |

Quarantine a report with OUT. The posture recomputes from the remaining evidence. Awareness Cursor-on-Target XML exports freely. A strike nomination without a commander grant is refused.

## Loop

1. Reject anything missing `provenance` or `confidence_score`, and anything that looks like a credential.
2. Cluster on MGRS, with WGS84 conversion when a report arrives as lat/lon.
3. Grade source reliability and information credibility separately (STANAG 2511).
4. Fuse claims with Subjective Logic. Same-source repeats average. Distinct vectors use consensus.
5. Score deception with a leave-one-out conflict drop and a Whaley class.
6. Rank hypotheses and collection gaps by expected information gain.
7. Emit an ICD 203/206 SITREP and, when policy allows, CoT v2.0.

The math and the citations are in [docs/TRADECRAFT-FOUNDATIONS.md](docs/TRADECRAFT-FOUNDATIONS.md).

## Run

```bash
npm install
npm test
npm run eval
npm run dev
```

Console: [http://127.0.0.1:4317](http://127.0.0.1:4317)

```bash
npm run tise -- synthesize district-seven --format=sitrep
npm run tise -- synthesize iron-anvil --format=cot
```

Optional live pull, server-side only: `SYNCTIC_MCP_URL` and `SYNCTIC_API_KEY`. Unset, the console stays on the sample vignettes. See `.env.example`.

## Event

```json
{
  "event_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "timestamp": "2026-11-26T14:00:00.000Z",
  "vector_type": "SIGINT",
  "source_id": "ELINT-17",
  "location": { "mgrs": "18S UJ 23481 06512", "description": "Warehouse 7" },
  "payload": "RPK-pattern burst radio, two signatures.",
  "confidence_score": 0.88,
  "provenance": "SIGINT ELINT-17 / DF cut 3",
  "perceived_threat_level": "HIGH"
}
```

`source_reliability` (`A`–`F`) and `info_credibility` (`1`–`6`) are optional. When they are absent, TISE derives them and keeps them on separate axes.

## HTTP

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ingest` | Synthesize a stream, 200 events max |
| GET | `/api/scenario?id=` | One vignette plus its SITREP |
| GET/POST | `/api/synactic` | Link status, or a pull from the configured MCP URL |
| POST | `/api/export/cot` | Awareness CoT, or a nomination if a grant is attached |
| POST | `/api/mcp` | Read-only MCP tools |

## Charter

Training instrument. Fictional area of interest. Not for operational use. The engine will not execute a kinetic action. A nomination export is a document, and it still requires a person.
