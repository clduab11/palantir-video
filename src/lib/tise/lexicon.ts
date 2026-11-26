import { canonicalEventDigest } from "@/lib/crypto/sha256";
import {
  buildAdmiraltyRating,
  deriveInitialCredibility,
  formatIcd206Citation,
  inferSourceReliability,
} from "@/lib/interop/tradecraft";

import { parseMgrs } from "./mgrs";
import { assertNever } from "./never";
import type {
  AssertionKind,
  Claim,
  DetectedEntity,
  EntityKind,
  Landmark,
  Opinion,
  TiseEvent,
} from "./types";

type LandmarkRule = {
  landmark: Landmark;
  pattern: RegExp;
};

const LANDMARK_RULES: LandmarkRule[] = [
  { landmark: "WAREHOUSE_7", pattern: /warehouse\s*7|wh-?7|loading dock/i },
  { landmark: "BUILDING_12", pattern: /building\s*12|bldg\.?\s*12|b12\b/i },
  { landmark: "MARKET_SQUARE", pattern: /market(\s+square)?|bazaar/i },
  { landmark: "OVERPASS", pattern: /overpass|flyover|underpass/i },
  {
    landmark: "MOSQUE_COURTYARD",
    pattern: /mosque|courtyard|minaret/i,
  },
  { landmark: "RAIL_DEPOT", pattern: /rail\s*depot|marshalling\s*yard|railyard/i },
  { landmark: "WATER_TOWER", pattern: /water\s*tower|reservoir\s*ridge/i },
  { landmark: "CLINIC_ANNEX", pattern: /clinic(\s*annex)?|hospital|triage\s*tent/i },
  { landmark: "SUBSTATION_4", pattern: /substation\s*4|transformer\s*yard/i },
  { landmark: "INDUSTRIAL_YARD", pattern: /industrial\s*yard|foundry\s*lot|slag\s*yard/i },
  { landmark: "BRIDGE_NORTH", pattern: /north\s*bridge|bridge\s*north|span\s*alpha/i },
];

type KindRule = {
  kind: AssertionKind;
  pattern: RegExp;
};

const KIND_RULES: KindRule[] = [
  { kind: "decoy", pattern: /decoy|spoof|repeater|no corresponding|bait\s*emitter/i },
  { kind: "ambush", pattern: /ambush|l-shaped|will be hit|kill zone|fire\s*sack/i },
  {
    kind: "civilian",
    pattern:
      /civilian|non-combatant|shopkeeper|market crowd|evacuee|patient|medical\s*staff/i,
  },
  {
    kind: "thermal_none",
    pattern:
      /still cold|no thermal|no heat|cold building|no movement building|ambient\s*thermal/i,
  },
  {
    kind: "thermal_positive",
    pattern: /heat bloom|heat signature|thermal:|bodies|warm|hot\s*tube|muzzle\s*flash/i,
  },
  {
    kind: "absence",
    pattern:
      /no personnel|no movement|empty|unoccupied|still cold|no corresponding|evacuated|zero\s*civilian/i,
  },
  {
    kind: "presence",
    pattern:
      /places? .+ in|armed personnel|infantry|men moving|\bbodies\b|occupied|mortar\s*team|firing\s*crew|gun\s*team/i,
  },
  {
    kind: "em_active",
    pattern:
      /radio|vhf|uhf|elint|rpk-pattern|burst|ping|rf signature|cellular|datalink|uplink/i,
  },
  { kind: "em_none", pattern: /no em|emcon|silent|no radio|rf\s*dark/i },
  {
    kind: "static_defense",
    pattern: /sandbag|fortif|embedded|defensive|roof|revetment|dug-in|firing\s*pit/i,
  },
  { kind: "movement", pattern: /moving|infiltrat|mobile|en route|from .+ toward|displac/i },
];

type EntityRule = {
  kind: EntityKind;
  pattern: RegExp;
};

