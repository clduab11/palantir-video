import { assertNever } from "@/lib/tise/never";
import type { VectorType } from "@/lib/tise/types";

/**
 * NATO STANAG 2511 / AJP-2.1 Admiralty Code (6x6) + ODNI ICD 203 / ICD 206.
 * Source reliability (A..F) and information credibility (1..6) are strictly
 * orthogonal: a trusted sensor (A) can still observe a physical decoy (5 -> A5),
 * and an untested walk-in (F) can report a fact confirmed by EO/thermal (1 -> F1).
 */
export const SOURCE_RELIABILITY_GRADES = ["A", "B", "C", "D", "E", "F"] as const;
export type SourceReliability = (typeof SOURCE_RELIABILITY_GRADES)[number];

export const INFO_CREDIBILITY_GRADES = [1, 2, 3, 4, 5, 6] as const;
export type InfoCredibility = (typeof INFO_CREDIBILITY_GRADES)[number];

export const ANALYTIC_CONFIDENCE_LEVELS = ["LOW", "MODERATE", "HIGH"] as const;
export type AnalyticConfidence = (typeof ANALYTIC_CONFIDENCE_LEVELS)[number];

export type AdmiraltyRating = {
  readonly reliability: SourceReliability;
  readonly credibility: InfoCredibility;
  readonly code: `${SourceReliability}${InfoCredibility}`;
  readonly reliabilityLabel: string;
  readonly credibilityLabel: string;
  readonly trustWeight: number;
};

export function sourceReliabilityMeta(grade: SourceReliability): {
  label: string;
  trustWeight: number;
  priorUncertainty: number;
} {
  switch (grade) {
    case "A":
      return {
        label: "Completely reliable",
        trustWeight: 0.94,
        priorUncertainty: 0.06,
      };
    case "B":
      return {
        label: "Usually reliable",
        trustWeight: 0.82,
        priorUncertainty: 0.14,
      };
    case "C":
      return {
        label: "Fairly reliable",
        trustWeight: 0.68,
        priorUncertainty: 0.26,
      };
    case "D":
      return {
        label: "Not usually reliable",
        trustWeight: 0.44,
        priorUncertainty: 0.45,
      };
    case "E":
      return {
        label: "Unreliable",
        trustWeight: 0.2,
        priorUncertainty: 0.68,
      };
    case "F":
      return {
        label: "Reliability cannot be judged",
        trustWeight: 0.5,
        priorUncertainty: 0.55,
      };
    default:
      return assertNever(grade, "source reliability");
  }
}

export function infoCredibilityLabel(grade: InfoCredibility): string {
  switch (grade) {
    case 1:
      return "Confirmed by independent sources";
    case 2:
      return "Probably true";
    case 3:
      return "Possibly true";
    case 4:
      return "Doubtful";
    case 5:
      return "Improbable / contradicted";
    case 6:
      return "Truth cannot be judged";
    default:
      return assertNever(grade, "info credibility");
  }
}

export function inferSourceReliability(input: {
  explicit?: SourceReliability;
  vector: VectorType;
  sourceId: string;
  provenance: string;
  confidenceScore: number;
}): SourceReliability {
  if (input.explicit) return input.explicit;
  const hay = `${input.sourceId} ${input.provenance}`.toUpperCase();

  if (/WALK-IN|UNASSIGNED|ANONYMOUS|RUMOR|UNKNOWN/.test(hay)) return "F";
  if (/UNRELIABLE|DISCREDITED|FABRICAT/.test(hay)) return "E";
  if (/SECOND DEBRIEF|NOT ON THE GROUND|UNVERIFIED/.test(hay)) return "D";

  switch (input.vector) {
    case "GEOINT":
      if (/WESCAM|NIIRS\s*[5-9]|STEREO PAIR|CALIBRATED/.test(hay)) return "A";
      return input.confidenceScore >= 0.75 ? "B" : "C";
    case "SIGINT":
      if (/HASH-NOISE/.test(hay)) return "E";
      if (/ELINT|DRONE-EM|DF CUT/.test(hay)) return "B";
      return input.confidenceScore >= 0.7 ? "B" : "C";
    case "HUMINT":
      if (/EYES-ON|RECON|JTAC|OBS-A/.test(hay)) return "B";
      if (/SOURCE_|INFORMANT|HANDLER/.test(hay)) return "C";
      return "D";
    default:
      return assertNever(input.vector, "vector");
  }
}

export function deriveInitialCredibility(input: {
  explicit?: InfoCredibility;
  confidenceScore: number;
  payload: string;
}): InfoCredibility {
  if (input.explicit) return input.explicit;
  if (/unconfirmed|not on the ground|rumor/i.test(input.payload)) {
    return input.confidenceScore < 0.5 ? 4 : 3;
  }
  if (/likely noise|no demod/i.test(input.payload)) return 6;
  if (input.confidenceScore >= 0.88) return 2;
  if (input.confidenceScore >= 0.65) return 3;
  if (input.confidenceScore >= 0.4) return 4;
  return 5;
}

export function buildAdmiraltyRating(
  reliability: SourceReliability,
  credibility: InfoCredibility,
): AdmiraltyRating {
  const relMeta = sourceReliabilityMeta(reliability);
  return {
    reliability,
    credibility,
    code: `${reliability}${credibility}`,
    reliabilityLabel: relMeta.label,
    credibilityLabel: infoCredibilityLabel(credibility),
    trustWeight: relMeta.trustWeight,
  };
}

/**
 * ODNI ICD 203 standardized estimative probability phrase.
 * Must NEVER be combined in the same clause with AnalyticConfidence.
 */
export function icd203LikelihoodTerm(probability: number): string {
  if (probability >= 0.95) return "almost certain (95-99%)";
  if (probability >= 0.8) return "very likely (80-95%)";
  if (probability >= 0.55) return "likely (55-80%)";
  if (probability >= 0.45) return "roughly even chance (45-55%)";
  if (probability >= 0.2) return "unlikely (20-45%)";
  if (probability >= 0.05) return "very unlikely (05-20%)";
  return "remote / almost no chance (01-05%)";
}

export function deriveAnalyticConfidence(input: {
  uncertainty: number;
  vectorCount: number;
  deceptionHigh: boolean;
}): AnalyticConfidence {
  if (input.uncertainty > 0.45 || input.vectorCount <= 1) return "LOW";
  if (input.deceptionHigh || input.uncertainty > 0.22 || input.vectorCount === 2) {
    return "MODERATE";
  }
  return "HIGH";
}

export function formatIcd206Citation(input: {
  sourceId: string;
  eventId: string;
  admiraltyCode: string;
  integrityHash: string;
}): string {
  const shortEvent = input.eventId.slice(0, 8);
  const shortHash = input.integrityHash.replace(/^sha256:/, "").slice(0, 8);
  return `[SRC:${input.sourceId}#${shortEvent} | ${input.admiraltyCode} | h:${shortHash}]`;
}
