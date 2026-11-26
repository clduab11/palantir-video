import { vacuousOpinion } from "@/lib/epistemics/subjective-logic";

import { eventAdmiralty, inferLandmark, resolveSiteIdentity } from "./lexicon";
import { chebyshev100m, haversineMeters, parseMgrs } from "./mgrs";
import type {
  Cluster,
  EngineOptions,
  Landmark,
  TiseEvent,
  VectorType,
} from "./types";

const DEFAULT_WINDOW_MS = 20 * 60 * 1000;
const DEFAULT_NOISE = 0.4;

function parent(ids: number[], i: number): number {
  if (ids[i] !== i) {
    ids[i] = parent(ids, ids[i] ?? i);
  }
  return ids[i] ?? i;
}

function union(ids: number[], a: number, b: number): void {
  const pa = parent(ids, a);
  const pb = parent(ids, b);
  if (pa !== pb) ids[pa] = pb;
}

function eventTime(event: TiseEvent): number {
  return Date.parse(event.timestamp);
}

function dominantSite(events: TiseEvent[]): {
  landmark: Landmark;
  siteKey: string;
  siteLabel: string;
} {
  const counts = new Map<
    string,
    { count: number; landmark: Landmark; siteKey: string; siteLabel: string }
  >();
  for (const event of events) {
    const landmark = inferLandmark(event.payload, event.location.description);
    const site = resolveSiteIdentity(
      landmark,
      event.location.description,
      event.location.mgrs,
    );
    const prev = counts.get(site.siteKey);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(site.siteKey, { count: 1, ...site });
    }
  }
  let best: {
    count: number;
    landmark: Landmark;
    siteKey: string;
    siteLabel: string;
  } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }
  return (
    best ?? {
      landmark: "UNKNOWN",
      siteKey: "UNKNOWN",
      siteLabel: "Unidentified landmark",
    }
  );
}

export function clusterEvents(
  events: TiseEvent[],
  options: EngineOptions = {},
): { clusters: Cluster[]; discardedNoise: TiseEvent[] } {
  const windowMs = options.timeWindowMs ?? DEFAULT_WINDOW_MS;
  const noiseFloor = options.noiseConfidence ?? DEFAULT_NOISE;
  const parsed = events.map((event) => ({
    event,
    mgrs: parseMgrs(event.location.mgrs),
    t: eventTime(event),
  }));

  const located = parsed.filter((row) => row.mgrs !== null);
  const ids = located.map((_, index) => index);

  for (let i = 0; i < located.length; i += 1) {
    for (let j = i + 1; j < located.length; j += 1) {
      const left = located[i];
      const right = located[j];
      if (!left?.mgrs || !right?.mgrs) continue;
      const dt = Math.abs(left.t - right.t);
      const distance = chebyshev100m(left.mgrs, right.mgrs);
      if (distance !== null) {
        const sameCell = distance === 0 && dt <= windowMs;
        const adjacent =
          distance === 1 &&
          dt <= windowMs / 2 &&
          left.mgrs.cell1km === right.mgrs.cell1km;
        if (sameCell || adjacent) union(ids, i, j);
        continue;
      }
      const meters = haversineMeters(left.mgrs, right.mgrs);
      if (
        (meters <= 120 && dt <= windowMs) ||
        (meters <= 220 && dt <= windowMs / 2)
      ) {
        union(ids, i, j);
      }
    }
  }

  const groups = new Map<number, typeof located>();
  located.forEach((row, index) => {
    const root = parent(ids, index);
    const list = groups.get(root) ?? [];
    list.push(row);
    groups.set(root, list);
  });

  const discardedNoise: TiseEvent[] = [];
  const clusters: Cluster[] = [];
  let serial = 1;

  for (const group of groups.values()) {
    const members = group.map((row) => row.event);
    const isNoise =
      members.length === 1 &&
      (members[0]?.confidence_score ?? 0) < noiseFloor &&
      members[0]?.perceived_threat_level === "LOW";

    if (isNoise && members[0]) {
      discardedNoise.push(members[0]);
      continue;
    }

    const firstMgrs = group[0]?.mgrs;
    if (!firstMgrs) continue;

    const vectors = [
      ...new Set(members.map((event) => event.vector_type)),
    ] as VectorType[];
    const distinctSources = new Set(members.map((ev) => ev.source_id)).size;
    const easting =
      group.reduce((sum, row) => sum + (row.mgrs?.easting100m ?? 0), 0) /
      group.length;
    const northing =
      group.reduce((sum, row) => sum + (row.mgrs?.northing100m ?? 0), 0) /
      group.length;
    const lat =
      group.reduce((sum, row) => sum + (row.mgrs?.lat ?? 0), 0) / group.length;
    const lon =
      group.reduce((sum, row) => sum + (row.mgrs?.lon ?? 0), 0) / group.length;

    const site = dominantSite(members);
    const leadAdm = members[0] ? eventAdmiralty(members[0]).code : "F6";

    clusters.push({
      id: `HZ-${serial.toString().padStart(2, "0")}`,
      cell100m: firstMgrs.cell100m,
      cell1km: firstMgrs.cell1km,
      landmark: site.landmark,
      siteKey: site.siteKey,
      siteLabel: site.siteLabel,
      events: members.sort((a, b) => eventTime(a) - eventTime(b)),
      vectors,
      veracity: 0,
      opinion: vacuousOpinion(),
      admiraltyCode: leadAdm,
      sidc: "SUGPUCI---*****",
      cotType: "a-u-G-U-C",
      hot:
        distinctSources >= 2 ||
        (members[0]?.confidence_score ?? 0) >= 0.7,
      noStrike: false,
      centroid: { easting100m: easting, northing100m: northing, lat, lon },
    });
    serial += 1;
  }

  return { clusters, discardedNoise };
}