const ENTITY_RULES: EntityRule[] = [
  { kind: "MANPADS", pattern: /manpads|sa-18|igla|stinger/i },
  { kind: "RPK", pattern: /\brpk\b/i },
  { kind: "PKM", pattern: /\bpkm\b/i },
  { kind: "DSHK", pattern: /dshk|dshkm|12\.7/i },
  { kind: "IED", pattern: /\bied\b|pressure plate|vbied|command\s*wire/i },
  { kind: "RPG", pattern: /\brpg\b|rpg-7/i },
  { kind: "DRONE", pattern: /\bquadcopter\b|\bdrone\b|hostile uav|loitering\s*munition/i },
  { kind: "SNIPER", pattern: /sniper|marksman/i },
  { kind: "MORTAR", pattern: /mortar|82\s*mm|120\s*mm/i },
  { kind: "SANDBAGS", pattern: /sandbag|revetment|firing\s*pit/i },
  { kind: "ANTENNA", pattern: /antenna|repeater|directional\s*mast/i },
  { kind: "VAN", pattern: /\bvan\b|hilux|technical\s*pickup/i },
  { kind: "CELL_CLUSTER", pattern: /cellular ping|device cluster/i },
  { kind: "HEAVY_WEAPONS", pattern: /heavy weapons|rpk|pkm|dshk|mortar/i },
  {
    kind: "INFANTRY",
    pattern: /armed personnel|infantry|men moving|bodies|mortar\s*team|firing\s*crew/i,
  },
];

export function landmarkLabel(landmark: Landmark): string {
  switch (landmark) {
    case "WAREHOUSE_7":
      return "Warehouse 7";
    case "BUILDING_12":
      return "Building 12";
    case "MARKET_SQUARE":
      return "Market square";
    case "OVERPASS":
      return "Overpass";
    case "MOSQUE_COURTYARD":
      return "Mosque courtyard";
    case "RAIL_DEPOT":
      return "Rail depot";
    case "WATER_TOWER":
      return "Water tower";
    case "CLINIC_ANNEX":
      return "Clinic annex";
    case "SUBSTATION_4":
      return "Substation 4";
    case "INDUSTRIAL_YARD":
      return "Industrial yard";
    case "BRIDGE_NORTH":
      return "North bridge";
    case "CUSTOM_SECTOR":
      return "Custom sector";
    case "UNKNOWN":
      return "Unidentified landmark";
    default:
      return assertNever(landmark, "landmark");
  }
}

export function inferLandmark(text: string, fallbackDescription: string): Landmark {
  for (const rule of LANDMARK_RULES) {
    if (rule.pattern.test(fallbackDescription)) return rule.landmark;
  }
  for (const rule of LANDMARK_RULES) {
    if (rule.pattern.test(text)) return rule.landmark;
  }
  return fallbackDescription.trim().length > 0 ? "CUSTOM_SECTOR" : "UNKNOWN";
}

function normalizeCustomSiteKey(description: string, mgrs: string): {
  siteKey: string;
  siteLabel: string;
} {
  const base = description.split(",")[0]?.trim() ?? description.trim();
  if (base.length > 0 && !/^unidentified/i.test(base)) {
    const slug = base
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);
    return {
      siteKey: `SITE_${slug || "CUSTOM"}`,
      siteLabel: base,
    };
  }
  const parsed = parseMgrs(mgrs);
  return {
    siteKey: parsed ? `CELL_${parsed.cell100m.replace(/\s+/g, "_")}` : "UNKNOWN",
    siteLabel: base || parsed?.cell100m || "Unidentified landmark",
  };
}

export function resolveSiteIdentity(
  landmark: Landmark,
  description: string,
  mgrs: string,
): { landmark: Landmark; siteKey: string; siteLabel: string } {
  if (landmark !== "CUSTOM_SECTOR" && landmark !== "UNKNOWN") {
    return {
      landmark,
      siteKey: landmark,
      siteLabel: landmarkLabel(landmark),
    };
  }
  const custom = normalizeCustomSiteKey(description, mgrs);
  return {
    landmark,
    siteKey: custom.siteKey,
    siteLabel: custom.siteLabel,
  };
}

