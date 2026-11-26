# Tradecraft foundations

TISE cites these sources for the operations in `src/lib/epistemics` and `src/lib/interop`. The implementations are small, deterministic, and named after the operation they perform. They are not a claim that the papers endorse this software.

## Subjective Logic

Audun Jøsang, *Subjective Logic: A Formalism for Reasoning Under Uncertainty* (Springer, 2016).

A binomial opinion is `(b, d, u, a)` with `b + d + u = 1`. Projected probability is `b + a·u`.

- Trust discounting moves mass into `u` when the source is weak or the report is old. It does not invent disbelief.
- Cumulative consensus combines independent sources.
- Averaging fusion is idempotent, so a second cut from the same sensor does not count as a second source.

## Counter-deception

Johan Schubert, *Entropy-Based Counter-Deception in Information Fusion* (FOI-S--5508--SE).

For an evidence set `V`, conflict when `e_q` is removed falls from `c0` to `cq`. The conflict-based degree of falsity is `(c0 - cq) / (1 - cq)` when `cq < 1`. TISE combines that drop with the change in aggregated uncertainty on the binary frame {present, absent}.

Barton Whaley, *Stratagem* and *Practise to Deceive*. Simulation (showing the false): decoying, mimicking, inventing. Dissimulation (hiding the real): masking, repackaging, dazzling. TISE assigns one of those labels from the claim pattern. It does not claim a human deception planner.

## Analysis of Competing Hypotheses

Richards Heuer, *Psychology of Intelligence Analysis*, chapter 8. The four hypotheses are fixed for these vignettes: prepared defense, coordinated ambush, deception feint, stale or vacant. Evidence adds or subtracts log-weight. Collection gaps are ranked by how much Shannon entropy that task would be expected to remove. The number is a ranking aid, not a promise about a future sensor.

## Admiralty code and ICD 203 / 206

NATO STANAG 2511 / AJP-2.1 rates source reliability `A`–`F` separately from information credibility `1`–`6`. An `A5` is a trusted sensor reporting something that contradicts the picture.

ODNI ICD 203 separates estimative likelihood from analytic confidence. ICD 206 asks the product to carry a source summary a reader can reconstruct. TISE puts the likelihood sentence and the confidence label in different lines, and cites `[SRC:id#event | grade | hash]`.

## Symbols and CoT

MIL-STD-2525 symbology is drawn with [milsymbol](https://github.com/spatialillusions/milsymbol) (MIT). Cursor on Target v2.0 events use `lat`, `lon`, `ce`, `type`, and a `<detail>` block that carries the TISE veracity and provenance hash. A nomination document is not a fire order.

MGRS conversion uses the `mgrs` package (MIT) for WGS84. Training grids that the library cannot invert fall back to a local metric projection and are labeled as such by staying inside the fictional AOI.
