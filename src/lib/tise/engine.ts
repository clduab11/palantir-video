import { evaluateAch } from "@/lib/epistemics/ach";
import { evaluateCounterDeception } from "@/lib/epistemics/deception";
import {
  buildClaimOpinion,
  temporalFreshnessWeight,
} from "@/lib/epistemics/subjective-logic";
import { buildOntologyGraph } from "@/lib/ontology/graph";

import { clusterEvents } from "./cluster";
import { buildConflicts, evaluateClusterEpistemics } from "./conflict";
import {
  eventAdmiralty,
  eventIntegrityHash,
  extractClaims,
  extractEntities,
} from "./lexicon";
import { parseEventStream, parseTiseEvent } from "./schema";
import { formatSitrep } from "./sitrep";
import { synthesizeSitrep } from "./synthesize";
import type {
  EngineOptions,
  EnrichedEvent,
  Rejection,
  SynthesisResult,
  TiseEvent,
} from "./types";

const MAX_EVENTS = 200;

export function ingestAndSynthesize(
  input: unknown,
  options: EngineOptions = {},
): SynthesisResult {
  const started = performance.now();
  const now = options.now ?? new Date();
  const staleMs = options.staleMs ?? 90 * 60 * 1000;
  const quarantinedEventsSet = new Set(options.quarantinedEventIds ?? []);
  const quarantinedSourcesSet = new Set(options.quarantinedSourceIds ?? []);

  const { candidates, envelopeError } = parseEventStream(input);
  const rejected: Rejection[] = [];
  const accepted: TiseEvent[] = [];

  if (envelopeError) {
    return emptyResult(now, [{ index: -1, reason: envelopeError, missing: [] }], started);
  }

  if (candidates.length > MAX_EVENTS) {
    return emptyResult(
      now,
      [
        {
          index: -1,
          reason: `REJECTED: stream exceeds ${MAX_EVENTS} events (precision over volume)`,
          missing: [],
        },
      ],
      started,
    );
  }

  candidates.forEach((candidate, index) => {
    const parsed = parseTiseEvent(candidate);
    if (!parsed.ok) {
      const eventId =
        candidate !== null &&
        typeof candidate === "object" &&
        "event_id" in candidate &&
        typeof candidate.event_id === "string"
          ? candidate.event_id
          : undefined;
      rejected.push({
        index,
        event_id: eventId,
        reason: parsed.reason,
        missing: parsed.missing,
      });
      return;
    }
    accepted.push(parsed.event);
  });

  if (accepted.length === 0) {
    return {
      ...emptyResult(now, rejected, started),
      rejected,
    };
  }

  const quarantinedEvents: TiseEvent[] = [];
  const activeAccepted: TiseEvent[] = [];

  const initialEnriched: EnrichedEvent[] = accepted.map((event) => {
    const ageMs = Math.max(0, now.getTime() - Date.parse(event.timestamp));
    const quarantined =
      quarantinedEventsSet.has(event.event_id) ||
      quarantinedSourcesSet.has(event.source_id);
    if (quarantined) {
      quarantinedEvents.push(event);
    } else {
      activeAccepted.push(event);
    }
    return {
      ...event,
      integrityHash: eventIntegrityHash(event),
      admiralty: eventAdmiralty(event),
      ageMinutes: Math.round(ageMs / 60_000),
      temporalWeight: temporalFreshnessWeight(ageMs, staleMs),
      quarantined,
    };
  });

  if (activeAccepted.length === 0) {
    const base = emptyResult(now, rejected, started);
    return {
      ...base,
      accepted,
      enrichedEvents: initialEnriched,
      quarantinedEvents,
      rejected,
    };
  }

  const { clusters, discardedNoise } = clusterEvents(activeAccepted, options);
  const discardedIds = new Set(discardedNoise.map((n) => n.event_id));
  const liveEvents = activeAccepted.filter((ev) => !discardedIds.has(ev.event_id));
  const liveEnriched = initialEnriched.filter(
    (ev) => !ev.quarantined && !discardedIds.has(ev.event_id),
  );

  const enrichedById = new Map(initialEnriched.map((ev) => [ev.event_id, ev]));

  const claims = liveEvents.flatMap((event) =>
    extractClaims(event, (ev, kind) => {
      const meta = enrichedById.get(ev.event_id);
      return buildClaimOpinion({
        confidenceScore: ev.confidence_score,
        trustWeight: meta?.admiralty.trustWeight ?? 0.65,
        temporalWeight: meta?.temporalWeight ?? 1,
        kind,
      });
    }),
  );

  const conflicts = buildConflicts(claims);
  const { assessments: deceptionAssessments, globalConflictMassC0 } =
    evaluateCounterDeception(liveEnriched, claims);

  const deceptionById = new Map(
    deceptionAssessments.map((d) => [d.eventId, d]),
  );
  const enrichedEvents: EnrichedEvent[] = initialEnriched.map((ev) => ({
    ...ev,
    deception: deceptionById.get(ev.event_id),
  }));

  const scoredClusters = clusters
    .map((cluster) =>
      evaluateClusterEpistemics({
        cluster,
        claims,
        conflicts,
        deceptions: deceptionAssessments,
        now,
        staleMs,
      }),
    )
    .sort((a, b) => b.veracity - a.veracity);

  const entities = extractEntities(liveEvents, claims);
  const ach = evaluateAch({
    claims,
    clusters: scoredClusters,
    conflicts,
    deceptions: deceptionAssessments,
    conflictMassC0: globalConflictMassC0,
  });

  const ontology = buildOntologyGraph({
    clusters: scoredClusters,
    entities,
    claims,
    conflicts,
    deceptions: deceptionAssessments,
    ach,
  });

  const sitrep = synthesizeSitrep({
    events: liveEvents,
    clusters: scoredClusters,
    claims,
    conflicts,
    deceptions: deceptionAssessments,
    ach,
    entities,
    now,
    options: { ...options, staleMs },
  });

  return {
    accepted,
    enrichedEvents,
    quarantinedEvents,
    rejected,
    discardedNoise,
    clusters: scoredClusters,
    claims,
    conflicts,
    deceptionAssessments,
    ach,
    ontology,
    entities,
    sitrep,
    sitrepText: formatSitrep(sitrep),
    asOf: now.toISOString(),
    computeMs: Number((performance.now() - started).toFixed(2)),
    sample: false,
  };
}

function emptyResult(
  now: Date,
  rejected: Rejection[],
  started: number,
): SynthesisResult {
  const ach = evaluateAch({
    claims: [],
    clusters: [],
    conflicts: [],
    deceptions: [],
    conflictMassC0: 0,
  });
  const sitrep = synthesizeSitrep({
    events: [],
    clusters: [],
    claims: [],
    conflicts: [],
    deceptions: [],
    ach,
    entities: [],
    now,
    options: {},
  });
  sitrep.threatSurface.detectedEntities = [
    "No valid events. Nothing to synthesize.",
  ];
  sitrep.recommendedPosture = "HOLD";
  sitrep.postureRationale =
    "Empty, quarantined, or rejected stream. Hold and wait for valid TISE JSON.";

  return {
    accepted: [],
    enrichedEvents: [],
    quarantinedEvents: [],
    rejected,
    discardedNoise: [],
    clusters: [],
    claims: [],
    conflicts: [],
    deceptionAssessments: [],
    ach,
    ontology: { objects: [], links: [] },
    entities: [],
    sitrep,
    sitrepText: formatSitrep(sitrep),
    asOf: now.toISOString(),
    computeMs: Number((performance.now() - started).toFixed(2)),
    sample: false,
  };
}