function defaultOpinionFromConfidence(confidence: number): Opinion {
  const clamped = Math.min(1, Math.max(0, confidence));
  const u = Math.max(0.05, 1 - clamped * 0.9);
  const b = clamped * (1 - u);
  const d = Math.max(0, 1 - b - u);
  return {
    b,
    d,
    u,
    a: 0.5,
    projected: b + 0.5 * u,
  };
}

function excerptAround(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) {
    return text.slice(0, 140);
  }
  const start = Math.max(0, match.index - 24);
  const end = Math.min(text.length, match.index + match[0].length + 48);
  return text.slice(start, end).trim();
}

function landmarkHitsIn(text: string): { landmark: Landmark; index: number }[] {
  const hits: { landmark: Landmark; index: number }[] = [];
  for (const rule of LANDMARK_RULES) {
    const copy = new RegExp(rule.pattern.source, "ig");
    let match: RegExpExecArray | null = copy.exec(text);
    while (match) {
      hits.push({ landmark: rule.landmark, index: match.index });
      match = copy.exec(text);
    }
  }
  return hits;
}

function nearestLandmark(
  index: number,
  hits: { landmark: Landmark; index: number }[],
  fallback: Landmark,
): Landmark {
  if (hits.length === 0) return fallback;
  let best = hits[0];
  if (!best) return fallback;
  let bestDist = Math.abs(best.index - index);
  for (const hit of hits) {
    const distance = Math.abs(hit.index - index);
    if (distance < bestDist) {
      best = hit;
      bestDist = distance;
    }
  }
  return bestDist > 90 ? fallback : best.landmark;
}

