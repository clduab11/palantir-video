import { describe, expect, it } from "vitest";

import {
  averagingFuse,
  cumulativeFuse,
  fuseSourceScopedOpinions,
  normalizeOpinion,
  trustDiscount,
  vacuousOpinion,
} from "@/lib/epistemics/subjective-logic";
import type { Opinion } from "@/lib/tise/types";

const EPS = 1e-9;

function onSimplex(opinion: Opinion): boolean {
  return (
    opinion.b >= -EPS &&
    opinion.d >= -EPS &&
    opinion.u >= -EPS &&
    opinion.b <= 1 + EPS &&
    opinion.d <= 1 + EPS &&
    opinion.u <= 1 + EPS &&
    Math.abs(opinion.b + opinion.d + opinion.u - 1) < 1e-9
  );
}

describe("normalizeOpinion simplex", () => {
  it("snaps dogmatic floating-point leftover u to 0", () => {
    const dogmatic = normalizeOpinion(1, 0, 1e-16);
    expect(dogmatic.u).toBe(0);
    expect(dogmatic.b).toBeCloseTo(1, 12);
    expect(onSimplex(dogmatic)).toBe(true);

    const split = normalizeOpinion(0.6, 0.4, 0);
    expect(split.u).toBe(0);
    expect(onSimplex(split)).toBe(true);
  });

  it("renormalizes when b+d drift slightly over 1", () => {
    const drifted = normalizeOpinion(0.7000000002, 0.3000000001, 0);
    expect(drifted.u).toBe(0);
    expect(onSimplex(drifted)).toBe(true);
  });

  it("treats non-finite and empty mass as vacuous", () => {
    expect(normalizeOpinion(Number.NaN, Number.POSITIVE_INFINITY, -3)).toEqual(
      vacuousOpinion(),
    );
    expect(normalizeOpinion(0, 0, 0).u).toBe(1);
  });
});

describe("averaging vs cumulative consensus", () => {
  const omega = normalizeOpinion(0.72, 0.08, 0.2, 0.5);

  it("is idempotent for a repeated same-source ping", () => {
    const once = averagingFuse([omega]);
    const twice = averagingFuse([omega, omega, omega]);
    expect(onSimplex(once)).toBe(true);
    expect(once.b).toBeCloseTo(omega.b, 12);
    expect(twice.b).toBeCloseTo(omega.b, 12);
    expect(twice.u).toBeCloseTo(omega.u, 12);
  });

  it("does not let one source echo itself the way two vectors corroborate", () => {
    const echoed = fuseSourceScopedOpinions([
      { sourceId: "ELINT-17", opinion: omega },
      { sourceId: "ELINT-17", opinion: omega },
    ]);
    const distinct = fuseSourceScopedOpinions([
      { sourceId: "ELINT-17", opinion: omega },
      { sourceId: "UAV-EO-1", opinion: omega },
    ]);
    expect(onSimplex(echoed)).toBe(true);
    expect(onSimplex(distinct)).toBe(true);
    expect(echoed.b).toBeCloseTo(omega.b, 10);
    expect(distinct.b).toBeGreaterThan(echoed.b);
    expect(distinct.u).toBeLessThan(echoed.u);
  });

  it("uses cumulative consensus across distinct sources and averaging within one", () => {
    const weaker = normalizeOpinion(0.4, 0.1, 0.5);
    const fused = fuseSourceScopedOpinions([
      { sourceId: "ELINT-17", opinion: omega },
      { sourceId: "ELINT-17", opinion: weaker },
      { sourceId: "UAV-EO-1", opinion: omega },
    ]);
    const averagedThenCumulative = cumulativeFuse(
      averagingFuse([omega, weaker]),
      omega,
    );
    expect(fused.b).toBeCloseTo(averagedThenCumulative.b, 12);
    expect(fused.u).toBeCloseTo(averagedThenCumulative.u, 12);
  });

  it("keeps two agreeing dogmatic opinions on the simplex", () => {
    const left = normalizeOpinion(1, 0, 0);
    const right = normalizeOpinion(1, 0, 1e-15);
    const averaged = averagingFuse([left, right]);
    const cumulative = cumulativeFuse(left, right);
    expect(averaged.u).toBe(0);
    expect(onSimplex(averaged)).toBe(true);
    expect(onSimplex(cumulative)).toBe(true);
    expect(onSimplex(trustDiscount(left, 0.4))).toBe(true);
  });
});
