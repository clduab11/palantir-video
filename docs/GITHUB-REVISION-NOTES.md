# GitHub revision notes

Pre-submission review for the repo owner. TISE is a deterministic commander SITREP trainer on a fictional area of interest. It is not for operational use.

## 1. Ready to publish

The four vignettes match their contracted postures on the scorecard in `docs/EVAL-SCORECARD.md`: district-seven MANEUVER, corridor-mirage WITHDRAW, iron-anvil STRIKE, blackout-ddil HOLD. `npm test` (vitest), `npm run eval`, `npm run lint`, and `npm run build` are the local checks. `.github/workflows/ci.yml` runs those plus `tsc --noEmit` on Node 22. Demo keys are in `docs/FELLOWSHIP-DEMO-RUNBOOK.md`: `1`–`4` load vignettes, space pauses, `L` opens lineage, `M` opens the hypothesis strip, `C` exports awareness Cursor-on-Target. The console is `npm run dev` on port 4317.

Put the datum sentence from section 3 in the README on the same push. The rest of the tree can go up as it is.

## 2. What the seven workstreams contain

1. Ingest gate: event types, MGRS and WGS84 conversion through the `mgrs` package, STANAG 2511 source reliability and information credibility on separate axes, and a hard reject for missing provenance, missing confidence, and secret-shaped fields or values.
2. Fusion: Jøsang Subjective Logic opinions `(b, d, u, a)`, averaging when the same source repeats, cumulative consensus for distinct vectors, Schubert leave-one-out falsity, a Whaley label, and Heuer ACH expected information gain over four fixed hypotheses.
3. Ontology and policy: typed objects and links with SHA-256 lineage, a default-deny action policy, a single-use commander grant for a strike-nomination document, and an ICD 203/206 SITREP that keeps estimative likelihood and analytic confidence on different lines.
4. Interop: MIL-STD-2525 SVG from milsymbol, Cursor-on-Target v2.0, an optional server-side pull of `get_conflict_events`, `get_signal_convergence`, `get_temporal_anomalies`, and `get_population_exposure`, and a read-only MCP surface at `POST /api/mcp` that refuses nomination.
5. Vignettes and proof: the four contracted postures above, `npm run tise -- synthesize <id> --format=sitrep|cot|json`, fast-check invariants, and the eval scorecard.
6. Console: signal stream, a pannable OpenStreetMap chart (Chart | Cells) with fictional blocks and 2525 markers on a training datum, the SITREP pane, friction and ACH strip, lineage dialog, quarantine, and a CoT dialog.
7. Docs and CI: README, `docs/TRADECRAFT-FOUNDATIONS.md`, two ADRs, the demo runbook, the scorecard, and the GitHub Actions workflow.

Upstream is [github.com/clduab11/the-synactic](https://github.com/clduab11/the-synactic). A Synactic envelope is accepted only when it already carries `confidence_score`, `confidence`, or `veracity`. The adapter does not fill in a number. `SYNCTIC_MCP_URL` and `SYNCTIC_API_KEY` are optional. Unset, the console stays on the sample vignettes.

## 3. Submission risks

**Datum and Washington.** The vignette grids are literal MGRS in square `18S UJ`. The installed `mgrs` package inverts `18S UJ 23481 06512` to about 38.890 N, 77.035 W, downtown Washington, DC. The other vignettes land in the same city. The chart in `src/components/console/unit-map.tsx` does not plot those coordinates. `src/lib/interop/training-chart.ts` keeps only the relative meters and draws them from 36.20 N, 60.50 W, open ocean, with a fictional block overlay and the caption "Training datum. Relative MGRS geometry. Not a real place." Cursor-on-Target `<point>` uses that same display datum. The MGRS string itself is still real grid math. Do not paste a vignette grid into a live C2 client. Say that in the README on the same push.

**Classification banner.** The amber bar reads `TRAINING INSTRUMENT // FICTIONAL AOI · not for operational use`. The double slash looks like a portion marking. It is a training caveat. There is no classification authority behind it, and the repo holds no classified material. If a reviewer asks, say that in one sentence and point at the banner, the README charter, and the vignette metadata. A plainer line is safer on a public repo: training instrument, fictional area, not for operational use.

**No kinetic execution.** STRIKE is a recommended posture. A nomination export is a document. `POST /api/export/cot` returns 403 until a grant is attached. The grant is minted by `mintCommanderApprovalGrant`, expires, and is single-use. Policy `pol-kinetic-autonomous-ban` denies `tise.kinetic.*`. The read-only MCP tool `tise_export_cot` refuses `mode: nomination`. Say: the engine does not task a sensor and does not send a weapon. STRIKE means the evidence would support a nomination, and the policy still wants a person.

**Secrets.** `.env.example` ships both variables empty. `.gitignore` ignores `.env*` and keeps the example. The key is read from `process.env` in `src/lib/synactic/client.ts` and used only by the server route. `GET /api/synactic` returns host and reason, not the key. Request bodies cannot choose the upstream host. Secret-shaped keys and token-shaped values are rejected before fusion. Say: no live key is in the tree. Leave both variables unset for the public demo. If you bind them later, they stay on the server.

**Licenses.** milsymbol and the `mgrs` package are MIT. Leaflet is BSD-2-Clause. The chart loads `tile.openstreetmap.org`. OSM data is ODbL, and the public tile server has its own usage policy. The map credits OSM in the corner. For a public demo that is acceptable. For a busy published app, switch the tile URL to a service you are allowed to hammer, and keep the attribution. Add a `LICENSE` for this repo on the same push. GitHub will otherwise show no license.

## 4. Tighten after the first public push

The chart pans, zooms, and fits the units. The 10 by 10 cell grid is still behind Chart | Cells. What is still thin: the roads are short connectors between sites, not a full street network, and the basemap under them is ocean. That is deliberate. Do not "fix" it by plotting the literal WGS84.

The echo-chamber and civilian-gate tests already exist in `src/lib/epistemics/invariants.test.ts`. Eight copies of one Iron Anvil report stay off STRIKE and stay on a single vector. A civilian report on the Iron Anvil aim point blocks STRIKE. District Seven stays MANEUVER while civilians and deception remain.

The UI is dense at 1440 by 900. One viewport holds the banner, the header, three columns, a short lower deck, and the ingest dock. The friction list and the ACH cards scroll inside those short panes. It fits. It is tight.

## 5. About text

Paste these ten lines as the GitHub description, or as the first paragraph of the public README.

```
TISE is a deterministic commander SITREP trainer on a fictional area of interest.
It grades every report, treats conflict as a collection gap, and does not invent confidence.
Four vignettes: District Seven MANEUVER, Corridor Mirage WITHDRAW, Iron Anvil STRIKE, Blackout DDIL HOLD.
Fusion is Subjective Logic. Deception is Schubert leave-one-out falsity plus a Whaley label. Collection gaps are ranked by ACH information gain.
Grades follow STANAG 2511. SITREP wording follows ICD 203 and ICD 206. Symbols are MIL-STD-2525 via milsymbol.
Awareness Cursor-on-Target exports freely. A strike nomination requires a human grant. The engine does not execute a kinetic action.
Optional upstream is github.com/clduab11/the-synactic. SYNCTIC_MCP_URL and SYNCTIC_API_KEY are server-only and may stay unset.
Read-only tools are at POST /api/mcp.
The vignette MGRS is square 18S UJ and inverts near downtown Washington. The picture is training geometry, not that city.
Not for operational use.
```
