# ADR-001: Deterministic epistemic core

## Status

Accepted

## Context

A commander product that calls a language model on raw reports will sound confident when the reports disagree, when a source repeats itself, and when a field is missing. the-synactic's rule is that context must refuse to lie. TISE is the tactical product on that rule.

## Decision

The fusion loop is deterministic TypeScript.

- Missing provenance, missing confidence, and secret-shaped fields are hard rejects.
- Opinions are Subjective Logic tuples, not a single float.
- Same-source reports are averaged. Distinct vectors are fused.
- Deception is a leave-one-out conflict drop plus a Whaley label.
- Posture is a pure function of those outputs, with a civilian gate that blocks STRIKE.

A language model is not on this path. If one is added later, it may only paraphrase a SITREP the engine already computed, and it may not change posture, veracity, or a grade.

## Consequences

- The same stream and the same clock produce the same SITREP.
- The vignette eval can fail CI when a posture drifts.
- The engine will miss phrasing it was not taught. That miss is visible as uncertainty, which is the point.
