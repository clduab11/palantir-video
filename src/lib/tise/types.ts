import type {
  AdmiraltyRating,
  AnalyticConfidence,
  InfoCredibility,
  SourceReliability,
} from "@/lib/interop/tradecraft";

export const VECTOR_TYPES = ["SIGINT", "HUMINT", "GEOINT"] as const;
export type VectorType = (typeof VECTOR_TYPES)[number];

export const THREAT_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ThreatLevel = (typeof THREAT_LEVELS)[number];

export const POSTURES = ["HOLD", "MANEUVER", "STRIKE", "WITHDRAW"] as const;
export type Posture = (typeof POSTURES)[number];

export const DECEPTION_RISKS = ["LOW", "MEDIUM", "HIGH"] as const;
export type DeceptionRisk = (typeof DECEPTION_RISKS)[number];

export const WHALEY_CLASSES = [
  "DECOYING",
  "MIMICKING",
  "INVENTING",
  "MASKING",
  "REPACKAGING",
  "DAZZLING",
  "NONE",
] as const;
export type WhaleyDeceptionClass = (typeof WHALEY_CLASSES)[number];

export type Opinion = {
  readonly b: number;
  readonly d: number;
  readonly u: number;
  readonly a: number;
  readonly projected: number;
};

export type DeceptionAssessment = {
  readonly eventId: string;
  readonly sourceId: string;
  readonly vector: VectorType;
  readonly siteKey: string;
  readonly siteLabel: string;
  readonly conflictDrop: number;
  readonly entropyDelta: number;
  readonly falsityScore: number;
  readonly whaleyClass: WhaleyDeceptionClass;
  readonly rationale: string;
};

export const ACH_HYPOTHESES = [
  "H1_PREPARED_DEFENSE",
  "H2_COORDINATED_AMBUSH",
  "H3_DECEPTION_FEINT",
  "H4_STALE_OR_VACANT",
] as const;
export type HypothesisId = (typeof ACH_HYPOTHESES)[number];

export type HypothesisScore = {
  readonly id: HypothesisId;
  readonly label: string;
  readonly description: string;
  readonly posterior: number;
  readonly opinion: Opinion;
  readonly supportingEvents: string[];
  readonly refutingEvents: string[];
};

export type RankedCollectionGap = {
  readonly id: string;
  readonly siteKey: string;
  readonly siteLabel: string;
  readonly recommendedSensor: "EO_IR_UAV" | "GROUND_RECON" | "SIGINT_DF" | "IMINT_PASS";
  readonly expectedInfoGainBits: number;
  readonly resolvesHypotheses: HypothesisId[];
  readonly summary: string;
};

export type AchEvaluation = {
  readonly hypotheses: HypothesisScore[];
  readonly leadingHypothesis: HypothesisId;
  readonly entropyBits: number;
  readonly maxEntropyBits: number;
  readonly conflictMassC0: number;
  readonly rankedGaps: RankedCollectionGap[];
};

export type TiseLocation = {
  mgrs: string;
  description: string;
  lat?: number;
  lon?: number;
};

export type TiseEvent = {
  event_id: string;
  timestamp: string;
  vector_type: VectorType;
  source_id: string;
  location: TiseLocation;
  payload: string;
  confidence_score: number;
  provenance: string;
  perceived_threat_level: ThreatLevel;
  source_reliability?: SourceReliability;
  info_credibility?: InfoCredibility;
  integrity_hash?: string;
};

export type EnrichedEvent = TiseEvent & {
  readonly integrityHash: string;
  readonly admiralty: AdmiraltyRating;
  readonly ageMinutes: number;
  readonly temporalWeight: number;
  readonly quarantined: boolean;
  readonly deception?: DeceptionAssessment;
};

export type Rejection = {
  index: number;
  event_id?: string;
  reason: string;
  missing: string[];
};

export type MgrsPoint = {
  gzd: string;
  square: string;
  easting: number;
  northing: number;
  precisionMeters: number;
  compact: string;
  cell100m: string;
  cell1km: string;
  easting100m: number;
  northing100m: number;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
};

export const LANDMARKS = [
  "WAREHOUSE_7",
  "BUILDING_12",
  "MARKET_SQUARE",
  "OVERPASS",
  "MOSQUE_COURTYARD",
  "RAIL_DEPOT",
  "WATER_TOWER",
  "CLINIC_ANNEX",
  "SUBSTATION_4",
  "INDUSTRIAL_YARD",
  "BRIDGE_NORTH",
  "CUSTOM_SECTOR",
  "UNKNOWN",
] as const;
export type Landmark = (typeof LANDMARKS)[number];