function splitClauses(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function lastMentionedLandmark(
  hits: { landmark: Landmark; index: number }[],
  fallback: Landmark,
): Landmark {
  if (hits.length === 0) return fallback;
  return (
    [...hits].sort((left, right) => left.index - right.index).at(-1)?.landmark ??
    fallback
  );
}

export function eventIntegrityHash(event: TiseEvent): string {
  if (event.integrity_hash) return event.integrity_hash;
  return canonicalEventDigest({
    event_id: event.event_id,
    timestamp: event.timestamp,
    vector_type: event.vector_type,
    source_id: event.source_id,
    mgrs: event.location.mgrs,
    payload: event.payload,
    provenance: event.provenance,
  });
}

export function eventAdmiralty(event: TiseEvent) {
  const reliability = inferSourceReliability({
    explicit: event.source_reliability,
    vector: event.vector_type,
    sourceId: event.source_id,
    provenance: event.provenance,
    confidenceScore: event.confidence_score,
  });
  const credibility = deriveInitialCredibility({
    explicit: event.info_credibility,
    confidenceScore: event.confidence_score,
    payload: event.payload,
  });
  return buildAdmiraltyRating(reliability, credibility);
}

export function extractClaims(
  event: TiseEvent,
  opinionFactory: (event: TiseEvent, kind: AssertionKind) => Opinion = (ev) =>
    defaultOpinionFromConfidence(ev.confidence_score),
): Claim[] {
  const fallback = inferLandmark(
    event.location.description,
    event.location.description,
  );
  const claims: Claim[] = [];
  const seen = new Set<string>();
  let lastLandmark = fallback;
  const admiralty = eventAdmiralty(event);
  const integrityHash = eventIntegrityHash(event);

  for (const clause of splitClauses(event.payload)) {
    const hits = landmarkHitsIn(clause);
    lastLandmark = lastMentionedLandmark(hits, lastLandmark);
    for (const rule of KIND_RULES) {
      const copy = new RegExp(rule.pattern.source, "ig");
      let match: RegExpExecArray | null = copy.exec(clause);
      while (match) {
        const landmark = nearestLandmark(match.index, hits, lastLandmark);
        const site = resolveSiteIdentity(
          landmark,
          event.location.description,
          event.location.mgrs,
        );
        const key = `${site.siteKey}:${rule.kind}`;
        if (!seen.has(key)) {
          seen.add(key);
          claims.push({
            eventId: event.event_id,
            vector: event.vector_type,
            sourceId: event.source_id,
            landmark: site.landmark,
            siteKey: site.siteKey,
            siteLabel: site.siteLabel,
            kind: rule.kind,
            confidence: event.confidence_score,
            opinion: opinionFactory(event, rule.kind),
            admiralty,
            integrityHash,
            excerpt: excerptAround(clause, new RegExp(rule.pattern.source, "i")),
          });
        }
        match = copy.exec(clause);
      }
    }
  }

  if (claims.length === 0) {
    const site = resolveSiteIdentity(
      fallback,
      event.location.description,
      event.location.mgrs,
    );
    claims.push({
      eventId: event.event_id,
      vector: event.vector_type,
      sourceId: event.source_id,
      landmark: site.landmark,
      siteKey: site.siteKey,
      siteLabel: site.siteLabel,
      kind: "presence",
      confidence: event.confidence_score,
      opinion: opinionFactory(event, "presence"),
      admiralty,
      integrityHash,
      excerpt: event.payload.slice(0, 140),
    });
  }

  return claims;
}

export function sidcForEntity(kind: EntityKind, corroborated: boolean): {
  sidc: string;
  cotType: string;
} {
  const affil = corroborated ? "H" : "S";
  const cotAffil = corroborated ? "h" : "s";
  switch (kind) {
    case "RPK":
    case "PKM":
    case "DSHK":
    case "HEAVY_WEAPONS":
      return {
        sidc: `S${affil}GPEWRM--*****`,
        cotType: `a-${cotAffil}-G-E-W-R`,
      };
    case "MANPADS":
      return {
        sidc: `S${affil}GPEWMA--*****`,
        cotType: `a-${cotAffil}-G-E-W-M-A`,
      };
    case "MORTAR":
      return {
        sidc: `S${affil}GPEWO---*****`,
        cotType: `a-${cotAffil}-G-E-W-O`,
      };
    case "RPG":
      return {
        sidc: `S${affil}GPEWLA--*****`,
        cotType: `a-${cotAffil}-G-E-W-L`,
      };
    case "IED":
      return {
        sidc: `S${affil}GPEXI---*****`,
        cotType: `a-${cotAffil}-G-E-X-I`,
      };
    case "SNIPER":
    case "INFANTRY":
      return {
        sidc: `S${affil}GPUCI---*****`,
        cotType: `a-${cotAffil}-G-U-C-I`,
      };
    case "SANDBAGS":
      return {
        sidc: `S${affil}GPI-----*****`,
        cotType: `a-${cotAffil}-G-I`,
      };
    case "DRONE":
      return {
        sidc: `S${affil}APMFQ---*****`,
        cotType: `a-${cotAffil}-A-M-F-Q`,
      };
    case "ANTENNA":
      return {
        sidc: `SJPGPEES--*****`,
        cotType: `a-j-G-E-S`,
      };
    case "VAN":
      return {
        sidc: `SUGPEV----*****`,
        cotType: `a-u-G-E-V`,
      };
    case "CELL_CLUSTER":
      return {
        sidc: `SNGPUC----*****`,
        cotType: `a-n-G-U-C`,
      };
    default:
      return assertNever(kind, "entity kind");
  }
}

export function extractEntities(
  events: TiseEvent[],
  precomputedClaims?: Claim[],
): DetectedEntity[] {
  const buckets = new Map<string, DetectedEntity>();

  for (const event of events) {
    const fallback = inferLandmark(
      event.location.description,
      event.location.description,
    );
    const adm = eventAdmiralty(event);
    const hash = eventIntegrityHash(event);
    const cite = formatIcd206Citation({
      sourceId: event.source_id,
      eventId: event.event_id,
      admiraltyCode: adm.code,
      integrityHash: hash,
    });

    let lastLandmark = fallback;
    for (const clause of splitClauses(event.payload)) {
      const hits = landmarkHitsIn(clause);
      lastLandmark = lastMentionedLandmark(hits, lastLandmark);
      for (const rule of ENTITY_RULES) {
        const copy = new RegExp(rule.pattern.source, "ig");
        const match = copy.exec(clause);
        if (!match) continue;
        const landmark = nearestLandmark(match.index, hits, lastLandmark);
        const site = resolveSiteIdentity(
          landmark,
          event.location.description,
          event.location.mgrs,
        );
        const key = `${rule.kind}:${site.siteKey}`;
        const existing = buckets.get(key);
        if (!existing) {
          const sym = sidcForEntity(rule.kind, false);
          buckets.set(key, {
            kind: rule.kind,
            landmark: site.landmark,
            siteKey: site.siteKey,
            siteLabel: site.siteLabel,
            confidence: event.confidence_score,
            opinion: defaultOpinionFromConfidence(event.confidence_score),
            vectors: [event.vector_type],
            corroborated: false,
            sidc: sym.sidc,
            cotType: sym.cotType,
            citations: [cite],
          });
          continue;
        }
        if (!existing.vectors.includes(event.vector_type)) {
          existing.vectors.push(event.vector_type);
        }
        if (!existing.citations.includes(cite)) {
          existing.citations.push(cite);
        }
        existing.confidence = Math.max(
          existing.confidence,
          event.confidence_score,
        );
      }
    }
  }

  const claims = precomputedClaims ?? events.flatMap((ev) => extractClaims(ev));
  return reinforceEntities([...buckets.values()], claims);
}

const POSITIVE_KINDS: AssertionKind[] = [
  "presence",
  "thermal_positive",
  "em_active",
  "static_defense",
  "movement",
];

export function reinforceEntities(
  entities: DetectedEntity[],
  claims: Claim[],
): DetectedEntity[] {
  return entities.map((entity) => {
    const support = claims.filter(
      (claim) =>
        claim.siteKey === entity.siteKey && POSITIVE_KINDS.includes(claim.kind),
    );
    const vectors = [
      ...new Set([...entity.vectors, ...support.map((claim) => claim.vector)]),
    ];
    const corroborated = vectors.length >= 2 && entity.kind !== "CELL_CLUSTER";
    const sym = sidcForEntity(entity.kind, corroborated);
    const citations = [
      ...new Set([
        ...entity.citations,
        ...support.map((claim) =>
          formatIcd206Citation({
            sourceId: claim.sourceId,
            eventId: claim.eventId,
            admiraltyCode: claim.admiralty.code,
            integrityHash: claim.integrityHash,
          }),
        ),
      ]),
    ];
    return {
      ...entity,
      vectors,
      confidence: Math.max(
        entity.confidence,
        ...support.map((claim) => claim.confidence),
        0,
      ),
      corroborated,
      sidc: sym.sidc,
      cotType: sym.cotType,
      citations,
    };
  });
}

export function entityLabel(kind: EntityKind): string {
  switch (kind) {
    case "RPK":
      return "RPK signature";
    case "PKM":
      return "PKM signature";
    case "DSHK":
      return "DShK / 12.7mm";
    case "MANPADS":
      return "MANPADS-type RF";
    case "IED":
      return "IED indicator";
    case "RPG":
      return "RPG";
    case "DRONE":
      return "UAV / drone";
    case "SNIPER":
      return "sniper";
    case "MORTAR":
      return "mortar";
    case "INFANTRY":
      return "infantry";
    case "HEAVY_WEAPONS":
      return "heavy weapons";
    case "SANDBAGS":
      return "sandbag fighting position";
    case "ANTENNA":
      return "antenna / repeater";
    case "VAN":
      return "van";
    case "CELL_CLUSTER":
      return "cellular cluster";
    default:
      return assertNever(kind, "entity");
  }
}
