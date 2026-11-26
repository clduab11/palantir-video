import { describe, expect, it } from "vitest";

import {
  cellPolygon,
  equirectangularMeters,
  gridCellPolygons,
  liesOnWashingtonDc,
  localOrigin,
  METERS_PER_DEGREE_LAT,
  metersPerDegreeLon,
  relativeMeters,
  toDisplayLatLon,
  trainingAnchor,
} from "@/lib/interop/training-chart";
import { parseMgrs } from "@/lib/tise/mgrs";

function requireMgrs(raw: string) {
  const point = parseMgrs(raw);
  if (!point) throw new Error(`expected MGRS to parse: ${raw}`);
  return point;
}

describe("training chart datum", () => {
  it("keeps a 100m relative offset about 100m apart on the ocean anchor", () => {
    const origin = { lat: 38.89, lon: -77.03 };
    const point = {
      lat: origin.lat + 100 / METERS_PER_DEGREE_LAT,
      lon: origin.lon + 100 / metersPerDegreeLon(origin.lat),
    };
    const displayedOrigin = toDisplayLatLon(origin, origin);
    const displayedPoint = toDisplayLatLon(point, origin);

    expect(displayedOrigin).toEqual(trainingAnchor);
    expect(equirectangularMeters(displayedOrigin, displayedPoint)).toBeCloseTo(
      Math.hypot(100, 100),
      4,
    );
    expect(displayedPoint.lat).toBeCloseTo(
      trainingAnchor.lat + 100 / METERS_PER_DEGREE_LAT,
      8,
    );
    expect(displayedPoint.lon).toBeCloseTo(
      trainingAnchor.lon + 100 / metersPerDegreeLon(trainingAnchor.lat),
      8,
    );
    expect(liesOnWashingtonDc(displayedPoint)).toBe(false);
  });

  it("keeps real 100m MGRS steps about 100m apart after re-anchoring", () => {
    const south = requireMgrs("18S UJ 23481 06512");
    const north = requireMgrs("18S UJ 23481 06612");
    const east = requireMgrs("18S UJ 23581 06512");
    const origin = localOrigin([south, north, east]);

    const displayedSouth = toDisplayLatLon(south, origin);
    const displayedNorth = toDisplayLatLon(north, origin);
    const displayedEast = toDisplayLatLon(east, origin);

    const northMeters = Math.hypot(
      relativeMeters(north, origin).north - relativeMeters(south, origin).north,
      relativeMeters(north, origin).east - relativeMeters(south, origin).east,
    );
    const eastMeters = Math.hypot(
      relativeMeters(east, origin).north - relativeMeters(south, origin).north,
      relativeMeters(east, origin).east - relativeMeters(south, origin).east,
    );

    expect(northMeters).toBeGreaterThan(99);
    expect(northMeters).toBeLessThan(102);
    expect(eastMeters).toBeGreaterThan(98);
    expect(eastMeters).toBeLessThan(102);
    expect(equirectangularMeters(displayedSouth, displayedNorth)).toBeCloseTo(
      northMeters,
      3,
    );
    expect(equirectangularMeters(displayedSouth, displayedEast)).toBeCloseTo(
      eastMeters,
      3,
    );
    expect(displayedNorth.lat).toBeGreaterThan(displayedSouth.lat);
    expect(displayedEast.lon).toBeGreaterThan(displayedSouth.lon);
  });

  it("does not plot the vignette on Washington, DC", () => {
    const source = requireMgrs("18S UJ 23481 06512");
    expect(liesOnWashingtonDc(source)).toBe(true);

    const origin = localOrigin([source]);
    const displayed = toDisplayLatLon(source, origin);
    expect(displayed).toEqual(trainingAnchor);
    expect(liesOnWashingtonDc(displayed)).toBe(false);
    expect(Math.abs(displayed.lat - source.lat)).toBeGreaterThan(2);
    expect(Math.abs(displayed.lon - source.lon)).toBeGreaterThan(10);

    for (const corner of cellPolygon(source, origin)) {
      expect(liesOnWashingtonDc(corner)).toBe(false);
    }
  });

  it("draws a 100m cell and matches the grid square", () => {
    const point = requireMgrs("18S UJ 23481 06512");
    const north = requireMgrs("18S UJ 23481 06612");
    const origin = localOrigin([point, north]);
    const polygon = cellPolygon(point, origin);
    expect(polygon).toHaveLength(4);
    const southwest = polygon[0];
    const southeast = polygon[1];
    const northeast = polygon[2];
    if (!southwest || !southeast || !northeast) {
      throw new Error("cell polygon missing corners");
    }
    expect(equirectangularMeters(southwest, southeast)).toBeCloseTo(100, 3);
    expect(equirectangularMeters(southeast, northeast)).toBeCloseTo(100, 3);

    const [square] = gridCellPolygons(
      point,
      point.easting100m,
      point.easting100m,
      point.northing100m,
      point.northing100m,
      origin,
    );
    expect(square?.cell100m).toBe(point.cell100m);
    expect(square?.polygon[0]?.lat).toBeCloseTo(southwest.lat, 6);
    expect(square?.polygon[0]?.lon).toBeCloseTo(southwest.lon, 6);
    expect(localOrigin([])).toEqual(trainingAnchor);
  });
});
