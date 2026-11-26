import type { MgrsPoint } from "@/lib/tise/types";

/**
 * Display datum for the training chart.
 *
 * Vignette MGRS strings geocode to downtown Washington, DC. Callers pass
 * those latitudes and longitudes in, and this module keeps only the relative
 * north/east meter offsets. The offsets are drawn on the Fort Irwin / Mojave
 * NTC training AOI so unit markers never land on that city or any other real
 * street grid. Relative MGRS geometry remains training-only.
 */

export type LatLon = {
  readonly lat: number;
  readonly lon: number;
};

/** Fort Irwin NTC · Tiefort Mountains / Central Corridor interface. */
export const trainingAnchor: LatLon = {
  lat: 35.3,
  lon: -116.57,
};

export const TRAINING_AOI_LABEL = "Fort Irwin NTC · Mojave";

/** Hemisphere-aware lat/lon for console HUD and cluster footers. */
export function formatLatLon(point: LatLon, digits = 4): string {
  const latHemisphere = point.lat >= 0 ? "N" : "S";
  const lonHemisphere = point.lon >= 0 ? "E" : "W";
  return `${Math.abs(point.lat).toFixed(digits)}°${latHemisphere}, ${Math.abs(point.lon).toFixed(digits)}°${lonHemisphere}`;
}

/** Equirectangular meters per degree of latitude. */
export const METERS_PER_DEGREE_LAT = 111_320;

const CELL_METERS = 100;
const MAX_GRID_SPAN = 24;

/** Literal geocode of the vignette grid. Never a display coordinate. */
const WASHINGTON_DC = {
  minLat: 38.7,
  maxLat: 39.15,
  minLon: -77.25,
  maxLon: -76.85,
} as const;

export type CellSquare = {
  readonly cell100m: string;
  readonly easting100m: number;
  readonly northing100m: number;
  readonly polygon: readonly LatLon[];
};

export function metersPerDegreeLon(latitude: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
}

export function liesOnWashingtonDc(point: LatLon): boolean {
  return (
    point.lat >= WASHINGTON_DC.minLat &&
    point.lat <= WASHINGTON_DC.maxLat &&
    point.lon >= WASHINGTON_DC.minLon &&
    point.lon <= WASHINGTON_DC.maxLon
  );
}

/** Mean of the points currently in view. An empty set stays on the anchor. */
export function localOrigin(points: readonly LatLon[]): LatLon {
  if (points.length === 0) return trainingAnchor;
  let lat = 0;
  let lon = 0;
  for (const point of points) {
    lat += point.lat;
    lon += point.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}

/**
 * North/east meters of `point` relative to `origin`.
 * Latitude uses 111_320 m/deg. Longitude uses the origin latitude so the
 * offset is a local ground distance, not a degree delta.
 */
export function relativeMeters(
  point: LatLon,
  origin: LatLon,
): { east: number; north: number } {
  return {
    north: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT,
    east: (point.lon - origin.lon) * metersPerDegreeLon(origin.lat),
  };
}

/**
 * Re-anchor `point` onto the training datum.
 * `point` and `origin` are source coordinates from parseMgrs(), never
 * coordinates that were already shifted. Display longitude is scaled by
 * cos(anchor latitude), so a meter measured here is a meter on the anchor.
 */
export function toDisplayLatLon(point: LatLon, origin: LatLon): LatLon {
  const { east, north } = relativeMeters(point, origin);
  return {
    lat: trainingAnchor.lat + north / METERS_PER_DEGREE_LAT,
    lon: trainingAnchor.lon + east / metersPerDegreeLon(trainingAnchor.lat),
  };
}

/** Distance on the training datum, using the anchor's longitude scale. */
export function equirectangularMeters(a: LatLon, b: LatLon): number {
  const north = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
  const east = (b.lon - a.lon) * metersPerDegreeLon(trainingAnchor.lat);
  return Math.hypot(north, east);
}

function positiveMod(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

function squareFromSouthwest(
  southwest: LatLon,
  origin: LatLon,
  sizeMeters: number,
): LatLon[] {
  const lonScale = metersPerDegreeLon(origin.lat);
  const corners: LatLon[] = [
    southwest,
    {
      lat: southwest.lat,
      lon: southwest.lon + sizeMeters / lonScale,
    },
    {
      lat: southwest.lat + sizeMeters / METERS_PER_DEGREE_LAT,
      lon: southwest.lon + sizeMeters / lonScale,
    },
    {
      lat: southwest.lat + sizeMeters / METERS_PER_DEGREE_LAT,
      lon: southwest.lon,
    },
  ];
  return corners.map((corner) => toDisplayLatLon(corner, origin));
}

/** 100m MGRS cell containing `point`, in display coordinates. */
export function cellPolygon(point: MgrsPoint, origin: LatLon): LatLon[] {
  const eastWithin = positiveMod(point.easting, CELL_METERS);
  const northWithin = positiveMod(point.northing, CELL_METERS);
  const lonScale = metersPerDegreeLon(origin.lat);
  const southwest: LatLon = {
    lat: point.lat - northWithin / METERS_PER_DEGREE_LAT,
    lon: point.lon - eastWithin / lonScale,
  };
  return squareFromSouthwest(southwest, origin, CELL_METERS);
}

/**
 * Every 100m square in the inclusive index range, measured from `reference`
 * in the same grid square. Returns nothing when the span is too large to
 * draw as a city block; callers then plot occupied cells only.
 */
export function gridCellPolygons(
  reference: MgrsPoint,
  minEasting100m: number,
  maxEasting100m: number,
  minNorthing100m: number,
  maxNorthing100m: number,
  origin: LatLon,
): CellSquare[] {
  const spanE = maxEasting100m - minEasting100m;
  const spanN = maxNorthing100m - minNorthing100m;
  if (
    !Number.isFinite(spanE) ||
    !Number.isFinite(spanN) ||
    spanE < 0 ||
    spanN < 0 ||
    spanE > MAX_GRID_SPAN ||
    spanN > MAX_GRID_SPAN
  ) {
    return [];
  }

  const squares: CellSquare[] = [];
  for (let easting100m = minEasting100m; easting100m <= maxEasting100m; easting100m += 1) {
    for (
      let northing100m = minNorthing100m;
      northing100m <= maxNorthing100m;
      northing100m += 1
    ) {
      const lonScale = metersPerDegreeLon(origin.lat);
      const southwest: LatLon = {
        lat:
          reference.lat +
          (northing100m * CELL_METERS - reference.northing) / METERS_PER_DEGREE_LAT,
        lon:
          reference.lon +
          (easting100m * CELL_METERS - reference.easting) / lonScale,
      };
      squares.push({
        cell100m: `${reference.gzd} ${reference.square} ${easting100m
          .toString()
          .padStart(3, "0")} ${northing100m.toString().padStart(3, "0")}`,
        easting100m,
        northing100m,
        polygon: squareFromSouthwest(southwest, origin, CELL_METERS),
      });
    }
  }
  return squares;
}