export const ASSERTION_KINDS = [
  "presence",
  "absence",
  "em_active",
  "em_none",
  "thermal_positive",
  "thermal_none",
  "movement",
  "static_defense",
  "decoy",
  "civilian",
  "ambush",
] as const;
export type AssertionKind = (typeof ASSERTION_KINDS)[number];

export type Claim = {
  eventId: string;
  vector: VectorType;
  sourceId: string;
  landmark: Landmark;
  siteKey: string;
  siteLabel: string;
  kind: AssertionKind;
  confidence: number;
  opinion: Opinion;
  admiralty: AdmiraltyRating;
  integrityHash: string;
  excerpt: string;
};

export const ENTITY_KINDS = [
  "RPK",
  "PKM",
  "DSHK",
  "MANPADS",
  "IED",
  "RPG",
  "DRONE",
  "SNIPER",
  "MORTAR",
  "INFANTRY",
  "HEAVY_WEAPONS",
  "SANDBAGS",
  "ANTENNA",
  "VAN",
  "CELL_CLUSTER",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type DetectedEntity = {
  kind: EntityKind;
  landmark: Landmark;
  siteKey: string;
  siteLabel: string;
  confidence: number;
  opinion: Opinion;
  vectors: VectorType[];
  corroborated: boolean;
  sidc: string;
  cotType: string;
  citations: string[];
};

export type ConflictEntry = {
  landmark: Landmark;
  siteKey: string;
  siteLabel: string;
  summary: string;
  left: Claim;
  right: Claim;
  class: "presence_absence" | "em_without_physical" | "uncorroborated" | "spoof";
  dempsterConflictK: number;
  whaleyClass: WhaleyDeceptionClass;
};

export type Cluster = {
  id: string;
  cell100m: string;
  cell1km: string;
  landmark: Landmark;
  siteKey: string;
  siteLabel: string;
  events: TiseEvent[];
  vectors: VectorType[];
  veracity: number;
  opinion: Opinion;
  admiraltyCode: string;
  sidc: string;
  cotType: string;
  hot: boolean;
  noStrike: boolean;
  centroid: {
    easting100m: number;
    northing100m: number;
    lat: number;
    lon: number;
  };
};

export type KineticTrigger = {
  condition: string;
  action: string;
  armed: boolean;
};

export type OntologyObjectKind =
  | "FACILITY"
  | "WEAPON_SIGNATURE"
  | "EMITTER"
  | "CIVILIAN_ZONE"
  | "COLLECTION_GAP";

export type OntologyObject = {
  readonly id: string;
  readonly kind: OntologyObjectKind;
  readonly label: string;
  readonly siteKey: string;
  readonly mgrs: string;
  readonly lat: number;
  readonly lon: number;
  readonly sidc: string;
  readonly opinion: Opinion;
  readonly admiraltyCode: string;
  readonly eventIds: string[];
  readonly hashes: string[];
};

export type OntologyLinkRelation =
  | "CORROBORATES"
  | "CONTRADICTS"
  | "SPOOFS"
  | "BLOCKS_STRIKE"
  | "TASKS_COLLECTION";

export type OntologyLink = {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relation: OntologyLinkRelation;
  readonly weight: number;
  readonly detail: string;
};

export type OntologyGraph = {
  readonly objects: OntologyObject[];
  readonly links: OntologyLink[];
};

export type Sitrep = {
  sitrepId: string;
  timestamp: string;
  aoi: string;
  analyticConfidence: AnalyticConfidence;
  estimativeAssessment: string;
  threatSurface: {
    detectedEntities: string[];
    threatLevel: ThreatLevel;
    enemyPosture: string;
  };
  friction: {
    conflictLog: string[];
    deceptionRisk: DeceptionRisk;
    dataDecay: string[];
  };
  kineticTriggers: KineticTrigger[];
  verificationGaps: string[];
  recommendedPosture: Posture;
  postureRationale: string;
  sourceSummaryEndnotes: string[];
};

export type EngineOptions = {
  now?: Date;
  timeWindowMs?: number;
  noiseConfidence?: number;
  staleMs?: number;
  quarantinedEventIds?: readonly string[];
  quarantinedSourceIds?: readonly string[];
};

export type SynthesisResult = {
  accepted: TiseEvent[];
  enrichedEvents: EnrichedEvent[];
  quarantinedEvents: TiseEvent[];
  rejected: Rejection[];
  discardedNoise: TiseEvent[];
  clusters: Cluster[];
  claims: Claim[];
  conflicts: ConflictEntry[];
  deceptionAssessments: DeceptionAssessment[];
  ach: AchEvaluation;
  ontology: OntologyGraph;
  entities: DetectedEntity[];
  sitrep: Sitrep;
  sitrepText: string;
  asOf: string;
  computeMs: number;
  sample: boolean;
};
